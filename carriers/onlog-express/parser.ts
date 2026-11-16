import { load } from 'cheerio';
import { DateTime } from 'luxon';
import { normalizeTrackingNumber } from '../../core/detection/normalize.js';
import { isOnlogExpressReference } from '../../core/detection/onlogExpress.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { leadingScan } from '../../core/result/unstaged.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { paddedDate } from '../../core/time/fields.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { onlogExpressStage, statusMap } from './status.js';

export const PROVIDER = 'Onlog Express';
export const ONLOG_EXPRESS_MAX_BYTES = 512 * 1024;

const MAX_ROWS = 500;
const NOT_FOUND = 'Nenhum objeto encontrado na base de dados.';
const CLOCK = /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/;
const BLOCKED = /_cf_chl_opt|cf-turnstile|challenges\.cloudflare\.com|<title>\s*(?:Just a moment|Attention Required|Access Denied|Request Rejected)/i;
const CAPTCHA = /captcha|turnstile/i;

/** The public guest route accepts AA followed by ten digits. */
export function normalizeOnlogExpressNumber(raw: string): string {
  if (!isOnlogExpressReference(raw)) throw new InvalidInputError(PROVIDER, 'Onlog Express references are AA followed by ten digits');
  return normalizeTrackingNumber(raw);
}

/** Validate the calendar without assigning a zone to its minute-precision wall clock. */
function wallClock(raw: string): string {
  const stamp = paddedDate(clean(raw, 100));
  const parsed = CLOCK.test(stamp) ? DateTime.fromFormat(stamp, 'dd/MM/yyyy HH:mm', { zone: 'UTC' }) : null;
  if (!parsed?.isValid || parsed.toFormat('dd/MM/yyyy HH:mm') !== stamp) {
    throw new SchemaError(PROVIDER, 'Onlog Express returned an invalid scan clock');
  }
  return parsed.toFormat("yyyy-MM-dd'T'HH:mm");
}

/** The official guest JSON envelope and its one identity-bound HTML history. */
export function parseOnlogExpress(payload: unknown, rawNumber: string): CarrierResult {
  const number = normalizeOnlogExpressNumber(rawNumber);
  if (typeof payload === 'string' && BLOCKED.test(payload.slice(0, 64_000))) throw new ChallengeError(PROVIDER);
  if (payload === undefined || payload === null || payload === '') throw new SchemaError(PROVIDER, 'Onlog Express returned no tracking envelope');
  if (!isRecord(payload) || typeof payload.sucesso !== 'boolean') throw new SchemaError(PROVIDER, 'Onlog Express returned an invalid tracking envelope');

  const message = typeof payload.mensagem === 'string' ? payload.mensagem : '';
  if (!payload.sucesso) {
    if (CAPTCHA.test(message)) throw new ChallengeError(PROVIDER, 'Onlog Express refused the tracking verification');
    if (message === NOT_FOUND && (payload.html === undefined || payload.html === null || payload.html === '')) throw new NotFoundError(PROVIDER);
    throw new IndeterminateError(PROVIDER, 'Onlog Express did not complete the tracking lookup');
  }
  if (typeof payload.html !== 'string') throw new SchemaError(PROVIDER, 'Onlog Express returned no tracking HTML');
  const html = payload.html;
  if (html.length > ONLOG_EXPRESS_MAX_BYTES) throw new SchemaError(PROVIDER, 'Onlog Express returned an oversized history');
  if (BLOCKED.test(html)) throw new ChallengeError(PROVIDER);
  if (!html.trim()) throw new NoHistoryError(PROVIDER);

  const $ = load(html);
  const headings = $('h3');
  if (!headings.length) throw new SchemaError(PROVIDER, 'Onlog Express returned a history without its reference');
  if (headings.length !== 1) throw new IndeterminateError(PROVIDER, 'Onlog Express returned multiple shipment histories');
  // Compare the whole heading before any display-text cleaning or truncation.
  const identity = headings.first().text();
  if (identity.length > 64 || normalizeTrackingNumber(identity) !== number) {
    throw new IndeterminateError(PROVIDER, 'Onlog Express answered for another shipment');
  }
  const wrappers = $('.rastreio-wrapper');
  if (wrappers.length !== 1) throw new SchemaError(PROVIDER, 'Onlog Express returned an invalid history container');
  const rows = wrappers.find('.rastreio-item');
  if (rows.length !== $('.rastreio-item').length || rows.length > MAX_ROWS) throw new SchemaError(PROVIDER, 'Onlog Express returned an invalid scan history');
  if (!rows.length) throw new NoHistoryError(PROVIDER, 'Onlog Express lists the shipment without scans', { reason: 'listed' });

  const events: CarrierEvent[] = [];
  rows.each((_index, row) => {
    const texts = $(row).find('.texto-rastreio');
    const labels = texts.children('span.position-relative');
    const places = texts.children('span.text-sm');
    if (texts.length !== 1 || labels.length !== 1 || places.length > 1) throw new SchemaError(PROVIDER, 'Onlog Express returned an invalid scan');
    const wording = labels.text();
    const place = places.text();
    if (wording.length > 500 || place.length > 160) throw new SchemaError(PROVIDER, 'Onlog Express returned oversized scan text');
    const description = clean(wording);
    const location = clean(place, 160);
    if (!description) throw new SchemaError(PROVIDER, 'Onlog Express returned a scan without wording');
    // Only the text outside the label and location spans is the scan's clock.
    const local = wallClock(texts.clone().children().remove().end().text());
    const staged = onlogExpressStage(description);
    events.push({ local_time: local, description, ...(location ? { location } : {}),
      ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}) });
  });
  // The page lists oldest first. Reverse the rows, including their same-minute order.
  events.reverse();
  const newest = events[0]!;
  const current = leadingScan(events, statusMap);
  const stage = current?.stage as Stage | undefined;
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: current!.stage_source } : {}),
    last_status_text: newest.description!,
    last_update: null,
    last_update_local: newest.local_time!,
    expected_delivery: null,
    events,
  };
}
