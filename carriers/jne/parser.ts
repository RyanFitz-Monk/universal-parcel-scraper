import { DateTime } from 'luxon';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { listsNewestFirst } from '../../core/result/order.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { paddedDate } from '../../core/time/fields.js';
import { clean } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { jneStage } from './status.js';

export const PROVIDER = 'JNE';
// A long JNE history is a few kilobytes; the reply also carries sender and
// recipient blocks.
export const JNE_MAX_BYTES = 512 * 1024;
// JNE Trucking consignments are JT and eleven digits; regular resi are fifteen
// or sixteen digits, a shape many carriers share. JNE issues both.
const NUMBER = /^(?:JT\d{11}|\d{15,16})$/;
const MAX_ROWS = 500;
const MAX_EVENTS = 100;
// The marker JNE leaves after a delivery's recipient: "BUDI:}".
const RECEIVER_END = /[\s:;{}]+$/;

/** A number JNE's lookup accepts, upper-cased; anything else is not one it issues. */
export function normalizeJneNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw).toUpperCase() : '';
  if (!NUMBER.test(number)) throw new InvalidInputError(PROVIDER, 'JNE numbers are JT and eleven digits or a fifteen-to-sixteen digit resi');
  return number;
}

/** A required text field; a non-string is a changed reply. */
function text(row: Record<string, unknown>, key: string, maxLength = 300): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new SchemaError(PROVIDER, `JNE returned an invalid ${key}`);
  return clean(value, maxLength);
}

/**
 * A scan's clock, `dd-MM-yyyy HH:mm` to the minute. The reply names no zone and
 * Indonesia spans three (WIB, WITA, WIT), so the wall clock stays local.
 */
function scanClock(raw: string): string {
  const parsed = DateTime.fromFormat(paddedDate(raw), 'dd-MM-yyyy HH:mm', { zone: 'UTC' });
  if (!parsed.isValid) throw new SchemaError(PROVIDER, 'JNE returned an invalid scan time');
  return parsed.toFormat("yyyy-MM-dd'T'HH:mm:ss");
}

/** A text field the adapter can do without: anything but a string is left out. */
function optional(row: Record<string, unknown> | undefined, key: string, maxLength: number): string {
  const value = row?.[key];
  return typeof value === 'string' ? clean(value, maxLength) : '';
}

/** A recipient's name without the marker JNE leaves after it. */
function receiverName(value: string): string {
  return clean(value.replace(RECEIVER_END, ''), 120);
}

/**
 * A scan's wording and station. JNE heads the scan with an English phrase, then
 * the station in brackets ("WITH DELIVERY COURIER [BOGOR, DROP POINT JONGGOL]").
 * A delivery scan's bracket is `recipient | date | city`: the city after the
 * last bar is the location and the recipient is the receiver.
 */
export function jneScan(desc: string): { wording: string; location: string; receiver: string } {
  const open = desc.indexOf('[');
  const wording = clean(open >= 0 ? desc.slice(0, open) : desc, 200);
  const groups = [...desc.matchAll(/\[([^\]]*)\]/g)].map((match) => match[1]!.trim()).filter(Boolean);
  const last = groups.length ? groups[groups.length - 1]! : '';
  const parts = last.split('|');
  const receiver = parts.length > 1 ? receiverName(parts[0]!) : '';
  return { wording, location: clean(parts.at(-1)!.trim(), 120), receiver };
}

function projectRow(row: Record<string, unknown>): { key: string; event: CarrierEvent; time: number; receiver: string } {
  const { wording, location, receiver } = jneScan(text(row, 'desc'));
  if (!wording) throw new SchemaError(PROVIDER, 'JNE returned a scan without wording');
  const local = scanClock(text(row, 'date', 32));
  // A delivery keeps the recipient it names and is staged by its phrase.
  const description = receiver ? `${wording} ${receiver}` : wording;
  const staged = jneStage(wording);
  const event: CarrierEvent = {
    local_time: local,
    ...(location ? { location } : {}),
    description,
    ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}),
  };
  return { key: JSON.stringify([local, description, location]), event, time: DateTime.fromISO(local, { zone: 'UTC' }).toMillis(), receiver };
}

/** The shipment weight in kilograms, when the reply gives a positive one. */
function weight(cnote: Record<string, unknown>): number | null {
  const value = Number(text(cnote, 'weight', 16));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : null;
}

