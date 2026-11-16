import { DateTime } from 'luxon';
import { normalizeTrackingNumber } from '../../core/detection/normalize.js';
import { IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { leadingScan } from '../../core/result/unstaged.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { paddedDate } from '../../core/time/fields.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { nhatTinBillStage, nhatTinStage, statusMap } from './status.js';

export const PROVIDER = 'Nhat Tin Logistics';
/** The lookup the tracking page on ntlogistics.vn makes for the numbers typed in. */
export const NHAT_TIN_API = 'https://bwsv3.ntlogistics.vn/v1/website/search-from-es';
// A long history is a few kilobytes.
export const NHAT_TIN_MAX_BYTES = 256 * 1024;

// The page takes up to thirty numbers separated by commas; the adapter sends
// one, of eight to twenty-four letters and digits.
const NUMBER = /^(?=[A-Z]*\d)[A-Z\d]{8,24}$/;
// A scan's clock, day first, to the minute: "19/12/2025 12:48".
const CLOCK = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/;
// The estimate: "2025-12-22 12:48:19.3", the pickup's clock some days on.
const EXPECTED = /^(\d{4}-\d{2}-\d{2})[ T]\d{2}:\d{2}/;
const MAX_BILLS = 30;
const MAX_ROWS = 300;
const MAX_EVENTS = 100;

// The sender before the pickup and the receiver after the delivery:
// "Nhận vận đơn từ <name>", "Trả vận đơn cho <name>".
const NAMED = /^(nhận vận đơn từ|trả vận đơn cho)\s+\S[\s\S]*$/iu;
// What follows the dispatch to the receiver, which can name the courier.
const DISPATCH = /^(xuất kho trả hàng)\s*:?\s*([\s\S]*)$/iu;
// A run of nine or more digits, with spaces, brackets, dots or hyphens
// between them, as phone numbers are written.
const PHONE = /(?<![A-Z\d])\+?\d(?:[\s().-]{0,2}\d){8,}(?![A-Z\d])/gi;

/** A number for Nhat Tin Logistics' tracker, in capitals: its service fails on lower case. */
export function normalizeNhatTinNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw).toUpperCase() : '';
  if (!NUMBER.test(number)) throw new InvalidInputError(PROVIDER, 'Nhat Tin Logistics numbers are eight to twenty-four letters and digits');
  return number;
}

/**
 * An operation's wording without the people it names. The sender after the
 * pickup, the receiver after the delivery and whatever follows the dispatch to
 * the receiver read `***`, as the page masks names; phone numbers too.
 * Warehouses stay.
 */
export function nhatTinOperation(raw: string): string {
  const value = clean(raw.normalize('NFC'), 300);
  const named = NAMED.exec(value);
  let text = named ? `${named[1]} ***` : value;
  const dispatch = DISPATCH.exec(text);
  if (dispatch) text = dispatch[2] ? `${dispatch[1]}: ***` : dispatch[1]!;
  return clean(text.replace(PHONE, '***'));
}

/** An optional text field; anything but a string is a changed reply. */
function text(row: Record<string, unknown>, key: string, maxLength = 200): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new SchemaError(PROVIDER, `Nhat Tin Logistics returned an invalid ${key}`);
  return clean(value.normalize('NFC'), maxLength);
}

/** The wall clock of `loc_time`, in ISO form; anything else is a changed reply. */
function wallClock(value: string): string {
  const parts = CLOCK.exec(paddedDate(value));
  const wall = parts ? `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:00` : '';
  // Parsing in UTC checks the calendar digits only. Luxon rolls 24:00 over to the next day.
  const checked = DateTime.fromISO(wall, { zone: 'UTC' });
  if (!parts || !checked.isValid || checked.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== wall) {
    throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned an invalid scan time');
  }
  return wall;
}

function projectRow(row: unknown): { key: string; wall: string; event: CarrierEvent } {
  if (!isRecord(row)) throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned an invalid scan');
  const wall = wallClock(text(row, 'loc_time', 32));
  const description = nhatTinOperation(text(row, 'operation', 300));
  const location = [text(row, 'district', 80), text(row, 'city', 80)].filter(Boolean).join(', ');
  const staged = nhatTinStage(description);
  // The page shows a scan without wording too, with its time and place; it has no stage.
  const event: CarrierEvent = {
    local_time: wall,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
    ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}),
  };
  return { key: JSON.stringify([wall, description, location]), wall, event };
}

