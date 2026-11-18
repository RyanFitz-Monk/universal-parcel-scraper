import { isSicepatReference } from '../../core/detection/sicepat.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, RateLimitedError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus } from '../../core/status/index.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { sicepatStage } from './status.js';

export const PROVIDER = 'SiCepat Ekspres';
export const PAGE = 'https://www.sicepat.com/';
export const API = 'https://api.sicepatconsumer.com/v1/order/public/shipping/awb/';
// The capture selector opts into the app WebView bootstrap, whose result is a tagged client envelope, not an API capture.
export const VERIFICATION = 'https://www.google.com/recaptcha/api.js?render=6LfG3VIqAAAAAOZ_w59NNZIrgEu8pHKSEBZGqxTN';
export const TOKEN = /^[A-Za-z0-9_-]{50,8192}$/;

export function normalizeSicepatNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim() : '';
  if (!isSicepatReference(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

export function sicepatJson(text: string): unknown {
  if (/^\s*</.test(text)) throw new ChallengeError(PROVIDER, 'SiCepat returned a verification page');
  try { return JSON.parse(text) as unknown; } catch { throw new SchemaError(PROVIDER, 'SiCepat returned unreadable JSON'); }
}

function clock(raw: unknown): string {
  const m = typeof raw === 'string' && /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw);
  if (!m || !calendarDay(+m[1]!, +m[2]!, +m[3]!)) throw new SchemaError(PROVIDER, 'SiCepat changed its scan clock');
  return String(raw).replace(' ', 'T');
}

export function parseSicepat(payload: unknown, raw: string): CarrierResult {
  const number = normalizeSicepatNumber(raw);
  if (!isRecord(payload)) throw new SchemaError(PROVIDER, 'SiCepat omitted its tracking envelope');
  const message = typeof payload.message === 'string' ? payload.message : '';
  if (/re-?captcha|captcha token/i.test(message)) throw new ChallengeError(PROVIDER, 'SiCepat refused guest verification', { reason: 'verification_rejected' });
  if (/too many|rate limit/i.test(message)) throw new RateLimitedError(PROVIDER);
  if (payload.code === '400000' && payload.statusCode === 400 && message === "Invalid AWB number: Can't get waybill from database") throw new NotFoundError(PROVIDER);
  if (payload.code !== '200000' || payload.statusCode !== 200) throw new IndeterminateError(PROVIDER, 'SiCepat did not complete its guest lookup');
  const data = isRecord(payload.data) ? payload.data.sicepat : undefined;
  if (!isRecord(data) || !isRecord(data.status)) throw new SchemaError(PROVIDER, 'SiCepat omitted its domestic result');
  if (data.status.code === 404 && data.status.description === 'Not Found') throw new NotFoundError(PROVIDER);
  if (data.status.code !== 200) throw new IndeterminateError(PROVIDER, 'SiCepat did not confirm a domestic shipment');
  const row = data.result;
  if (!isRecord(row) || row.waybill_number !== number) throw new SchemaError(PROVIDER, 'SiCepat answered for another waybill');
  if (!Array.isArray(row.track_history) || row.track_history.length > 1000) throw new SchemaError(PROVIDER, 'SiCepat changed its history');
  if (!row.track_history.length) throw new NoHistoryError(PROVIDER);
  const events: CarrierEvent[] = [], seen = new Set<string>();
  // The feed is oldest first. Visit the newest row first so equal minutes retain that order.
  for (let index = row.track_history.length - 1; index >= 0; index -= 1) {
    const scan: unknown = row.track_history[index];
    if (!isRecord(scan) || typeof scan.status !== 'string' || !/^[A-Z][A-Z0-9_ -]{0,63}$/.test(scan.status)
      || typeof scan.city !== 'string' || scan.city.length > 2000) throw new SchemaError(PROVIDER, 'SiCepat returned an invalid scan');
    const code = scan.status;
    // Despite its name, city is a complete sentence. SIGESIT brackets can name the individual courier.
    const description = code === 'DLV' ? 'Delivered' : clean(scan.city.replace(/\[SIGESIT(?:\s*-\s*[^\]]*)?\]/gi, '[SIGESIT]'), 1000);
    if (!description) throw new SchemaError(PROVIDER, 'SiCepat omitted scan wording');
    const stage = sicepatStage(code, description);
    const site = /\boleh\s+\[/i.test(description) ? undefined : /\b(?:di|dari)\s+[^[\]]+\[([^\]]+)\]/i.exec(description)?.[1];
    const event: CarrierEvent = { local_time: clock(scan.date_time), provider_code: code, description,
      ...(site ? { location: clean(site, 200) } : {}), ...(stage ? { stage, stage_source: 'carrier_map' } : {}) };
    const key = JSON.stringify(event);
    if (!seen.has(key)) { seen.add(key); events.push(event); }
  }
  events.sort((a, b) => b.local_time!.localeCompare(a.local_time!));
  const newest = events[0]!, stage = sicepatStage(newest.provider_code!, newest.description!);
  return { status: stage ? languageStageStatus(stage) : 'unknown', ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: newest.description, last_update: null, last_update_local: newest.local_time, expected_delivery: null,
    ...(events.length > 100 ? { history_truncated: true } : {}), events: events.slice(0, 100) };
}
