import { DateTime } from 'luxon';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { clean, cleanScalar } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { DASH, detailOf, indahLogistikStage } from './status.js';

export const PROVIDER = 'Indah Logistik';
// A long history with its waybill is a few kilobytes.
export const INDAH_LOGISTIK_MAX_BYTES = 512 * 1024;
// A sending branch's three letters, then letters and digits ending in a counter,
// as in 1CS and eight or twelve digits, or 1CSPL and twelve.
const NUMBER = /^[A-Z]{3}[A-Z\d]{3,15}\d{6}$/;
const CLOCK = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;
const MAX_ROWS = 500;
const MAX_EVENTS = 100;
// A run of nine or more digits, with spaces, brackets, dots or hyphens
// between them, as phone numbers are written; a date stays.
const PHONE = /(?<![A-Z\d])(?!\d{4}-\d{2}-\d{2}(?!\d))\+?\d(?:[\s().-]{0,2}\d){8,}(?![A-Z\d])/gi;

/** A resi for Indah Logistik's lookup, in upper case as the lookup echoes it; anything else is not one it issues. */
export function normalizeIndahLogistikNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw).toUpperCase() : '';
  if (!NUMBER.test(number)) throw new InvalidInputError(PROVIDER, 'Indah Logistik resi start with a branch code and end in digits');
  return number;
}

/**
 * A row's clock: the wall clock the lookup writes, to the second. It names no
 * zone, and Indonesia has three, so the clock stays local.
 */
function scanClock(row: Record<string, unknown>): string {
  const match = CLOCK.exec(clean(row.tanggal_status, 32));
  const local = match ? `${match[1]}T${match[2]}` : '';
  // Parsing in UTC checks the calendar digits only; the wall clock keeps no offset.
  const parsed = DateTime.fromISO(local, { zone: 'UTC' });
  // Luxon rolls 24:00 over to the next day; only a clock that reads back unchanged is kept.
  if (!match || !parsed.isValid || parsed.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== local) {
    throw new SchemaError(PROVIDER, 'Indah Logistik returned an invalid scan time');
  }
  return local;
}

interface Scan {
  readonly key: string;
  readonly index: number;
  readonly event: CarrierEvent;
  // Who the row names after its dash as the receiver, with their relation.
  readonly receiver: string;
}

/**
 * A row's wording before its dash, with the town after it when the wording is
 * a movement. The delivery and an attempt keep the receiver's name and
 * relation after the dash. The courier's name, a scheduled delivery's note
 * and the detail of a wording the adapter does not know are left out.
 */
function projectRow(row: Record<string, unknown>, index: number): Scan {
  const status = clean(row.status, 300);
  const [head = '', ...rest] = status.split(DASH);
  const wording = clean(head.replace(PHONE, '')).replace(/[\s,;:.\-–]+$/, '');
  if (!wording) throw new SchemaError(PROVIDER, 'Indah Logistik returned a scan without wording');
  const detail = clean(rest.join(' - ').replace(PHONE, ''), 120);
  const named = /^[\s\-–.]*$/.test(detail) ? '' : detail;
  const location = detailOf(wording) === 'place' ? named : '';
  const receiver = detailOf(wording) === 'receiver' ? named : '';
  const description = receiver ? `${wording} - ${receiver}` : wording;
  const local = scanClock(row);
  const staged = indahLogistikStage(wording);
  const event: CarrierEvent = {
    local_time: local,
    ...(location ? { location } : {}),
    description,
    ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}),
  };
  return { key: JSON.stringify([local, description, location]), index, event, receiver };
}

/** A waybill text the lookup fills with a dash when it has none. */
function field(waybill: Record<string, unknown>, key: string, maxLength = 160): string {
  const value = clean(waybill[key], maxLength);
  return /^[\s\-–.]*$/.test(value) ? '' : value;
}

/** The service, with the way it travels as the tracker labels it: `Indah Logistic Cargo (Darat)`. */
function serviceOf(waybill: Record<string, unknown>): string {
  const name = clean(waybill.NAMA_JASA, 80);
  const via = clean(waybill.VIA, 40);
  const mode = via ? via.charAt(0).toUpperCase() + via.slice(1).toLowerCase() : '';
  if (!name) return mode;
  return mode ? `${name} (${mode})` : name;
}