/**
 * The recipient's name and address: the summary's name, else the `detail`
 * entry's for the number, whose first address line and town are the address.
 */
function recipient(payload: Record<string, unknown>, cnote: Record<string, unknown>, number: string): Pick<CarrierResult, 'receiver_name' | 'receiver_address'> {
  const listed = Array.isArray(payload.detail) ? payload.detail : [];
  const detail = listed.find((entry): entry is Record<string, unknown> => isRecord(entry)
    && typeof entry.cnote_no === 'string' && clean(entry.cnote_no, 64).toUpperCase() === number);
  const name = optional(cnote, 'cnote_receiver_name', 160) || optional(detail, 'cnote_receiver_name', 160);
  const address = [optional(detail, 'cnote_receiver_addr1', 200), optional(detail, 'cnote_receiver_city', 80)].filter(Boolean).join('\n');
  return { ...(name ? { receiver_name: name } : {}), ...(address ? { receiver_address: address } : {}) };
}

/**
 * The reply of `api/l3v14than-res1` for one number. A known shipment answers
 * `status` "00" with a `cnote` summary and a `history`; an unknown number
 * answers "04". The shipment must echo the number asked. The recipient's name
 * and address are read, and a delivery's signatory is the summary's
 * `cnote_pod_receiver`, else the recipient its scan names. The shipper, the
 * proof of delivery's images, the goods and the price are not.
 */
export function parseJne(payload: unknown, raw: string): CarrierResult {
  const number = normalizeJneNumber(raw);
  if (!isRecord(payload)) throw new SchemaError(PROVIDER, 'JNE returned an invalid reply');
  const status = text(payload, 'status', 8);
  if (status === '04') throw new NotFoundError(PROVIDER);
  if (status !== '00' || !isRecord(payload.cnote)) throw new SchemaError(PROVIDER, 'JNE returned an unexpected reply');
  const cnote = payload.cnote;
  if (text(cnote, 'cnote_no', 64).toUpperCase() !== number) throw new SchemaError(PROVIDER, 'JNE answered for another shipment');

  const rows = payload.history ?? [];
  if (!Array.isArray(rows)) throw new SchemaError(PROVIDER, 'JNE returned invalid history');
  if (rows.length > MAX_ROWS) throw new SchemaError(PROVIDER, 'JNE returned an oversized history');
  const seen = new Set<string>();
  const scans: Array<{ event: CarrierEvent; time: number }> = [];
  const receivers = new Map<CarrierEvent, string>();
  for (const row of rows) {
    if (!isRecord(row)) throw new SchemaError(PROVIDER, 'JNE returned an invalid scan');
    const scan = projectRow(row);
    if (seen.has(scan.key)) continue;
    seen.add(scan.key);
    if (scan.receiver) receivers.set(scan.event, scan.receiver);
    scans.push({ event: scan.event, time: scan.time });
  }
  if (!scans.length) throw new NoHistoryError(PROVIDER);
  // JNE lists scans oldest first; order by the wall clock, newest first.
  if (listsNewestFirst(scans.map(({ event }) => event)) === false) scans.reverse();
  scans.sort((a, b) => b.time - a.time);
  const events = scans.map((scan) => scan.event);

  const newest = events[0]!;
  const scanned = events.find((event) => event.stage);
  // The summary's own word for a finished parcel wins over the newest scan.
  const summary = text(cnote, 'pod_status', 40).toUpperCase() === 'DELIVERED' ? 'delivered' as Stage : undefined;
  const stage = summary ?? (scanned?.stage as Stage | undefined);
  const source = summary && summary !== scanned?.stage ? 'carrier_map' : scanned?.stage_source;
  const kg = weight(cnote);
  const delivery = events.find((event) => event.stage === 'delivered');
  const signedBy = stage === 'delivered'
    ? receiverName(optional(cnote, 'cnote_pod_receiver', 200)) || (delivery ? receivers.get(delivery) ?? '' : '') : '';
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: source ?? 'carrier_map' } : {}),
    last_status_text: newest.description!,
    last_update: null,
    last_update_local: newest.local_time,
    expected_delivery: null,
    ...(kg !== null ? { weight_kg: kg } : {}),
    ...recipient(payload, cnote, number),
    ...(signedBy ? { signed_by: signedBy } : {}),
    events: events.slice(0, MAX_EVENTS),
    ...(events.length > MAX_EVENTS ? { history_truncated: true } : {}),
  };
}
