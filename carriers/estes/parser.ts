import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { calendarDay, explicitOffsetTime } from '../../core/time/index.js';
import { cleanScalar } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { estesStage } from './status.js';

export const PROVIDER = 'Estes';
// A shipment's reply is a few kilobytes: a few dozen status rows.
export const ESTES_MAX_BYTES = 512 * 1024;

// A PRO number is ten digits; the service refuses any other length.
const NUMBER = /^\d{10}$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
// A clock with its offset, as `referenceTime` carries it.
const CLOCK = /^(\d{2}):(\d{2}):(\d{2})(?:Z|[+-]\d{2}:?\d{2})$/;
// A terminal movement's id is the terminal's three-digit number.
const TERMINAL = /^\d{3}$/;
const CITY_FIELD = 15;
// The service answers an unknown PRO with HTTP 404 and this code.
export const NOT_FOUND_CODE = 50010;
// And a number it does not take with HTTP 400 and this one.
export const INVALID_CODE = 20010;
const POUNDS_TO_KG = 0.453_592_37;
const FINAL: ReadonlySet<Stage> = new Set(['delivered', 'returned']);
const MAX_MOVEMENTS = 100;
const MAX_ROWS = 500;
const MAX_EVENTS = 100;

/** A PRO number as the service takes it; any other input is a number Estes does not issue. */
export function normalizeEstesNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (!NUMBER.test(number)) throw new InvalidInputError(PROVIDER, 'Estes PRO numbers are ten digits');
  return number;
}

/** An optional text field; an object, array or other value is a changed reply. */
function text(row: Record<string, unknown>, key: string, maxLength = 500): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string' && typeof value !== 'number') throw new SchemaError(PROVIDER, `Estes returned an invalid ${key}`);
  return cleanScalar(value, maxLength);
}

/** An optional flag: absent is false, anything but a boolean is a changed reply. */
function flag(row: Record<string, unknown>, key: string): boolean {
  const value = row[key];
  if (value === null || value === undefined) return false;
  if (typeof value !== 'boolean') throw new SchemaError(PROVIDER, `Estes returned an invalid ${key}`);
  return value;
}

/** An optional object; anything else is a changed reply. */
function record(row: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = row[key];
  if (value === null || value === undefined) return undefined;
  if (!isRecord(value)) throw new SchemaError(PROVIDER, `Estes returned an invalid ${key}`);
  return value;
}

/** An optional array, bounded; anything else is a changed reply. */
function list(row: Record<string, unknown>, key: string, max: number): unknown[] {
  const value = row[key];
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value) || value.length > max) throw new SchemaError(PROVIDER, `Estes returned an invalid ${key}`);
  return value;
}

