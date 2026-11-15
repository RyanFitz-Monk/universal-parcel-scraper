import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { paddedDate } from '../../core/time/fields.js';
import { calendarDay, countryCode } from '../../core/time/index.js';
import { clean } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { foursidesStage } from './status.js';

export const PROVIDER = '4Sides';
// A reply with a full history is about a kilobyte.
export const FOURSIDES_MAX_BYTES = 256 * 1024;
// The tracker's own check, in its form and in its lookup: FS or FE, nine digits and RU.
const NUMBER = /^F[SE]\d{9}RU$/;
const DAY = /^(\d{2})-(\d{2})-(\d{4})$/;
// The lookup's answer for a waybill it does not know, in place of the number.
const MISSING = /^Не найдено\s+(\S+)$/u;
const WEIGHT = /^\d{1,5}(?:[.,]\d{1,3})?$/;
// A clause naming who took the parcel: "получил: …".
const RECEIVER = /(?<!\p{L})(?:получил|получила|получатель|принял|приняла|вручено)\s*:/iu;
const MAX_ROWS = 200;

/** A waybill number for 4Sides' tracker; anything else is not one 4Sides issues. */
export function normalizeFoursidesNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (!NUMBER.test(number)) throw new InvalidInputError(PROVIDER, '4Sides waybills are FS or FE, nine digits and RU');
  return number;
}

/** A text field; anything but a string is a changed reply. */
function text(row: Record<string, unknown>, key: string, maxLength = 300): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new SchemaError(PROVIDER, `4Sides returned an invalid ${key}`);
  return clean(value, maxLength);
}

/** A calendar day the reply writes as dd-mm-yyyy, or null for none. */
function day(value: string, what: string): string | null {
  if (!value) return null;
  const match = DAY.exec(paddedDate(value));
  const iso = match ? calendarDay(Number(match[3]), Number(match[2]), Number(match[1])) : null;
  if (!iso || iso < '2000-01-01') throw new SchemaError(PROVIDER, `4Sides returned an invalid ${what}`);
  return iso;
}

/** The text in brackets that opens at `open`, and where it ends; an unclosed bracket runs to the end. */
function bracketed(value: string, open: number): { inner: string; end: number } {
  let depth = 0;
  for (let index = open; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')' && --depth === 0) return { inner: value.slice(open + 1, index), end: index + 1 };
  }
  return { inner: value.slice(open + 1), end: value.length };
}

/** The clauses of a bracket, split at its own commas, not those of a town's region. */
function clauses(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    else if (value[index] === ')') depth = Math.max(0, depth - 1);
    else if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => clean(part)).filter(Boolean);
}

/** A scan's wording and town, with who took the parcel and the wording before them, which carries the stage. */
export interface FoursidesWording { description: string; location: string; stated?: string; signer?: string }

const TRAIL = /[\s,;:.–-]+$/;

/**
 * A scan's wording and town. The tracker writes a scan as its event, then in
 * brackets the shipment's state and labelled clauses: "Приём (В СЦ, в городе:
 * Town (Region))", "Попытка доставки (Доставлено, получил: Name)". The wording
 * keeps the event, the state and who took the parcel; the town is the scan's
 * place. Any other clause is dropped.
 */
export function foursidesWording(status: string): FoursidesWording {
  const value = clean(status);
  const open = value.indexOf('(');
  const head = open < 0 ? value : value.slice(0, open);
  const receiver = RECEIVER.exec(head);
  if (receiver) {
    // Who took the parcel follows the event; the rest of the wording is theirs.
    const signer = clean(value.slice(receiver.index + receiver[0].length), 120);
    const stated = clean(head.slice(0, receiver.index)).replace(TRAIL, '');
    return { description: value, location: '', ...(signer ? { stated, signer } : {}) };
  }
  const event = clean(head).replace(TRAIL, '');
  let state = '';
  let location = '';
  let taker = '';
  let signer = '';
  if (open >= 0) {
    const parts = clauses(bracketed(value, open).inner);
    for (const [index, clause] of parts.entries()) {
      const who = RECEIVER.exec(clause);
      if (who?.index === 0) {
        // Who took the parcel, and every clause after it, which can part their name.
        taker = parts.slice(index).join(', ');
        signer = clean(taker.slice(who[0].length), 120);
        break;
      }
      const labelled = /^([^:()]{1,40}):\s*([\s\S]*)$/.exec(clause);
      if (!labelled) {
        // The first unlabelled clause is the state.
        state ||= clause;
        continue;
      }
      if (labelled[1]!.toLowerCase().replaceAll('ё', 'е').trim() === 'в городе') location ||= clean(labelled[2], 120);
    }
  }
  const worded = (inner: string) => (event && inner ? `${event} (${inner})` : event || inner);
  const description = worded([state, taker].filter(Boolean).join(', '));
  return { description, location, ...(signer ? { stated: worded(state), signer } : {}) };
}

// Country names as the tracker writes them, in Russian, by ISO code.
let russianCountries: Map<string, string> | undefined;