/** The waybill's weight in kilograms, which its price per kilogram is charged on; null without one. */
function weightOf(waybill: Record<string, unknown>): number | null {
  const value = cleanScalar(waybill.BERAT, 32);
  if (!/^\d{1,6}(?:\.\d{1,8})?$/.test(value)) return null;
  const kilograms = Math.round(Number(value) * 1000) / 1000;
  return kilograms > 0 ? kilograms : null;
}

/**
 * The reply of the app's `getresidetail`: a code, a message and a list of
 * waybills, each with its rows, oldest first. `code` 203 with no waybill is
 * the lookup's "Nomor Resi Tidak Ditemukan!". The waybill kept must echo the
 * whole number asked, and so must every row kept.
 */
export function parseIndahLogistik(payload: unknown, raw: string): CarrierResult {
  const number = normalizeIndahLogistikNumber(raw);
  if (!isRecord(payload) || !Array.isArray(payload.result)) throw new SchemaError(PROVIDER, 'Indah Logistik returned an invalid reply');
  const code = cleanScalar(payload.code, 8);
  const waybills: unknown[] = payload.result;
  if (code === '203' && !waybills.length) throw new NotFoundError(PROVIDER);
  // The lookup's answer to a login it does not accept.
  if (code === '208') throw new ChallengeError(PROVIDER, 'Indah Logistik refused the app’s login');
  if (code !== '200' || !waybills.length) throw new SchemaError(PROVIDER, 'Indah Logistik returned an unexpected answer');

  let own: Record<string, unknown> | undefined;
  for (const entry of waybills) {
    if (!isRecord(entry) || !isRecord(entry.data_resi)) throw new SchemaError(PROVIDER, 'Indah Logistik returned an invalid waybill');
    if (clean(entry.data_resi.NO_RESI, 64).toUpperCase() === number) own ??= entry;
  }
  if (!own) throw new IndeterminateError(PROVIDER, 'Indah Logistik answered for another shipment');
  const waybill = own.data_resi as Record<string, unknown>;
  const rows = own.list_status_informasi_resi ?? [];
  if (!Array.isArray(rows)) throw new SchemaError(PROVIDER, 'Indah Logistik returned a waybill with invalid scans');
  if (rows.length > MAX_ROWS) throw new SchemaError(PROVIDER, 'Indah Logistik returned an oversized history');

  const seen = new Set<string>();
  const scans: Scan[] = [];
  const receivers = new Map<CarrierEvent, string>();
  let foreign = 0;
  rows.forEach((row, index) => {
    if (!isRecord(row)) throw new SchemaError(PROVIDER, 'Indah Logistik returned an invalid scan');
    // A row filed under another resi is another shipment's.
    const filed = clean(row.no_resi, 64).toUpperCase();
    if (filed && filed !== number) {
      foreign += 1;
      return;
    }
    const scan = projectRow(row, index);
    if (seen.has(scan.key)) return;
    seen.add(scan.key);
    scans.push(scan);
    if (scan.receiver) receivers.set(scan.event, scan.receiver);
  });
  if (!scans.length) {
    if (foreign) throw new IndeterminateError(PROVIDER, 'Indah Logistik answered for another shipment');
    throw new NoHistoryError(PROVIDER);
  }
  // Newest first; rows at the same second in the order the lookup lists them.
  const events = scans.sort((a, b) => (a.event.local_time === b.event.local_time ? b.index - a.index
    : String(b.event.local_time) < String(a.event.local_time) ? -1 : 1)).map((scan) => scan.event);

  const newest = events[0]!;
  const scanned = events.find((event) => event.stage);
  const stage = scanned?.stage as Stage | undefined;
  const service = serviceOf(waybill);
  const weight = weightOf(waybill);
  // The recipient's name and street as the waybill gives them, masked.
  const receiver = field(waybill, 'NM_PENERIMA');
  const address = field(waybill, 'ALT_PENERIMA', 300);
  const signedBy = stage === 'delivered' ? receivers.get(scanned!) ?? '' : '';
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: scanned!.stage_source ?? 'carrier_map' } : {}),
    last_status_text: newest.description!,
    last_update: null,
    last_update_local: newest.local_time,
    ...(service ? { service_name: service } : {}),
    ...(weight ? { weight_kg: weight } : {}),
    ...(receiver ? { receiver_name: receiver } : {}),
    ...(address ? { receiver_address: address } : {}),
    ...(signedBy ? { signed_by: signedBy } : {}),
    events: events.slice(0, MAX_EVENTS),
    ...(events.length > MAX_EVENTS ? { history_truncated: true } : {}),
  };
}