function day(value: string): string | null {
  const match = DAY.exec(value);
  return match ? calendarDay(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

/**
 * A date and a clock with its offset, as one instant. Both absent is no
 * clock; anything else that does not read is a changed reply. Luxon accepts
 * hour 24, so it is refused here.
 */
function instant(row: Record<string, unknown>, dateKey: string, timeKey: string): { iso: string; timestamp: number } | null {
  const date = text(row, dateKey, 16);
  const clock = text(row, timeKey, 32);
  if (!date && !clock) return null;
  const match = CLOCK.exec(clock);
  const parsed = day(date) && match && Number(match[1]) <= 23 ? explicitOffsetTime(`${date}T${clock}`) : null;
  if (!parsed) throw new SchemaError(PROVIDER, `Estes returned an invalid ${dateKey}`);
  return parsed;
}

/**
 * The terminal's town and state. Only a terminal movement, whose id is the
 * terminal's own number, is given a place: the pickup and delivery movements
 * stand for the shipper's and the consignee's premises. The street, postcode,
 * phone, fax and coordinates are never read.
 */
function terminalPlace(movement: Record<string, unknown>): string {
  const id = text(movement, 'id', 32);
  const location = record(movement, 'location');
  if (!TERMINAL.test(id) || !location || text(location, 'id', 32) !== id) return '';
  const address = record(location, 'address');
  if (!address) return '';
  const name = text(location, 'name', 100);
  let city = text(address, 'city', 100);
  // The address keeps fifteen characters of the town ("City of Industr");
  // the terminal's name then holds the whole of it.
  const squeezed = (value: string) => value.replace(/\s+/g, '').toLowerCase();
  if (city.length === CITY_FIELD && name.length > city.length && squeezed(name).startsWith(squeezed(city))) city = name;
  return [city, text(address, 'state', 8)].filter((part) => part && !/\d/.test(part)).join(', ');
}

interface Row { event: CarrierEvent; timestamp: number; order: number }

/** The consignee's name and address, from the delivery stop or else the consignee party. */
function consignee(shipment: Record<string, unknown>, movements: unknown[]): { name: string; address: string } {
  const stop = movements.find((movement) => isRecord(movement) && text(movement, 'id', 32) === 'Delivery') as Record<string, unknown> | undefined;
  const place = (stop && record(stop, 'location')) ?? record(shipment, 'consigneeParty');
  const address = place && record(place, 'address');
  if (!place) return { name: '', address: '' };
  const lines = address ? list(address, 'line', 4).map((line) => (typeof line === 'string' ? cleanScalar(line, 120) : '')).filter(Boolean) : [];
  const town = address ? [text(address, 'city', 100), [text(address, 'state', 8), text(address, 'postalCode', 16)].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ') : '';
  return { name: text(place, 'name', 160), address: [...lines, town].filter(Boolean).join('\n') };
}

/** One status row: its clock, Estes's wording, the reason code and the terminal's place. */
function rowOf(status: unknown, location: string, order: number): Row | null {
  if (!isRecord(status)) throw new SchemaError(PROVIDER, 'Estes returned an invalid status');
  const clock = instant(status, 'referenceDate', 'referenceTime');
  const milestone = text(status, 'conciseStatus', 100);
  const description = text(status, 'expandedStatus') || milestone;
  if (!description) throw new SchemaError(PROVIDER, 'Estes returned a status without its wording');
  // A status Estes has not stamped yet, such as a planned stop, is no scan.
  if (!clock) return null;
  const code = text(status, 'reasonCode', 32);
  const staged = estesStage(code, description, { milestone, isException: flag(status, 'isException') });
  return {
    event: {
      time: clock.iso, description, ...(location ? { location } : {}), ...(code ? { provider_code: code } : {}),
      ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}),
    },
    timestamp: clock.timestamp,
    order,
  };
}

/** The estimate's days: the last one, and the first when the period spans several. */
function estimate(shipment: Record<string, unknown>): { expected_delivery: string | null; expected_delivery_from?: string } {
  const period = record(shipment, 'estimatedDelivery');
  const from = period ? day(text(period, 'startDate', 16)) : null;
  const to = period ? day(text(period, 'endDate', 16)) ?? from : null;
  if (!to) return { expected_delivery: null };
  return { expected_delivery: to, ...(from && from < to ? { expected_delivery_from: from } : {}) };
}

/**
 * The reply of `GET /shipmenttracking/history?pro={number}`: `data` holds the
 * shipment the PRO names, with its current status and its movements (pickup,
 * terminals, delivery), each with its status rows. Every clock carries its
 * offset. The consignee's name and address and the person who signed are
 * read; the shipper, the driver, the appointment, references, documents and
 * coordinates are not.
 */
export function parseEstes(payload: unknown, raw: string): CarrierResult {
  const number = normalizeEstesNumber(raw);
  if (!isRecord(payload) || !Array.isArray(payload.data)) throw new SchemaError(PROVIDER, 'Estes returned an unexpected reply');
  const error = record(payload, 'error');
  const code = error?.code ?? 0;
  if (typeof code !== 'number') throw new SchemaError(PROVIDER, 'Estes returned an invalid error code');
  if (code === NOT_FOUND_CODE) throw new NotFoundError(PROVIDER);
  if (code === INVALID_CODE) throw new InvalidInputError(PROVIDER, 'Estes does not take this PRO number', { reason: 'wrong_number' });
  if (code !== 0) throw new IndeterminateError(PROVIDER, 'Estes returned an error for the PRO number');
  // The tracking page reads an answer without a shipment as "information
  // received, check back later": the PRO is known but has nothing to show yet.
  if (payload.data.length === 0) throw new NoHistoryError(PROVIDER);
  const matches = payload.data.filter((entry) => {
    if (!isRecord(entry)) throw new SchemaError(PROVIDER, 'Estes returned an invalid shipment');
    return text(entry, 'pro', 32) === number;
  }) as Record<string, unknown>[];
  if (matches.length === 0) throw new SchemaError(PROVIDER, 'Estes answered for another PRO number');
  if (matches.length > 1) throw new IndeterminateError(PROVIDER, 'Estes returned several shipments for the PRO number');
  const shipment = matches[0]!;
  if (text(shipment, 'error')) throw new IndeterminateError(PROVIDER, 'Estes returned an error for the shipment');

  const rows: Row[] = [];
  const seen = new Set<string>();
  let order = 0;
  const movements = list(shipment, 'movementHistory', MAX_MOVEMENTS);
  for (const movement of movements) {
    if (!isRecord(movement)) throw new SchemaError(PROVIDER, 'Estes returned an invalid movement');
    const place = terminalPlace(movement);
    for (const status of list(movement, 'statusHistory', MAX_ROWS)) {
      const row = rowOf(status, place, order++);
      if (!row) continue;
      const key = JSON.stringify(row.event);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
      if (rows.length > MAX_ROWS) throw new SchemaError(PROVIDER, 'Estes returned an oversized history');
    }
  }
  // The shipment's current status: a scan of its own when it is newer than
  // every movement's, and the whole answer when no movement has a scan yet.
  const current = record(shipment, 'status');
  const summary = current ? rowOf(current, '', order) : null;
  const summaryOnly = rows.length === 0;
  if (summary && !summaryOnly && rows.every((row) => summary.timestamp > row.timestamp)) rows.push(summary);
  if (summaryOnly && !summary) throw new NoHistoryError(PROVIDER);

  // Newest first by instant; rows stamped alike keep the later one listed first.
  rows.sort((left, right) => right.timestamp - left.timestamp || right.order - left.order);
  const events = rows.map((row) => row.event);
  const newest = summaryOnly ? summary!.event : events[0]!;
  const decider = summaryOnly ? newest : events.find((event) => event.stage);
  const stage = decider?.stage as Stage | undefined;
  const delivered = stage === 'delivered' ? instant(shipment, 'deliveryDate', 'deliveryTime') : null;
  const pounds = Number(text(shipment, 'totalWeight', 16));
  const recipient = consignee(shipment, movements);
  const signedBy = text(shipment, 'receivedBy', 160);
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: decider!.stage_source } : {}),
    last_status_text: newest.description!,
    ...(summaryOnly && newest.provider_code ? { provider_code: newest.provider_code } : {}),
    last_update: newest.time!,
    ...(stage && FINAL.has(stage) ? { expected_delivery: null } : estimate(shipment)),
    ...(delivered ? { delivered_at: delivered.iso } : {}),
    ...(Number.isFinite(pounds) && pounds > 0 && pounds < 1_000_000 ? { weight_kg: Math.round(pounds * POUNDS_TO_KG * 1000) / 1000 } : {}),
    ...(recipient.name ? { receiver_name: recipient.name } : {}),
    ...(recipient.address ? { receiver_address: recipient.address } : {}),
    ...(signedBy ? { signed_by: signedBy } : {}),
    ...(summaryOnly ? { summary_only: true } : {}),
    // A summary is no scan of its own.
    events: summaryOnly ? [] : events.slice(0, MAX_EVENTS),
    ...(events.length > MAX_EVENTS ? { history_truncated: true } : {}),
  };
}
