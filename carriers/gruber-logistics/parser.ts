import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { leadingScan } from '../../core/result/unstaged.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { explicitOffsetTime } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { gruberEventName, gruberStage, statusMap, type GruberLanguage } from './status.js';

export const PROVIDER = 'GRUBER Logistics';
export const GRUBER_PAGE = 'https://glapptracking.gruber-logistics.com';
export const GRUBER_CONFIG_URL = `${GRUBER_PAGE}/config.json`;
export const GRUBER_CONFIG_MAX_BYTES = 16 * 1024;
export const GRUBER_MAX_BYTES = 1024 * 1024;

/** A tracking id: letters and digits, as the tracker's search box takes them. */
export function normalizeGruberNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{6,30}$/.test(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

const CHALLENGE_PAGE = /<title>\s*(?:Just a moment|Attention Required)|_cf_chl_opt|captcha|access denied/i;

function json(body: string, what: string): unknown {
  try {
    return JSON.parse(body);
  } catch (cause) {
    if (CHALLENGE_PAGE.test(body.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'GRUBER Logistics answered with a verification page', { cause });
    throw new SchemaError(PROVIDER, `GRUBER Logistics answered with a page instead of ${what}`, { cause });
  }
}

export interface GruberGateway { base: string; key: string }

/** The tracking page's settings, which give every visitor its gateway and the key the page sends it. */
export function parseGruberConfig(body: string): GruberGateway {
  const config = json(body, 'its settings');
  const base = isRecord(config) ? clean(config.VUE_APP_GATEWAY_BASE_URL, 200) : '';
  const key = isRecord(config) && typeof config.VUE_APP_TRACKING_API_KEY === 'string' ? config.VUE_APP_TRACKING_API_KEY : '';
  let url: URL | undefined;
  try {
    url = new URL(base);
  } catch {
    url = undefined;
  }
  // Only a GRUBER host gets the number.
  if (!url || url.protocol !== 'https:' || !/(?:^|\.)gruber-logistics\.com$/.test(url.hostname) || !/^[\w-]{8,200}$/.test(key)) {
    throw new SchemaError(PROVIDER, 'GRUBER Logistics\'s tracking page did not give its gateway');
  }
  return { base: url.origin, key };
}

/**
 * Read the gateway's answer. The page reads 404 as an unknown number, 406 as a shipment too old to
 * show and 422 as data it cannot get; the gateway answers a route it does not have with 404 and
 * `Cannot GET`.
 */
export function parseGruberReply(status: number, body: string, rawNumber: string, language: GruberLanguage = 'en'): CarrierResult {
  const number = normalizeGruberNumber(rawNumber);
  if (status === 404) {
    const reply = body.trim() ? json(body, 'its tracking JSON') : undefined;
    if (isRecord(reply) && typeof reply.message === 'string' && /^Cannot [A-Z]+ \//.test(reply.message)) {
      throw new TransportError(PROVIDER, 'GRUBER Logistics\'s gateway no longer has its tracking route');
    }
    throw new NotFoundError(PROVIDER);
  }
  if (status === 406) throw new IndeterminateError(PROVIDER, 'GRUBER Logistics no longer shows a shipment this old', { reason: 'history_expired' });
  if (status === 422) throw new IndeterminateError(PROVIDER, 'GRUBER Logistics could not get the shipment\'s tracking data');
  return parseGruber(json(body, 'its tracking JSON'), number, language);
}

interface Scan { event: CarrierEvent; at: number; index: number }

const folded = (value: unknown): string => (typeof value === 'string' ? value.trim().toUpperCase() : '');

export function parseGruber(payload: unknown, rawNumber: string, language: GruberLanguage = 'en'): CarrierResult {
  const number = normalizeGruberNumber(rawNumber);
  if (!isRecord(payload)) throw new SchemaError(PROVIDER, 'GRUBER Logistics returned no shipment');
  // The page leaves for another address when the gateway answers with one.
  if ('redirectUrl' in payload) throw new IndeterminateError(PROVIDER, 'GRUBER Logistics tracks the shipment on another page');
  if (folded(payload.id_tracking) !== number) throw new SchemaError(PROVIDER, 'GRUBER Logistics did not identify the requested shipment');
  const rows = payload.events ?? [];
  if (!Array.isArray(rows)) throw new SchemaError(PROVIDER, 'GRUBER Logistics returned an unreadable history');
  if (rows.length > 500) throw new SchemaError(PROVIDER, 'GRUBER Logistics returned too long a history');

  const scans: Scan[] = [];
  for (const [index, row] of rows.entries()) {
    const type = isRecord(row) ? row.event_type : undefined;
    const code = isRecord(type) ? clean(type.name, 16) : '';
    if (!isRecord(row) || !/^[A-Za-z0-9-]{1,16}$/.test(code)) throw new SchemaError(PROVIDER, 'GRUBER Logistics returned an event without its code');
    // An event still expected carries only the time planned for it.
    if (row.isExpected === true || row.datetime === null || row.datetime === undefined || row.datetime === '') continue;
    const at = explicitOffsetTime(row.datetime);
    if (!at) throw new SchemaError(PROVIDER, 'GRUBER Logistics returned an event without a readable clock');
    const description = gruberEventName(code, language) ?? clean(isRecord(type) ? type.description : '', 120);
    const address = isRecord(row.address) ? row.address : {};
    const location = [clean(address.localita, 80), clean(address.nazione, 8)].filter(Boolean).join(', ');
    const stage = gruberStage(code);
    scans.push({ at: at.timestamp, index, event: {
      time: at.iso, description: description || code, provider_code: code,
      ...(location ? { location } : {}),
      ...(stage ? { stage, stage_source: 'carrier_map' } : {}),
    } });
  }
  // The order exists and has no event yet: received or planned.
  if (!scans.length) throw new NoHistoryError(PROVIDER, 'GRUBER Logistics lists the shipment without an event', { reason: 'listed' });
  // The gateway lists the oldest event first.
  scans.sort((left, right) => right.at - left.at || right.index - left.index);
  const events = scans.map(({ event }) => event);
  // A delivery stands only while no newer event may have undone it (`leadingScan`).
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
