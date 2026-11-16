import { DELIVERY_POSTCODE, deliveryPostcodeText } from '../../core/catalog/postcode.js';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { IndeterminateError, InputRequiredError, InvalidInputError, NoHistoryError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { windowEstimate } from '../../core/result/window.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { isoTime } from '../../core/time/index.js';
import { clean } from '../../core/transport/index.js';
import { isRecord, type JsonObject } from '../../core/types.js';
import { glsNlCode, glsNlStage } from './status.js';

export const PROVIDER = 'GLS Netherlands';
export const GLS_NL_ZONE = 'Europe/Amsterdam';
// A long history with a ParcelShop's photo stays well under this.
export const GLS_NL_MAX_BYTES = 1024 * 1024;
/**
 * The 14-digit parcel number, the 11- or 12-digit GLS number a parcel from
 * abroad keeps (its 14-digit form starts with 00 and ends in another check
 * digit), or the 8-character track ID.
 */
const NUMBER = /^(?:\d{11,12}|\d{14}|(?=[A-Z0-9]{8}$)(?=.*[A-Z])[A-Z0-9]{8})$/;
const DUTCH_POSTCODE = /^([1-9]\d{3}) ?([A-Z]{2})$/;
// GLS's clocks, with milliseconds at times and never an offset.
const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.\d{1,7})?$/;
const MAX_SCANS = 300;
const MAX_EVENTS = 100;
const ENDED: ReadonlySet<Stage> = new Set(['delivered', 'returned']);

/** A GLS Netherlands number in capitals, as the tracker takes it; anything else is not one GLS issues. */
export function normalizeGlsNlNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (!NUMBER.test(number)) {
    throw new InvalidInputError(PROVIDER, 'GLS Netherlands numbers are 11, 12 or 14 digits, or an 8-character track ID');
  }
  return number;
}

/**
 * The recipient's postcode, which GLS asks for with every number: a Dutch
 * one without its space, any other as typed, in capitals. Without it the
 * tracker shows nothing, so no request is made.
 */
export function normalizeGlsNlPostcode(raw: string | null | undefined): string {
  const postcode = deliveryPostcodeText(raw ?? '');
  if (!postcode) throw new InputRequiredError(PROVIDER, 'postcode', 'GLS Netherlands shows a parcel only with its delivery postcode');
  const dutch = DUTCH_POSTCODE.exec(postcode);
  if (dutch) return `${dutch[1]}${dutch[2]}`;
  if (!DELIVERY_POSTCODE.test(postcode)) throw new InvalidInputError(PROVIDER, 'GLS Netherlands requires a valid delivery postcode');
  return postcode;
}

const text = (value: unknown, maxLength = 300) => clean(value, maxLength);
const integer = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 100_000 ? value : null);

/** The numbers the reply files the parcel under: its parcel number, its GLS number and its track ID. */
function identifiers(payload: JsonObject): string[] {
  return [payload.parcelNo, payload.gpNo, payload.uniqueNo]
    .map((value) => normalizeTrackingNumber(text(value, 32)))
    .filter(Boolean);
}

/** A depot's name without the code GLS adds after some, as "RUP Essen DE 043" or "Kaunas LT1KAU". */
function depotName(value: unknown, country: string): string {
  const name = text(value, 120);
  if (!name || name === '-') return '';
  const code = country ? new RegExp(`\\s*-?\\s*${country}\\s?(?=[A-Z0-9]*\\d)[A-Z0-9]{3,4}$`) : null;
  return (code ? name.replace(code, '') : name).trim();
}

type Scan = CarrierEvent & { local_time: string; time: string; description: string };

function scanOf(raw: JsonObject): Scan {
  const clock = WALL_CLOCK.exec(text(raw.dateTime, 40))?.[1];
  const time = clock ? isoTime(clock, GLS_NL_ZONE) : null;
  if (!clock || !time) throw new SchemaError(PROVIDER, 'GLS Netherlands returned an invalid scan time');
  const [event, reason] = [integer(raw.eventNo), integer(raw.reasonNo)];
  if (event === null || reason === null) throw new SchemaError(PROVIDER, 'GLS Netherlands returned a scan without its event number');
  const code = glsNlCode(event, reason);
  const description = text(raw.eventReasonDescr);
  const country = /^[A-Z]{2}$/.test(text(raw.countryCode, 8)) ? text(raw.countryCode, 8) : '';
  const depot = depotName(raw.depotName, country);
  const stage = glsNlStage(code, integer(raw.state));
  return {
    time: time.iso,
    local_time: clock,
    time_zone: GLS_NL_ZONE,
    time_zone_basis: 'carrier',
    description,
    ...(depot ? { location: country ? `${depot}, ${country}` : depot } : country ? { location: country } : {}),
    provider_code: code,
    ...(stage ? { stage, stage_source: 'carrier_map' } : {}),
  };
}