/** The ISO code of the destination country the reply names, or null when no name reads as one. */
function destinationCountry(name: string): string | null {
  if (!russianCountries) {
    russianCountries = new Map();
    const names = new Intl.DisplayNames(['ru'], { type: 'region' });
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        const label = names.of(code);
        if (label && label !== code && countryCode(code) === code) russianCountries.set(label.toLowerCase().replaceAll('ё', 'е'), code);
      }
    }
  }
  return countryCode(name) ?? russianCountries.get(name.toLowerCase().replaceAll('ё', 'е')) ?? null;
}

/** The weight in kilograms, which the reply writes as text; none for a blank or unreadable one. */
function weight(value: string): number | null {
  if (!WEIGHT.test(value)) return null;
  const kilograms = Number(value.replace(',', '.'));
  return kilograms > 0 ? kilograms : null;
}

/**
 * The reply of `/api/tracking?number=` for one waybill, the lookup 4sides.ru's
 * tracking page makes. A waybill it does not know comes back with HTTP 200,
 * "Не найдено" and the number in place of the number, and nothing else. A
 * known one names its number and lists its events oldest first, each dated to
 * the day. Its summary names the recipient's town and, once delivered, who
 * took the parcel. The sender's town, the contract and the kind of shipment
 * are not kept.
 */
export function parseFoursides(payload: unknown, raw: string): CarrierResult {
  const number = normalizeFoursidesNumber(raw);
  if (!isRecord(payload) || typeof payload.number !== 'string' || !Array.isArray(payload.events)) {
    throw new SchemaError(PROVIDER, '4Sides returned an invalid reply');
  }
  const named = clean(payload.number, 80);
  const missing = MISSING.exec(named);
  if (missing) {
    if (normalizeTrackingNumber(missing[1]!) !== number) throw new IndeterminateError(PROVIDER, '4Sides answered for another waybill');
    if (payload.events.length) throw new SchemaError(PROVIDER, '4Sides returned events for a waybill it did not find');
    throw new NotFoundError(PROVIDER);
  }
  if (normalizeTrackingNumber(named) !== number) throw new IndeterminateError(PROVIDER, '4Sides answered for another waybill');
  if (payload.events.length > MAX_ROWS) throw new SchemaError(PROVIDER, '4Sides returned an oversized history');

  const seen = new Set<string>();
  const scans: { index: number; event: CarrierEvent; signer?: string }[] = [];
  payload.events.forEach((row, index) => {
    if (!isRecord(row)) throw new SchemaError(PROVIDER, '4Sides returned an invalid event');
    const date = day(text(row, 'date', 16), 'event date');
    const { description, location, stated, signer } = foursidesWording(text(row, 'status'));
    if (!date || !description) throw new SchemaError(PROVIDER, '4Sides returned an event without its date or wording');
    // Events are dated to the day: the same event twice on one day adds nothing.
    const key = JSON.stringify([date, description, location]);
    if (seen.has(key)) return;
    seen.add(key);
    // Who took the parcel adds nothing to the stage the scan's wording gives.
    const staged = foursidesStage(stated ?? description);
    scans.push({ index, ...(signer ? { signer } : {}), event: {
      local_time: date,
      ...(location ? { location } : {}),
      description,
      ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}),
    } });
  });
  // Newest first; the reply's order settles events of one day.
  scans.sort((left, right) => (right.event.local_time as string).localeCompare(left.event.local_time as string)
    || right.index - left.index);
  const events = scans.map((scan) => scan.event);

  const delivered = day(text(payload, 'deliveredDate', 16), 'delivery date');
  if (!events.length && !delivered) throw new NoHistoryError(PROVIDER);
  const scannedScan = scans.find((scan) => scan.event.stage);
  const scanned = scannedScan?.event;
  // The tracker reads a delivery day as delivered, whatever the last event; a
  // return the parcel made is delivered back to the sender.
  const summary: Stage | undefined = delivered && scanned?.stage !== 'delivered' && scanned?.stage !== 'returned' ? 'delivered' : undefined;
  const stage = (summary ?? scanned?.stage) as Stage | undefined;
  const newest = events[0];
  const updated = [newest?.local_time, delivered].filter(Boolean).sort().at(-1)!;
  const kilograms = weight(text(payload, 'weight', 16));
  const country = text(payload, 'receiverCountry', 80);
  const code = country ? destinationCountry(country) : null;
  const town = text(payload, 'receiverCity', 120);
  // The summary names who took the parcel once it is delivered, as the delivering scan does.
  const signedBy = stage !== 'delivered' ? ''
    : (scanned?.stage === 'delivered' ? scannedScan!.signer : undefined) || text(payload, 'recipient', 120);
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: summary ? 'carrier_map' : scanned?.stage_source ?? 'carrier_map' } : {}),
    last_status_text: newest?.description ?? 'Доставлено',
    last_update: null,
    last_update_local: updated,
    expected_delivery: null,
    ...(town ? { receiver_address: town } : {}),
    ...(signedBy ? { signed_by: signedBy } : {}),
    ...(kilograms !== null ? { weight_kg: kilograms } : {}),
    ...(code ? { destination_country: code } : country ? { destination_country_name: country } : {}),
    ...(events.length ? {} : { summary_only: true }),
    events,
  };
}
