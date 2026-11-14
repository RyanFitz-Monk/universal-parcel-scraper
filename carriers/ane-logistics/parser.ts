import { isAneLogisticsReference } from '../../core/detection/aneLogistics.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus } from '../../core/status/index.js';
import { paddedDate } from '../../core/time/fields.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { aneStage } from './status.js';

export const PROVIDER = 'ANE Logistics';
export const ANE_ENDPOINT = 'https://www.ane56.com/gw/api/order/v2/searchWayBillByNo';

export function normalizeAneNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim() : '';
  if (!isAneLogisticsReference(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

export function aneJson(text: string): unknown {
  if (/^\s*</.test(text)) throw new ChallengeError(PROVIDER, 'ANE Logistics returned a browser verification page');
  try { return JSON.parse(text) as unknown; }
  catch { throw new SchemaError(PROVIDER, 'ANE Logistics returned a reply that is not JSON'); }
}

function clock(raw: unknown): string {
  const match = typeof raw === 'string' && /^(\d{4})-(\d{2})-(\d{2})[ T]((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/.exec(paddedDate(raw));
  const day = match && calendarDay(+match[1]!, +match[2]!, +match[3]!);
  if (!match || !day) throw new SchemaError(PROVIDER, 'ANE Logistics returned an invalid scan clock');
  return `${day}T${match[4]}`;
}

export function parseAne(payload: unknown, raw: string): CarrierResult {
  const number = normalizeAneNumber(raw);
  if (!isRecord(payload)) throw new SchemaError(PROVIDER, 'ANE Logistics returned no tracking envelope');
  if (payload.success !== true || payload.errorCode !== 200) {
    if (typeof payload.message === 'string' && /captcha|验证|滑块/i.test(payload.message)) throw new ChallengeError(PROVIDER);
    throw new IndeterminateError(PROVIDER, 'ANE Logistics did not complete the lookup');
  }
  if (!Array.isArray(payload.data) || payload.data.length > 10) throw new SchemaError(PROVIDER, 'ANE Logistics returned an invalid waybill list');
  if (!payload.data.length) throw new IndeterminateError(PROVIDER, 'ANE Logistics returned no bound waybill');
  if (payload.data.length !== 1 || !isRecord(payload.data[0]) || payload.data[0].billno !== number) throw new SchemaError(PROVIDER, 'ANE Logistics returned another waybill');
  const row = payload.data[0], info = row.wayBillInfo;
  if (info == null && row.scanList == null) throw new NoHistoryError(PROVIDER, 'ANE Logistics returned a bound empty result');
  if (!isRecord(info) || info.ewbNo !== number) throw new SchemaError(PROVIDER, 'ANE Logistics returned another nested waybill');
  if (String(info.ecId) === '398' || Array.isArray(row.scanListPDD) && row.scanListPDD.length) {
    throw new NoHistoryError(PROVIDER, 'This ANE service uses a different history contract', { reason: 'unsupported_service' });
  }
  if (!Array.isArray(row.scanList) || row.scanList.length > 2000) throw new SchemaError(PROVIDER, 'ANE Logistics returned an invalid scan list');
  if (!row.scanList.length) throw new NoHistoryError(PROVIDER, 'ANE Logistics returned no dated scans');
  const events: CarrierEvent[] = [], seen = new Set<string>();
  for (const scan of row.scanList) {
    if (!isRecord(scan) || typeof scan.scanType !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(scan.scanType)
      || scan.city != null && (typeof scan.city !== 'string' || scan.city.length > 200)) throw new SchemaError(PROVIDER, 'ANE Logistics returned an invalid scan');
    const code = scan.scanType, stage = aneStage(code);
    // Free-form descriptions contain staff/contact details. Keep the scan's category and code instead.
    // Nearby actions can share the category; their native codes keep them distinct in consumer deduplication.
    const description = stage === 'accepted' ? `已揽收 · ${code}` : stage === 'in_transit' ? `运输中 · ${code}` : code;
    const location = typeof scan.city === 'string' ? clean(scan.city) : '';
    const event: CarrierEvent = { local_time: clock(scan.operateTime), provider_code: code, description,
      ...(location ? { location } : {}), ...(stage ? { stage, stage_source: 'carrier_map' } : {}) };
    const key = JSON.stringify(event);
    if (!seen.has(key)) { seen.add(key); events.push(event); }
  }
  events.sort((a, b) => b.local_time!.localeCompare(a.local_time!));
  const newest = events[0]!, stage = aneStage(newest.provider_code!);
  return { status: stage ? languageStageStatus(stage) : 'unknown', ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: newest.description, last_update: null, last_update_local: newest.local_time, expected_delivery: null,
    history_truncated: true, events: events.slice(0, 100) };
}
