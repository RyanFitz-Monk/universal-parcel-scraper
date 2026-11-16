import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { DateTime } from 'luxon';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { hasLuhnCheckDigit } from '../../core/detection/numericChecksums.js';
import { ChallengeError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { unreadEstimates } from '../../core/result/unread.js';
import { languageStageStatus, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import { clean } from '../../core/transport/index.js';
import { aaaCooperStage } from './status.js';

export const PROVIDER = 'AAA Cooper';
// A shipment's page is about 110 kB, most of it the site around the tracking.
export const AAA_COOPER_MAX_BYTES = 1024 * 1024;

// The page's server controls, by their ids.
const ID = 'AAACooperMasterPage_bodyContent_';
// The page's notices for a PRO number without a shipment to show.
const NOT_FOUND = 'PRO NOT FOUND IN SYSTEM';
const PENDING = 'PRONUMBER FOUND, PROCESS PENDING. CHECK BACK LATER';
// The notice over the image CAPTCHA the page asks for after many lookups from one address.
const CAPTCHA = /type the code you see in the picture/i;
// A firewall or bot check's page, which can come back with HTTP 200.
const BLOCKED = /<title>\s*(?:Just a moment|Attention Required|Access Denied|Request Rejected|403 - Forbidden)|_cf_chl_opt|cf-turnstile|requested URL was rejected|Incapsula incident|_Incapsula_Resource/i;
// A stage the status field settles over the newest row.
const SETTLED = new Set<Stage>(['delivered', 'returned', 'exception']);
const MAX_ROWS = 500;
// The place a row's sentence names: "... In HOUMA, LA", "... destination Service Center NEW ORLEANS, LA",
// and the service center a shipment arrived at or departed: "Shipment departed MERIDIAN Service Center".
const PLACE_AFTER_IN = /^(?:Shipment Picked Up From Shipper|Shipment Out For Delivery To Consignee|Delivered To Consignee) In (\S.*)$/i;
const DESTINATION_CENTER = /^Shipment arrived at destination Service Center (\S.*)$/i;
const CENTER = /^Shipment (?:arrived at|departed) (\S.*?) Service Center$/i;

/** A PRO number as AAA Cooper's page knows it, and the number as typed. */
export interface AaaCooperNumber { number: string; pro: string }

/**
 * An AAA Cooper PRO number: eight digits, or those eight and their Luhn check digit, as
 * archived and live lookups of nine digits show the page naming their first eight. The page
 * drops a ninth digit without checking it, so the adapter checks it before any request.
 */
export function aaaCooperNumber(raw: string): AaaCooperNumber {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (/^\d{8}$/.test(number)) return { number, pro: number };
  if (/^\d{9}$/.test(number) && hasLuhnCheckDigit(number)) return { number, pro: number.slice(0, 8) };
  throw new InvalidInputError(PROVIDER, 'AAA Cooper PRO numbers are eight digits, or nine with their check digit');
}

/** The text of one server control, '' when it is empty, and a schema error when the page lacks it. */
function control(scope: Cheerio<Element>, name: string, maxLength = 200): string {
  const found = scope.find(`#${ID}${name}`);
  if (found.length !== 1) throw new SchemaError(PROVIDER, 'AAA Cooper changed its tracking page');
  return clean(found.text(), maxLength);
}

/** The notice the page shows instead of a shipment. */
function noticePage(panel: Cheerio<Element>): never {
  const captcha = panel.find(`#${ID}trTimedButton`);
  const notice = clean(panel.find('.ErrorText').text(), 200).toUpperCase();
  // The panel carries an image CAPTCHA in a hidden row; shown, it stands between the lookup and the answer.
  if ((captcha.length && !/display\s*:\s*none/i.test(captcha.attr('style') ?? '')) || CAPTCHA.test(notice)) {
    throw new ChallengeError(PROVIDER, 'AAA Cooper asked for the code of its image CAPTCHA');
  }
  if (notice === NOT_FOUND) throw new NotFoundError(PROVIDER);
  if (notice === PENDING) throw new NoHistoryError(PROVIDER, 'AAA Cooper found the PRO number but has not processed it yet', { reason: 'listed' });
  throw new SchemaError(PROVIDER, 'AAA Cooper returned an unknown notice');
}

/** "2026-04-15" and "16:18" as a wall clock. The page gives no zone. */
function wallClock(day: string, time: string): string | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const clock = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!date || !clock) return null;
  // UTC only checks the calendar fields. No offset is assigned.
  const parsed = DateTime.fromObject({ year: Number(date[1]), month: Number(date[2]), day: Number(date[3]),
    hour: Number(clock[1]), minute: Number(clock[2]) }, { zone: 'UTC' });
  return parsed.isValid ? parsed.toFormat("yyyy-MM-dd'T'HH:mm:ss") : null;
}

