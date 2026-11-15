import { ChallengeError, InvalidInputError, NotFoundError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { leadingScan } from '../../core/result/unstaged.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { explicitOffsetTime } from '../../core/time/index.js';
import { isRecord } from '../../core/types.js';
import { statusMap, xpressStatus } from './status.js';

export const PROVIDER = 'Xpress Logistics';
export const XPRESS_LOGISTICS_MAX_BYTES = 1024 * 1024;

/** The tracking page takes a parcel number of nine digits and asks for nothing shorter or longer. */
export function normalizeXpressNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{9}$/.test(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

/** The address the tracking page reads one parcel from. */
export function xpressLogisticsUrl(number: string): string {
  return `https://xpresslogistics.conselio.com/search/${number}`;
}

const CHALLENGE_PAGE = /<title>\s*(?:Just a moment|Attention Required)|_cf_chl_opt|captcha|access denied/i;
const NAME = /^[a-z][a-z ]{0,39}$/;

/** Read one reply of the service: a parcel, a missing one, or a failure of its own kind. */
export function parseXpressReply(status: number, body: string, rawNumber: string): CarrierResult {
  // The service answers a number it does not know with no content.
  if (status === 204 && body.trim() === '') throw new NotFoundError(PROVIDER);
  if (status === 404) throw new TransportError(PROVIDER, 'Xpress Logistics tracking service is unavailable', { status });
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (cause) {
    if (CHALLENGE_PAGE.test(body.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'Xpress Logistics answered with a verification page', { cause });
    throw new SchemaError(PROVIDER, 'Xpress Logistics answered with a page instead of its tracking JSON', { cause });
  }
  return parseXpress(payload, rawNumber);
}

interface Scan { event: CarrierEvent; at: number; index: number }

export function parseXpress(payload: unknown, rawNumber: string): CarrierResult {
  normalizeXpressNumber(rawNumber);
  // The service is asked by the parcel's own address, and its reply names no number.
  if (!isRecord(payload) || !Array.isArray(payload.status) || !payload.status.length || payload.status.length > 500) {
    throw new SchemaError(PROVIDER, 'Xpress Logistics returned no parcel');
  }
  const scans: Scan[] = [];
  for (const [index, row] of payload.status.entries()) {
    const name = isRecord(row) && typeof row.status === 'string' ? row.status.trim() : '';
    const at = isRecord(row) ? explicitOffsetTime(row.created_at) : null;
    if (!NAME.test(name) || !at) throw new SchemaError(PROVIDER, 'Xpress Logistics returned a status without a name or a clock with an offset');
    const known = xpressStatus(name);
    scans.push({ at: at.timestamp, index, event: {
      time: at.iso, description: known?.fr ?? `${name.charAt(0).toUpperCase()}${name.slice(1)}`, provider_code: name,
      ...(known ? { stage: known.stage, stage_source: 'carrier_map' } : {}),
    } });
  }
  // The page sorts the statuses by their clocks and shows the later of two on one clock first.
  scans.sort((left, right) => right.at - left.at || right.index - left.index);
  const events = scans.map(({ event }) => event);
  // A delivery stands only while no newer status may have undone it (`leadingScan`).
  const stage = leadingScan(events, statusMap)?.stage as Stage | undefined;
  const delivered = stage === 'delivered' ? events.find(event => event.stage === 'delivered') : undefined;
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: events[0]!.description!,
    last_update: events[0]!.time ?? null,
    expected_delivery: null,
    ...(delivered ? { delivered_at: delivered.time } : {}),
    events: events.slice(0, 100),
    ...(events.length > 100 ? { history_truncated: true } : {}),
  };
}