/** The day of `date_expected`, while the bill is still on its way. */
function expectedDay(bill: Record<string, unknown>, stage: Stage | undefined): string | null {
  if (stage === 'delivered' || stage === 'returned') return null;
  const day = EXPECTED.exec(text(bill, 'date_expected', 40))?.[1];
  return day && DateTime.fromISO(day, { zone: 'UTC' }).isValid ? day : null;
}

/**
 * The reply of `search-from-es` for one number: `data` holds one entry per
 * number asked, which must name the whole number as its `bill`. A bill the
 * tracker does not know has `found: false` and nothing else, which the page
 * reports as not found. A known bill has its status code (`billstatus`) and
 * wording, and its `histories`, oldest first, on wall clocks without a zone.
 * The sender's and receiver's names, phones, addresses and districts, the
 * contents, the payment and the delay reasons are never read.
 */
export function parseNhatTin(payload: unknown, raw: string): CarrierResult {
  const number = normalizeNhatTinNumber(raw);
  if (!isRecord(payload) || typeof payload.success !== 'boolean') throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned an invalid envelope');
  // The service's own failure: "Lỗi hệ thống: …", with an empty object for data.
  if (!payload.success) throw new IndeterminateError(PROVIDER, 'Nhat Tin Logistics did not complete the lookup');
  if (!Array.isArray(payload.data) || payload.data.length > MAX_BILLS) throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned an invalid envelope');
  const bills = payload.data as unknown[];
  if (bills.some((bill) => !isRecord(bill) || typeof bill.bill !== 'string')) {
    throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned a bill without its number');
  }
  const own = (bills as Record<string, unknown>[]).filter(({ bill }) => (bill as string).length <= 64
    && normalizeTrackingNumber(bill as string) === number);
  if (own.length !== 1) {
    throw new SchemaError(PROVIDER, own.length ? 'Nhat Tin Logistics answered with several bills for the number' : 'Nhat Tin Logistics answered for another bill');
  }
  const bill = own[0]!;
  if (bill.found === false) throw new NotFoundError(PROVIDER);
  if (bill.found !== true) throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned a bill without its lookup outcome');

  const rows = bill.histories ?? [];
  if (!Array.isArray(rows)) throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned a bill with an invalid history');
  if (rows.length > MAX_ROWS) throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned an oversized history');
  const seen = new Set<string>();
  const scans: ReturnType<typeof projectRow>[] = [];
  for (const row of rows) {
    const scan = projectRow(row);
    if (seen.has(scan.key)) continue;
    seen.add(scan.key);
    scans.push(scan);
  }
  // A bill the tracker lists without a scan is a known number.
  if (!scans.length) throw new NoHistoryError(PROVIDER, undefined, { reason: 'listed' });
  // Newest first. The page lists the scans oldest first; a reply listed newest first stays as it is.
  if (scans[0]!.wall < scans.at(-1)!.wall) scans.reverse();
  const events = scans.map(({ event }) => event);

  const code = text(bill, 'billstatus', 16);
  const wording = text(bill, 'billstatus_desc', 120);
  const billStage = nhatTinBillStage(code, wording);
  const lead = billStage ? undefined : leadingScan(events, statusMap);
  const stage = billStage ?? lead?.stage as Stage | undefined;
  const service = text(bill, 'service', 80);
  const expected = expectedDay(bill, stage);
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: billStage ? 'carrier_map' : lead!.stage_source! } : {}),
    last_status_text: wording || events.find((event) => event.description)?.description || null,
    ...(code ? { provider_code: code } : {}),
    last_update: null,
    last_update_local: events[0]!.local_time!,
    expected_delivery: expected,
    ...(service ? { service_name: service } : {}),
    events: events.slice(0, MAX_EVENTS),
    ...(events.length > MAX_EVENTS ? { history_truncated: true } : {}),
  };
}