/** The place or service center a row's sentence names. */
function placeOf(description: string): string {
  return (PLACE_AFTER_IN.exec(description) ?? DESTINATION_CENTER.exec(description) ?? CENTER.exec(description))?.[1] ?? '';
}

/** One tracing row: its day, its time and the sentence, which names the place. */
function row($: CheerioAPI, node: Element): CarrierEvent {
  const cell = (name: string) => {
    const spans = $(node).find(`span[id$="_${name}"]`);
    if (spans.length !== 1) throw new SchemaError(PROVIDER, 'AAA Cooper changed its tracing information');
    return clean(spans.text(), 200);
  };
  const local_time = wallClock(cell('lblDate'), cell('lblTime'));
  const description = cell('lblDescription');
  if (!local_time || !description) throw new SchemaError(PROVIDER, 'AAA Cooper returned a row without its clock and description');
  const location = placeOf(description);
  const staged = aaaCooperStage(description);
  return { local_time, ...(location ? { location } : {}), description,
    ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}) };
}

/** The tracing rows, newest first. A page without the table has none yet. */
function tracing($: CheerioAPI, panel: Cheerio<Element>): CarrierEvent[] {
  const table = panel.find(`#${ID}grdViewTraceInfo`);
  if (table.length > 1) throw new SchemaError(PROVIDER, 'AAA Cooper repeated its tracing information');
  const rows = table.find('tr').filter((_, node) => $(node).children('td').length > 0);
  if (rows.length > MAX_ROWS) throw new SchemaError(PROVIDER, 'AAA Cooper returned an oversized history');
  const events = rows.toArray().map(node => row($, node));
  // The page lists the newest first; a list the other way round is turned.
  return events.length > 1 && events[0]!.local_time! < events.at(-1)!.local_time! ? events.reverse() : events;
}

/**
 * The page `pwb/Transit/ProTrackResults.aspx` renders for one PRO number: the PRO, BOL and PO
 * numbers, the origin and destination service centers and their phones, the pickup day, the
 * delivery day and time, the status, who signed for the delivery, the payment terms, the
 * pieces and weight, and the tracing rows, each with a day, a time and a sentence naming the
 * place. Only the PRO number, the status and the rows are read; a delivery day before the
 * delivery is named as unread. A PRO number without a shipment comes back with a notice
 * instead, which names no number.
 */
export function parseAaaCooper(html: string, rawNumber: string): CarrierResult {
  const { pro } = aaaCooperNumber(rawNumber);
  const $ = load(html);
  const content = $(`#${ID}ContentPanel`);
  const notice = $(`#${ID}ErrorPanel`);
  if (notice.length === 1 && !content.length) noticePage(notice);
  if (content.length !== 1 || notice.length) {
    if (BLOCKED.test(html.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'AAA Cooper answered with a block page');
    throw new SchemaError(PROVIDER, 'AAA Cooper did not return a tracking page');
  }
  if (control(content, 'lblProNumber', 40) !== pro) throw new SchemaError(PROVIDER, 'AAA Cooper answered for another shipment');

  const status = control(content, 'lblDeliveryStatus', 120);
  const headline: ClassifiedWording | null = status ? aaaCooperStage(status) : null;
  const events = tracing($, content);
  if (!events.length && !status) throw new NoHistoryError(PROVIDER, 'AAA Cooper lists the PRO number without tracing', { reason: 'listed' });

  // The status field settles a delivery, a return or a problem, and a shipment without a
  // staged row; otherwise the newest staged row is ahead of it.
  const newest = events[0];
  const scanned = events.find(event => event.stage);
  const settled = headline !== null && (SETTLED.has(headline.stage) || !scanned);
  const decided = settled ? headline : scanned ? { stage: scanned.stage as Stage, source: scanned.stage_source! } : null;
  // Before the delivery, the delivery field can hold a day, perhaps the one the shipment is due. It is not read.
  const due = decided?.stage === 'delivered' ? null : control(content, 'lblDeliveryDate', 40);
  return {
    status: decided ? languageStageStatus(decided.stage) : 'unknown',
    ...(decided ? { current_stage: decided.stage, current_stage_source: decided.source } : {}),
    last_status_text: (settled ? status : newest?.description) || status || null,
    last_update: null,
    ...(newest ? { last_update_local: newest.local_time } : {}),
    expected_delivery: null,
    ...unreadEstimates({ lblDeliveryDate: due }),
    events,
  };
}
