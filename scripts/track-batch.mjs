#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createTracker, TrackingError } from '../dist/node.js';

function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      field = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i += 1;
    } else {
      field += char;
    }
  }
  if (quoted) throw new TypeError('The input file has an unclosed quoted field');
  row.push(field);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

function normalizedHeader(value) {
  return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function readShipments(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  let inQuotes = false;
  let tabs = 0;
  let commas = 0;
  for (let i = 0; i < firstLine.length; i += 1) {
    if (firstLine[i] === '"' && firstLine[i + 1] === '"' && inQuotes) {
      i += 1;
    } else if (firstLine[i] === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && firstLine[i] === '\t') {
      tabs += 1;
    } else if (!inQuotes && firstLine[i] === ',') {
      commas += 1;
    }
  }
  const delimiter = tabs > commas ? '\t' : ',';
  const [headers, ...records] = parseRows(text, delimiter);
  if (!headers) throw new TypeError('The input file is empty');

  const columns = new Map(headers.map((header, index) => [normalizedHeader(header), index]));
  const trackingIndex = ['tracking', 'trackingnumber', 'trackingno', 'trackingid', 'number']
    .map(header => columns.get(header)).find(index => index !== undefined);
  if (trackingIndex === undefined) throw new TypeError('No tracking-number column was found');

  const findColumn = (...names) => names.map(name => columns.get(name)).find(index => index !== undefined);
  const recipientIndex = findColumn('recipient', 'name');
  const companyIndex = findColumn('company', 'business');
  const campaignIndex = findColumn('campaign');
  const carrierIndex = findColumn('carrier');

  return records.flatMap((values, index) => {
    const number = values[trackingIndex]?.trim();
    if (!number) return [];
    return [{
      row: index + 2,
      number,
      recipient: values[recipientIndex]?.trim() ?? '',
      company: values[companyIndex]?.trim() ?? '',
      campaign: values[campaignIndex]?.trim() ?? '',
      carrier: values[carrierIndex]?.trim() || undefined,
    }];
  });
}

function setting(name, fallback, maximum) {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) throw new TypeError(`${name} must be a whole number`);
  const number = Number(value);
  if (number > maximum) throw new TypeError(`${name} must not exceed ${maximum}`);
  return number;
}

function quoteTsv(value) {
  const text = String(value ?? '');
  return /[\t"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function resultRow(shipment, result) {
  return {
    row: shipment.row,
    recipient: shipment.recipient,
    company: shipment.company,
    campaign: shipment.campaign,
    carrier: result.carrier,
    status: result.result.current_stage ?? result.result.status ?? 'unknown',
    last_status: result.result.last_status_text ?? '',
    expected_delivery: result.result.expected_delivery ?? '',
    source: result.source,
    failure: '',
  };
}

function failedRow(shipment, error) {
  const trackingError = error instanceof TrackingError;
  const errorObject = error && typeof error === 'object' ? error : {};
  return {
    row: shipment.row,
    recipient: shipment.recipient,
    company: shipment.company,
    campaign: shipment.campaign,
    carrier: shipment.carrier ?? errorObject.hint?.carrier ?? '',
    status: 'unresolved',
    last_status: '',
    expected_delivery: '',
    source: trackingError ? error.attempts.map(attempt => attempt.source).join(', ') : '',
    failure: trackingError ? error.hint.kind : errorObject.name ?? 'Error',
  };
}

export async function main(argv = process.argv.slice(2)) {
  const [inputPath, ...extra] = argv;
  if (inputPath === '--help' || inputPath === '-h') {
    console.log('Usage: node scripts/track-batch.mjs <export.csv|export.tsv>');
    return;
  }
  if (!inputPath || extra.length) {
    throw new TypeError('Usage: node scripts/track-batch.mjs <export.csv|export.tsv>');
  }
  const shipments = readShipments(await readFile(inputPath, 'utf8'));
  if (shipments.length === 0) throw new TypeError('No tracking numbers were found in the input file');

  const budgetMs = setting('PARCEL_LOOKUP_BUDGET_MS', 30_000, 120_000);
  const delayMs = setting('PARCEL_BATCH_DELAY_MS', 30_000, 60_000);
  const providers = process.env.SCRAPER_PROVIDERS?.split(',').map(value => value.trim()).filter(Boolean);
  const tracker = createTracker({
    env: process.env,
    trawlUrl: process.env.FLARESOLVERR_URL,
    chromiumPath: process.env.TRACKING_CHROMIUM_PATH,
    userAgent: process.env.SCRAPER_USER_AGENT,
    providers,
  });
  const output = [];
  let delivered = 0;
  let unresolved = 0;

  console.error(`Checking ${shipments.length} shipments sequentially; results will not include tracking numbers.`);
  for (let index = 0; index < shipments.length; index += 1) {
    const shipment = shipments[index];
    try {
      const result = await tracker.track(
        { number: shipment.number, ...(shipment.carrier ? { carrier: shipment.carrier } : {}) },
        { budgetMs },
      );
      const row = resultRow(shipment, result);
      if (row.status === 'delivered') delivered += 1;
      output.push(row);
    } catch (error) {
      unresolved += 1;
      output.push(failedRow(shipment, error));
    }
    console.error(`Checked ${index + 1}/${shipments.length}`);
    if (index + 1 < shipments.length && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  const headers = ['row', 'recipient', 'company', 'campaign', 'carrier', 'status', 'last_status',
    'expected_delivery', 'source', 'failure'];
  console.log([headers, ...output.map(row => headers.map(header => row[header] ?? ''))]
    .map(row => row.map(quoteTsv).join('\t')).join('\n'));
  console.error(`Finished: ${shipments.length} checked, ${delivered} delivered, ${unresolved} unresolved.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Batch tracking failed');
    process.exitCode = 1;
  }
}