/** The ParcelShop or locker GLS left the parcel at: its name, then its street and town on their own lines. */
function pickupPoint(payload: JsonObject): string | null {
  const info = isRecord(payload.deliveryScanInfo) ? payload.deliveryScanInfo : {};
  const point = [info.parcelShop, info.apl].find(isRecord);
  if (!point) return null;
  const name = text(point.name1 ?? point.name, 120);
  if (!name) return null;
  const place = isRecord(point.location) ? point.location : {};
  const street = [text(place.street, 120), text(place.houseNo, 12), text(place.houseNoAddition, 12)].filter(Boolean).join(' ');
  const town = [text(place.zipCode, 12), text(place.city, 80)].filter(Boolean).join(' ');
  return street && town ? `${name}\n${street}\n${town}` : name;
}

/** The delivery window GLS shows: its earliest and latest times, or the day alone when it gives one time at midnight. */
function estimate(payload: JsonObject): Pick<CarrierResult, 'expected_delivery' | 'expected_delivery_from'> {
  const status = isRecord(payload.deliveryStatus) ? payload.deliveryStatus : {};
  const [from, to, at] = [text(status.etaTimestampMin, 40), text(status.etaTimestampMax, 40), text(status.etaTimestamp, 40)];
  if (from && to) return windowEstimate(from, to);
  return { expected_delivery: at ? windowEstimate(at, null).expected_delivery : null };
}

function weight(payload: JsonObject): number | null {
  const value = payload.weighedWeight;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 10_000 ? value : null;
}

/**
 * GLS Netherlands' reply for one number and postcode: the parcel, filed under
 * its parcel number, GLS number and track ID, with its scans oldest first on
 * GLS's clocks, which carry no offset and are read in the Netherlands.
 */
export function parseGlsNl(payload: unknown, rawNumber: string): CarrierResult {
  const number = normalizeGlsNlNumber(rawNumber);
  if (!isRecord(payload) || !Array.isArray(payload.scans)) throw new SchemaError(PROVIDER, 'GLS Netherlands returned an unexpected reply');
  if (!identifiers(payload).includes(number)) throw new IndeterminateError(PROVIDER, 'GLS Netherlands answered for another parcel');
  if (payload.scans.length > MAX_SCANS) throw new SchemaError(PROVIDER, 'GLS Netherlands returned an oversized history');
  const seen = new Set<string>();
  const scans: Scan[] = [];
  for (const raw of payload.scans) {
    if (!isRecord(raw)) throw new SchemaError(PROVIDER, 'GLS Netherlands returned an invalid scan');
    const scan = scanOf(raw);
    const key = JSON.stringify([scan.local_time, scan.provider_code, scan.description, scan.location ?? '']);
    if (seen.has(key)) continue;
    seen.add(key);
    scans.push(scan);
  }
  if (!scans.length) throw new NoHistoryError(PROVIDER);
  // Oldest first, as GLS lists them; scans at one clock keep GLS's order.
  const events = scans
    .map((scan, index) => ({ scan, index }))
    .sort((left, right) => Date.parse(right.scan.time) - Date.parse(left.scan.time) || right.index - left.index)
    .map(({ scan }) => scan);
  const staged = events.find((event) => event.stage);
  const stage = staged?.stage as Stage | undefined;
  const newest = events[0]!;
  const country = text(payload.countryCode, 8);
  const ended = stage ? ENDED.has(stage) : false;
  const kilos = weight(payload);
  const point = pickupPoint(payload);
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: newest.description || null,
    last_update: newest.time,
    ...(ended || stage === 'ready_for_pickup' ? { expected_delivery: null } : estimate(payload)),
    ...(stage === 'delivered' ? { delivered_at: staged!.time } : {}),
    ...(point && (stage === 'ready_for_pickup' || stage === 'delivered') ? { pickup_point: point } : {}),
    ...(kilos !== null ? { weight_kg: kilos } : {}),
    ...(/^[A-Z]{2}$/.test(country) ? { destination_country: country } : {}),
    timezone: GLS_NL_ZONE,
    events: events.slice(0, MAX_EVENTS),
    ...(events.length > MAX_EVENTS ? { history_truncated: true } : {}),
  };
}
