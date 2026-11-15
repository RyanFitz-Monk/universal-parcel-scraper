import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { paddedDate } from '../../core/time/fields.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { egxpressStage } from './status.js';

export const PROVIDER = 'EGXPRESS';
export const EGXPRESS_MAX_BYTES = 1_000_000;
const MAX_ROWS = 1_000;
const MAX_EVENTS = 200;
// The domestic format in the carrier's bulk-tracking example file, also offered by detection.
const NUMBER = /^FED20\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{8}$/;
const DAY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const CODE = /^[A-Z0-9]{1,12}$/;
// Delivery rows append the recipient and their identity document to this label.
const RECIPIENT = /\b(?:delivered\s+to|signed\s+(?:for\s+)?by|received\s+by)\b.*$/i;
// "Delivered To :NAME ID:12345678901234", the person who took the parcel.
const DELIVERED_TO = /^delivered\s+to\s*:\s*(.+?)(?:\s+ID\s*:\s*\S*)?$/i;

export function normalizeEgxpressNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (!NUMBER.test(number)) throw new InvalidInputError(PROVIDER, 'EGXPRESS domestic waybills use FED, a date and eight digits');
  return number;
}

function invalid(message: string): never {
  throw new SchemaError(PROVIDER, message);
}

/** A display field is text, never an object whose stringification could hide schema drift. */
function text(value: unknown, field: string, maxLength = 500): string {
  if (value !== null && value !== undefined && typeof value !== 'string') invalid(`EGXPRESS returned an invalid ${field}`);
  return clean(value, maxLength);
}

/** The page only changes the clock's presentation to AM/PM; the feed states no zone. */
function localClock(day: unknown, time: unknown): string {
  const date = DAY.exec(paddedDate(text(day, 'scan date', 40)));
  const calendar = date ? calendarDay(Number(date[3]), Number(date[2]), Number(date[1])) : null;
  if (!calendar || date?.[3] === '0000' || date?.[3] === '0001') invalid('EGXPRESS returned an invalid scan date');
  const raw = text(time, 'scan time', 40);
  if (!raw) return calendar;
  const clock = CLOCK.exec(raw);
  if (!clock || Number(clock[1]) > 23 || Number(clock[2]) > 59 || Number(clock[3] ?? 0) > 59) invalid('EGXPRESS returned an invalid scan time');
  return `${calendar}T${clock[1]!.padStart(2, '0')}:${clock[2]}:${clock[3] ?? '00'}`;
}

/** The wording the stage is read from, without the name and identity document a delivery row adds. */
function stageWording(code: string, remarks: string): string {
  if (code === 'POD') return 'Delivered';
  return clean(remarks.replace(RECIPIENT, (label) => /^delivered/i.test(label) ? 'Delivered' : 'Received'), 500);
}

function scan(value: unknown): CarrierEvent {
  if (!isRecord(value)) invalid('EGXPRESS returned an invalid scan');
  const rawCode = typeof value.status === 'number' && Number.isSafeInteger(value.status) && value.status >= 0
    ? String(value.status) : text(value.status, 'scan code', 40).toUpperCase();
  if (!CODE.test(rawCode)) invalid('EGXPRESS returned a scan without its status code');
  const remarks = text(value.remarks, 'scan description');
  const description = remarks || (rawCode === 'POD' ? 'Delivered' : '');
  if (!description) invalid('EGXPRESS returned a scan without its description');
  const location = text(value.location, 'scan location', 160);
  const staged = egxpressStage(rawCode, stageWording(rawCode, remarks));
  return {
    local_time: localClock(value.transdate, value.transTime),
    description,
    ...(location ? { location } : {}),
    provider_code: rawCode,
    ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}),
  };
}

/** Who took the parcel, from the newest delivery row that names them. */
function signatory(rows: readonly unknown[]): string {
  for (const row of rows) {
    if (!isRecord(row) || row.status !== 'POD') continue;
    const name = DELIVERED_TO.exec(text(row.deliveredTo, 'delivery recipient') || text(row.remarks, 'scan description'))?.[1];
    if (name) return clean(name, 160);
  }
  return '';
}

/** The consignee's address, which the reply writes after their name and a comma. */
function addressOf(details: string, receiver: string): string {
  if (!receiver || !details.toUpperCase().startsWith(receiver.toUpperCase())) return '';
  return clean(details.slice(receiver.length).replace(/^\s*,/, ''), 300);
}

/**
 * One guest domestic result, bound to the whole AWB the service returns. The
 * shipment's summary fields are often empty; dated history supplies the state.
 * The recipient's name and address and who took the parcel are kept; sender,
 * account, cash and package-content fields are never projected.
 */
export function parseEgxpress(payload: unknown, raw: string): CarrierResult {
  const number = normalizeEgxpressNumber(raw);
  if (!isRecord(payload) || !Array.isArray(payload.trackInfo)) invalid('EGXPRESS returned an invalid tracking reply');
  // An observed carrier notice, not HTTP 200 or the error code on its own.
  if (payload.code === -1 && payload.description === 'Status Not Found for This AWBNo.' && payload.trackInfo.length === 0) {
    throw new NotFoundError(PROVIDER);
  }
  if (payload.code !== 101 || payload.description !== 'SUCCESS') invalid('EGXPRESS returned an unrecognized tracking reply');
  if (payload.trackInfo.length === 0) throw new NoHistoryError(PROVIDER, undefined, { reason: 'portal_not_found' });
  if (payload.trackInfo.length !== 1) invalid('EGXPRESS returned an ambiguous tracking reply');
  const track: unknown = payload.trackInfo[0];
  if (!isRecord(track) || !isRecord(track.shipmentInformation)) invalid('EGXPRESS returned a reply without shipment information');
  const shipment = track.shipmentInformation;
  if (typeof shipment.awbNo !== 'string' || !shipment.awbNo) invalid('EGXPRESS returned a shipment without its waybill');
  // Compare before any display-length cap, so a suffix cannot disappear.
  if (normalizeTrackingNumber(shipment.awbNo) !== number) throw new IndeterminateError(PROVIDER, 'EGXPRESS answered for another waybill');
  if (!Array.isArray(track.trackList) || track.trackList.length > MAX_ROWS) invalid('EGXPRESS returned an invalid scan history');
  if (!track.trackList.length) throw new NoHistoryError(PROVIDER, undefined, { reason: 'portal_not_found' });
  // The API and the page's descending view are newest first. Keep that order
  // for tied clocks and for any row whose clock contains only its day.
  const events = track.trackList.map(scan);
  const newest = events[0]!;
  const staged = newest.stage ? { stage: newest.stage as Stage, source: newest.stage_source! } : null;
  const receiver = text(shipment.receiver, 'recipient', 160);
  const address = addressOf(text(shipment.consigneeDetails, 'recipient address'), receiver);
  const signedBy = signatory(track.trackList);
  return {
    status: staged ? languageStageStatus(staged.stage) : 'unknown',
    ...(staged ? { current_stage: staged.stage, current_stage_source: staged.source } : {}),
    last_status_text: newest.description,
    last_update: null,
    last_update_local: newest.local_time,
    expected_delivery: null,
    ...(receiver ? { receiver_name: receiver } : {}),
    ...(address ? { receiver_address: address } : {}),
    ...(signedBy ? { signed_by: signedBy } : {}),
    events: events.slice(0, MAX_EVENTS),
    ...(events.length > MAX_EVENTS ? { history_truncated: true } : {}),
  };
}
