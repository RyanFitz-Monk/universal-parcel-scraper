import { ChallengeError, InvalidInputError, NotFoundError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { explicitOffsetTime } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { qtFailureReason, qtStatus } from './status.js';

export const PROVIDER = 'QT Express';
export const QT_EXPRESS_MAX_BYTES = 1024 * 1024;
export type QtLanguage = 'en' | 'hu';

/** QT Express publishes no layout, so a number is one token of letters, digits, hyphens and underscores. */
export function normalizeQtNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,39}$/.test(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

/** The address the tracking site reads one parcel from. */
export function qtExpressUrl(number: string): string {
  return `https://tracking.qtlogistics.eu/api/v1/trackings/${encodeURIComponent(number)}`;
}

// A number reaches the adapter in capitals and without separators, so the reply's own is compared the same way.
const folded = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value).toUpperCase().replace(/[\s.-]/g, '') : '');
const CHALLENGE_PAGE = /<title>\s*(?:Just a moment|Attention Required)|_cf_chl_opt|captcha|access denied/i;
const NAME = /^[A-Z][A-Z ]{0,63}$/;

/** Read one reply of the tracking service: a parcel, a missing one, or a failure of its own kind. */
export function parseQtReply(status: number, body: string, rawNumber: string, language: QtLanguage = 'en'): CarrierResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (cause) {
    if (CHALLENGE_PAGE.test(body.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'QT Express answered with a verification page', { cause });
    throw new SchemaError(PROVIDER, 'QT Express answered with a page instead of its tracking JSON', { cause });
  }
  if (status === 404) {
    if (isRecord(payload) && payload.error === 'not found') throw new NotFoundError(PROVIDER);
    throw new TransportError(PROVIDER, 'QT Express tracking service is unavailable', { status });
  }
  return parseQt(payload, rawNumber, language);
}

interface Scan { event: CarrierEvent; at: number; index: number }

export function parseQt(payload: unknown, rawNumber: string, language: QtLanguage = 'en'): CarrierResult {
  const number = normalizeQtNumber(rawNumber);
  if (!isRecord(payload) || !Array.isArray(payload.events) || payload.events.length > 500) throw new SchemaError(PROVIDER, 'QT Express returned no parcel');
  if (folded(payload.trackingNumber) !== folded(number)) throw new SchemaError(PROVIDER, 'QT Express did not identify the requested number');
  // The page shows its own "not found" for a parcel without a step.
  if (!payload.events.length) throw new NotFoundError(PROVIDER);

  const scans: Scan[] = [];
  for (const [index, row] of payload.events.entries()) {
    if (!isRecord(row)) throw new SchemaError(PROVIDER, 'QT Express returned an incomplete event');
    const name = clean(row.title, 80).toUpperCase();
    const at = explicitOffsetTime(row.date);
    if (!NAME.test(name) || !at) throw new SchemaError(PROVIDER, 'QT Express returned an event without a status or a clock with an offset');
    const known = qtStatus(name);
    const wording = known?.[language] ?? `${name.charAt(0)}${name.slice(1).toLowerCase()}`;
    // The service writes a failed delivery's reason after a dash, and its code beside it.
    const written = clean(row.description, 300).replace(/\s*-\s*(?:undefined|null|n\/a|-)\s*$/i, '').trim();
    const failed = name === 'DELIVERY FAILED' ? /^delivery failed(?:\s*-\s*(.*))?$/i.exec(written) : null;
    const reason = name === 'DELIVERY FAILED' ? qtFailureReason(row.failureReasonCode, clean(failed?.[1], 200), language) : '';
    scans.push({ at: at.timestamp, index, event: {
      time: at.iso, description: reason ? `${wording} – ${reason}` : wording, provider_code: name,
      ...(known ? { stage: known.stage, stage_source: 'carrier_map' } : {}),
    } });
  }
  // The service lists the newest event first.
  scans.sort((left, right) => right.at - left.at || left.index - right.index);
  const events = scans.map(({ event }) => event);
  const stage = events.find(event => event.stage)?.stage as Stage | undefined;
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
