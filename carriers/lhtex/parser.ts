import { isLhtexReference } from '../../core/detection/lhtex.js';
import { normalizeTrackingNumber } from '../../core/detection/normalize.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, RateLimitedError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { lhtexStage } from './status.js';

export const PROVIDER = 'LHT Express';
export const LHTEX_ENDPOINT = 'https://www.lhtex.com.cn/orderquery.php';

export function normalizeLhtexNumber(raw: string): string {
  if (!isLhtexReference(raw)) throw new InvalidInputError(PROVIDER, 'LHT Express needs a twelve-digit waybill');
  return normalizeTrackingNumber(raw);
}

function field(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new SchemaError(PROVIDER, 'LHT Express returned an invalid tracking field');
  return clean(value, max);
}

function clock(value: unknown): string {
  const text = field(value, 64);
  const match = /^(\d{4})-(\d{2})-(\d{2}) ((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/.exec(text);
  if (!match || !calendarDay(Number(match[1]), Number(match[2]), Number(match[3]))) throw new SchemaError(PROVIDER, 'LHT Express returned an invalid scan clock');
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}`;
}

/** The homepage's guest JSON, with one whole waybill and carrier-local scan clocks. */
export function parseLhtex(payload: unknown, raw: string): CarrierResult {
  const number = normalizeLhtexNumber(raw);
  if (!isRecord(payload) || typeof payload.code !== 'number') throw new SchemaError(PROVIDER, 'LHT Express returned no tracking envelope');
  if (payload.code === 429) throw new RateLimitedError(PROVIDER);
  if (payload.code === 401 || payload.code === 403) throw new ChallengeError(PROVIDER, 'LHT Express refused public tracking');
  if (payload.code !== 200) throw new IndeterminateError(PROVIDER, 'LHT Express did not complete the lookup');
  if (!Array.isArray(payload.data)) throw new SchemaError(PROVIDER, 'LHT Express returned no shipment list');
  // The native unknown control is also code 200 / 成功 / data []. It asserts no absence.
  if (!payload.data.length) throw new IndeterminateError(PROVIDER, 'LHT Express returned an empty result');
  if (payload.data.length !== 1 || !isRecord(payload.data[0])) throw new SchemaError(PROVIDER, 'LHT Express returned no unique shipment');
  const record = payload.data[0];
  if (record.waybillNo !== number) throw new SchemaError(PROVIDER, 'LHT Express returned another waybill');
  if (!Array.isArray(record.details) || record.details.length > 500) throw new SchemaError(PROVIDER, 'LHT Express returned an invalid history');
  if (!record.details.length) throw new NoHistoryError(PROVIDER, 'LHT Express returned no scans');
  const events: CarrierEvent[] = [], seen = new Set<string>();
  for (const row of record.details as unknown[]) {
    if (!isRecord(row)) throw new SchemaError(PROVIDER, 'LHT Express returned an invalid scan');
    const local = clock(row.scanTime), type = field(row.scanType, 100), description = field(row.desc, 2000);
    if (!type || !description || /[<>]/.test(description)) throw new SchemaError(PROVIDER, 'LHT Express returned no scan wording');
    const stage = lhtexStage(type), location = /^【([^【】]{1,100})】/.exec(description)?.[1];
    const event: CarrierEvent = { local_time: local, description, ...(location ? { location } : {}),
      ...(stage ? { stage, stage_source: 'carrier_map' } : {}) };
    const key = JSON.stringify(event);
    if (!seen.has(key)) { seen.add(key); events.push(event); }
  }
  events.sort((a, b) => b.local_time!.localeCompare(a.local_time!));
  const latest = events[0]!, stage = latest.stage as Stage | undefined;
  return { status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: latest.description!, last_update: null, last_update_local: latest.local_time,
    expected_delivery: null, events: events.slice(0, 100), ...(events.length > 100 ? { history_truncated: true } : {}) };
}
