import { DateTime } from 'luxon';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { pduStage, pduState } from './status.js';

export const PROVIDER = 'PDU';
export const PDU_MAX_BYTES = 512_000;
// The service PDU's tracking page posts its numbers to, as a JSON array.
export const PDU_ENDPOINT = 'https://www.pduni.com/system/api/logistics/traceByWeb';
export const PDU_PAGE = 'https://www.pduni.com/MV/en/customer-services/waybill-inquiry';

const NUMBER = /^[A-Z0-9]{6,40}$/;
const MAX_SCANS = 300;
// The last-mile carrier's code, written before its wording without a space: "ENT,Entregado".
const CODED = /^([A-Za-z]{2,12}),(?! )(.+)$/s;
const WALL = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?$/;
const OFFSET = /^UTC([+-])(\d{1,2})(?::?(\d{2}))?$/;
// States whose stage no scan may carry: the parcel's end or a problem with it.
const STATE_DECIDES = new Set<Stage>(['delivered', 'returned', 'exception']);
const CHALLENGE_PAGE = /<title>\s*(?:Just a moment|Attention Required)|_cf_chl_opt|captcha|access denied/i;

/** PDU publishes no layout; its page splits what it is given on spaces and asks for each token. */
export function normalizePduNumber(raw: string): string {
  const number = typeof raw === 'string' && raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (NUMBER.test(number)) return number;
  throw new InvalidInputError(PROVIDER, 'PDU tracks numbers of six to forty letters and digits');
}

export function pduJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (cause) {
    if (CHALLENGE_PAGE.test(body.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'PDU answered with a verification page', { cause });
    throw new SchemaError(PROVIDER, 'PDU answered with a page instead of its tracking JSON', { cause });
  }
}

/** An optional text field; anything but a string is a changed reply. */
function text(row: Record<string, unknown>, key: string, maxLength: number): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new SchemaError(PROVIDER, `PDU returned an invalid ${key}`);
  return clean(value, maxLength);
}

/**
 * The scan's instant: its wall clock with the UTC offset PDU states beside it ("UTC-5"), or
 * else its Beijing clock, which the replies give for the same instant.
 */
function timeOf(row: Record<string, unknown>): string {
  const written = text(row, 'trackRealTime', 40);
  const wall = WALL.exec(written);
  if (written && !wall) throw new SchemaError(PROVIDER, 'PDU returned an unreadable scan time');
  const zone = OFFSET.exec(text(row, 'trackTimeZone', 16).replace(/\s+/g, ''));
  const beijing = WALL.exec(text(row, 'trackCnTime', 40));
  let stated: DateTime | undefined;
  if (wall && zone) {
    const [hours, minutes] = [Number(zone[2]), Number(zone[3] ?? '0')];
    if (hours > 14 || minutes > 59) throw new SchemaError(PROVIDER, 'PDU returned an unreadable time zone');
    stated = DateTime.fromISO(`${wall[1]}T${wall[2]}${zone[1]}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, { setZone: true });
  } else if (beijing) {
    stated = DateTime.fromISO(`${beijing[1]}T${beijing[2]}+08:00`, { setZone: true });
  }
  if (!stated?.isValid) throw new SchemaError(PROVIDER, 'PDU returned an unreadable scan time');
  return stated.toISO({ suppressMilliseconds: true })!;
}

interface Scan { event: CarrierEvent; timestamp: number }

function scanOf(row: unknown): Scan {
  if (!isRecord(row)) throw new SchemaError(PROVIDER, 'PDU returned an invalid scan');
  const written = text(row, 'trackDescription', 300);
  const coded = CODED.exec(written);
  const description = coded ? clean(coded[2], 300) : written;
  const state = text(row, 'trackStatus', 40);
  if (!description && !state) throw new SchemaError(PROVIDER, 'PDU returned a scan without a wording');
  if (state && !/^[A-Z_]{2,40}$/.test(state)) throw new SchemaError(PROVIDER, 'PDU returned an invalid scan state');
  const wording = description || pduState(state)?.label || state;
  const stage = pduStage(state || null, wording);
  const location = text(row, 'trackLocation', 200);
  const time = timeOf(row);
  return {
    event: {
      time, description: wording, ...(coded && description !== written ? { original_description: written } : {}),
      ...(location ? { location } : {}), ...(state ? { provider_code: state } : {}),
      ...(stage ? { stage, stage_source: 'carrier_map' } : {}),
    },
    timestamp: Date.parse(time),
  };
}

/** The parcel's number as PDU writes it, compared in the requested number's form. */
const folded = (value: unknown): string => (typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '');

/**
 * The reply of `POST /system/api/logistics/traceByWeb`: counts of the numbers asked by state,
 * and `orderTracks`, each number's record with its state and its scans, newest first, each with
 * the last-mile carrier's wall clock and the offset PDU states for it.
 */
export function parsePdu(payload: unknown, rawNumber: string): CarrierResult {
  const number = normalizePduNumber(rawNumber);
  if (!isRecord(payload) || typeof payload.success !== 'boolean') throw new SchemaError(PROVIDER, 'PDU returned no answer');
  if (!payload.success || payload.code !== 200) throw new IndeterminateError(PROVIDER, 'PDU did not answer the lookup');
  const data = payload.data;
  if (!isRecord(data) || !Array.isArray(data.orderTracks)) throw new SchemaError(PROVIDER, 'PDU returned no tracks');
  const record = data.orderTracks.find(track => isRecord(track) && folded(track.serviceTrackingNumber ?? track.trackingNumber) === number);
  const counts = isRecord(data.orderTrackStatus) ? data.orderTrackStatus : {};
  if (!isRecord(record)) {
    // The page counts a number PDU does not know under "not found".
    if (!data.orderTracks.length && typeof counts.nonExists === 'number' && counts.nonExists > 0) throw new NotFoundError(PROVIDER);
    throw new IndeterminateError(PROVIDER, 'PDU answered without the requested number');
  }
  const rows = record.trackDetailList ?? [];
  if (!Array.isArray(rows)) throw new SchemaError(PROVIDER, 'PDU returned an invalid history');
  if (rows.length > MAX_SCANS) throw new SchemaError(PROVIDER, 'PDU returned an oversized history');
  const state = text(record, 'trackStatus', 40);
  // The page files a number without a state under "not found".
  if (!rows.length && (!state || state === 'NOT_FOUND')) throw new NotFoundError(PROVIDER);
  const stated = state ? pduState(state) : undefined;
  if (state && state !== 'NOT_FOUND' && !stated) throw new SchemaError(PROVIDER, 'PDU returned an unknown parcel state');
  if (!rows.length) throw new NoHistoryError(PROVIDER, 'PDU lists the parcel but holds no scan yet', { reason: 'listed' });

  // Newest first, as the page lists them; scans at the same instant keep the reply's order.
  const scans = rows.map(scanOf);
  scans.sort((left, right) => right.timestamp - left.timestamp);
  const events = scans.map(({ event }) => event);
  const latest = events[0]!;
  const scanned = events.find(event => event.stage);
  const byState = stated !== undefined && STATE_DECIDES.has(stated.stage) && scanned?.stage !== stated.stage;
  const stage = (byState ? stated.stage : scanned?.stage ?? stated?.stage) as Stage | undefined;
  const delivered = stage === 'delivered' ? events.find(event => event.stage === 'delivered')?.time : undefined;
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: byState ? stated.label : latest.description!,
    ...(stated && state !== latest.provider_code ? { provider_code: state } : {}),
    last_update: latest.time!,
    expected_delivery: null,
    ...(delivered ? { delivered_at: delivered } : {}),
    events,
  };
}
