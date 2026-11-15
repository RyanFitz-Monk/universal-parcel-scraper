import { ChallengeError, InvalidInputError, NotFoundError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { leadingScan } from '../../core/result/unstaged.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { explicitOffsetTime, zonedTime, type ParsedTime } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { houndStage, statusMap } from './status.js';

export const PROVIDER = 'Hound Express';
export const HOUND_EXPRESS_MAX_BYTES = 1024 * 1024;
export const HOUND_EXPRESS_URL = 'https://ws_pods.hound-express.com/Sabueso/ws/deliveryServices/trackOrder';
export type HoundLanguage = 'en' | 'es';

/** A guide number: sixteen digits, twenty-two characters or `HP` and sixteen digits, up to the thirty the service takes. */
export function normalizeHoundNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{10,30}$/.test(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

const folded = (value: unknown): string => (typeof value === 'string' ? value.toUpperCase().replace(/[\s.-]/g, '') : '');
const CHALLENGE_PAGE = /<title>\s*(?:Just a moment|Attention Required)|_cf_chl_opt|captcha|access denied/i;
const ZONELESS = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/**
 * A scan's clock. The service documents `dateTimeISO` with its offset, and `dateTime` as a
 * wall clock on UTC−06:00, central Mexico's time all year since 2022.
 */
function scanTime(row: Record<string, unknown>): ParsedTime | null {
  const iso = explicitOffsetTime(row.dateTimeISO);
  if (iso) return iso;
  const written = clean(row.dateTime, 32);
  return ZONELESS.test(written) ? zonedTime(written, 'yyyy-MM-dd HH:mm:ss', 'UTC-6') : null;
}

/** Read one reply of the tracker: the guide asked about, a missing one, or a failure of its own kind. */
export function parseHoundReply(body: string, rawNumber: string, language: HoundLanguage = 'en'): CarrierResult {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch (cause) {
    if (CHALLENGE_PAGE.test(body.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'Hound Express answered with a verification page', { cause });
    throw new SchemaError(PROVIDER, 'Hound Express answered with a page instead of its tracking JSON', { cause });
  }
  return parseHound(payload, rawNumber, language);
}

interface Scan { event: CarrierEvent; at: number; index: number }

export function parseHound(payload: unknown, rawNumber: string, language: HoundLanguage = 'en'): CarrierResult {
  const number = normalizeHoundNumber(rawNumber);
  // One guide asked, one guide answered.
  const guide: unknown = Array.isArray(payload) && payload.length === 1 ? (payload as unknown[])[0] : undefined;
  if (!isRecord(guide)) throw new SchemaError(PROVIDER, 'Hound Express returned no guide');
  const details = guide.resultDetails;
  if (details !== undefined && !Array.isArray(details)) throw new SchemaError(PROVIDER, 'Hound Express returned an unreadable history');
  // A guide the service never handled: `flag` 100, which the page reports as not operated in its system.
  if (guide.flag === 100) throw new NotFoundError(PROVIDER);
  if (Array.isArray(guide.wsErrors) && guide.wsErrors.length) {
    throw new TransportError(PROVIDER, 'Hound Express could not read the guide');
  }
  if (!details?.length) {
    // An unknown guide: no history, no guide number, and the warning `GONULL`.
    const warnings = Array.isArray(guide.wsWarnings) ? guide.wsWarnings : [];
    if (guide.guideNumber === undefined && warnings.some(warning => isRecord(warning) && warning.code === 'GONULL')) throw new NotFoundError(PROVIDER);
    throw new SchemaError(PROVIDER, 'Hound Express returned a guide without its history');
  }
  if (folded(guide.guideNumber) !== number) throw new SchemaError(PROVIDER, 'Hound Express did not identify the requested guide');
  if (details.length > 500) throw new SchemaError(PROVIDER, 'Hound Express returned too long a history');

  const scans: Scan[] = [];
  for (const [index, row] of details.entries()) {
    const status = isRecord(row) ? row.statusObj : undefined;
    if (!isRecord(row) || !isRecord(status)) throw new SchemaError(PROVIDER, 'Hound Express returned an event without its status');
    const id = typeof status.id === 'number' && Number.isInteger(status.id) && status.id >= 0 ? String(status.id)
      : typeof status.id === 'string' && /^\d{1,6}$/.test(status.id) ? String(Number(status.id)) : '';
    const spanish = clean(status.description, 120);
    const wording = (language === 'en' ? clean(status.description_en, 120) : '') || spanish;
    const at = scanTime(row);
    if (!id || !wording || !at) throw new SchemaError(PROVIDER, 'Hound Express returned an event without a status or a readable clock');
    const stage = houndStage(id, spanish, clean(status.description_en, 120));
    const location = clean(row.location, 120);
    scans.push({ at: at.timestamp, index, event: {
      time: at.iso, description: wording, provider_code: id,
      ...(location ? { location } : {}),
      ...(stage ? { stage, stage_source: 'carrier_map' } : {}),
    } });
  }
  // The service lists the oldest scan first.
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
