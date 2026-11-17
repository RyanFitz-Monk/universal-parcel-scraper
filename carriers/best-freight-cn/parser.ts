import { isBestFreightCnReference } from '../../core/detection/bestFreightCn.js';
import { normalizeTrackingNumber } from '../../core/detection/normalize.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, RateLimitedError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { bestFreightCnStage } from './status.js';

export const PROVIDER = 'BEST Freight China';
export const BASE = 'https://www.800best.com';
export const ENTRY = BASE + '/freight/track';
export function normalizeBestFreightCnNumber(raw: string): string {
  if (!isBestFreightCnReference(raw)) throw new InvalidInputError(PROVIDER, 'BEST Freight China needs an eleven-digit waybill');
  return normalizeTrackingNumber(raw);
}
function field(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw new SchemaError(PROVIDER, 'BEST Freight China returned an invalid field');
  return clean(value, limit);
}
function localClock(value: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2}) ((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/.exec(field(value, 64));
  if (!m || !calendarDay(Number(m[1]), Number(m[2]), Number(m[3]))) throw new SchemaError(PROVIDER, 'BEST Freight China returned an invalid scan clock');
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}`;
}
export function bestFreightCnEnvelope(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload) || typeof payload.code !== 'number' || typeof payload.success !== 'boolean') throw new SchemaError(PROVIDER, 'BEST Freight China returned no response envelope');
  if (payload.code === 429) throw new RateLimitedError(PROVIDER);
  if ([111, 113, 401, 403].includes(payload.code)) throw new ChallengeError(PROVIDER, 'BEST Freight China requires verification');
  if (payload.code !== 200 || payload.success !== true || payload.errorCode != null) throw new IndeterminateError(PROVIDER, 'BEST Freight China did not complete the lookup');
  return payload;
}
export function parseBestFreightCn(payload: unknown, raw: string): CarrierResult {
  const number = normalizeBestFreightCnNumber(raw), p = bestFreightCnEnvelope(payload);
  if (!Array.isArray(p.data)) throw new SchemaError(PROVIDER, 'BEST Freight China returned no shipment list');
  // The native freight view explicitly renders its not-found message for this tested success envelope.
  if (!p.data.length) {
    if (p.errorCode === null && p.message === null && Object.keys(p).every(key => ['code', 'success', 'errorCode', 'message', 'data'].includes(key))) throw new NotFoundError(PROVIDER);
    throw new IndeterminateError(PROVIDER, 'BEST Freight China returned an empty reply without its absence contract');
  }
  if (p.data.length !== 1 || !isRecord(p.data[0]) || p.data[0].billCode !== number) throw new SchemaError(PROVIDER, 'BEST Freight China returned no unique matching waybill');
  const row = p.data[0];
  if (!Array.isArray(row.detailList) || !Array.isArray(row.traceList) || row.detailList.length + row.traceList.length > 500) throw new SchemaError(PROVIDER, 'BEST Freight China returned an invalid history');
  if (!row.detailList.length && !row.traceList.length) throw new NoHistoryError(PROVIDER, 'BEST Freight China has no scans');
  const events: CarrierEvent[] = [], seen = new Set<string>();
  for (const item of [...(row.detailList as unknown[]), ...(row.traceList as unknown[])]) {
    if (!isRecord(item)) throw new SchemaError(PROVIDER, 'BEST Freight China returned an invalid scan');
    const local = localClock(item.time), type = field(item.scanType, 100), description = field(item.memo, 2000);
    if (!type || !description || /[<>]/.test(description)) throw new SchemaError(PROVIDER, 'BEST Freight China returned no scan wording');
    const stage = bestFreightCnStage(type);
    const event: CarrierEvent = { local_time: local, description, ...(stage ? { stage, stage_source: 'carrier_map' } : {}) };
    const key = JSON.stringify([type, event]);
    if (!seen.has(key)) { seen.add(key); events.push(event); }
  }
  events.sort((a, b) => b.local_time!.localeCompare(a.local_time!));
  const latest = events[0]!, stage = latest.stage as Stage | undefined;
  return { status: stage ? languageStageStatus(stage) : 'unknown', ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: latest.description!, last_update: null, last_update_local: latest.local_time, expected_delivery: null,
    events: events.slice(0, 100), ...(events.length > 100 ? { history_truncated: true } : {}) };
}
