import { isTciFreightReference } from '../../core/detection/tciFreight.js';
import { ChallengeError, IndeterminateError, InvalidInputError, NoHistoryError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus } from '../../core/status/index.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { tciFreightStage } from './status.js';

export const PROVIDER = 'TCI Freight';
export const TCI_FREIGHT_ENDPOINT = 'https://aerp.tcifreight.in/TLOG/WebServices/TLOG_API/API/ShipmentTrackingList';

export function normalizeTciFreightNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim() : '';
  if (!isTciFreightReference(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

function day(value: unknown): string {
  const match = typeof value === 'string' && /^(\d{1,2})-([A-Z]{3})-(\d{4})$/i.exec(value);
  const month = match ? ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].indexOf(match[2]!.toUpperCase()) + 1 : 0;
  const result = match && calendarDay(+match[3]!, month, +match[1]!);
  if (!result) throw new SchemaError(PROVIDER, 'TCI Freight returned an invalid scan day');
  return result;
}

export function tciFreightJson(text: string): unknown {
  if (/^\s*</.test(text) && /captcha|access denied|cloudflare|incapsula|verify.*human/i.test(text.slice(0, 64_000))) {
    throw new ChallengeError(PROVIDER, 'TCI Freight requires guest verification');
  }
  try { return JSON.parse(text) as unknown; }
  catch { throw new SchemaError(PROVIDER, 'TCI Freight returned a reply that is not JSON'); }
}

export function parseTciFreight(payload: unknown, raw: string): CarrierResult {
  const number = normalizeTciFreightNumber(raw);
  if (!isRecord(payload)) throw new SchemaError(PROVIDER, 'TCI Freight returned no tracking envelope');
  if (payload.Error != null) {
    if (!isRecord(payload.Error) || typeof payload.Error.Status_Message !== 'string') throw new SchemaError(PROVIDER, 'TCI Freight changed its error reply');
    if (/captcha|verification/i.test(payload.Error.Status_Message)) throw new ChallengeError(PROVIDER);
    throw new IndeterminateError(PROVIDER, 'TCI Freight did not confirm the consignment');
  }
  const summary = payload.shipmentTrackingS1_DATAs, dispatch = payload.disInfo2, rows = payload.shipmentTrackingS4_DATAs;
  if (!Array.isArray(summary) || !Array.isArray(dispatch) || dispatch.length > 2000 || !Array.isArray(rows) || rows.length > 2000) {
    throw new SchemaError(PROVIDER, 'TCI Freight returned an invalid history');
  }
  if (!summary.length && !rows.length && !dispatch.length) throw new IndeterminateError(PROVIDER, 'TCI Freight returned an empty result');
  if (summary.length !== 1 || !isRecord(summary[0]) || summary[0].CNS_NO !== number
    || dispatch.some(row => !isRecord(row) || row.cns_cns_no != null && row.cns_cns_no !== number)) {
    throw new SchemaError(PROVIDER, 'TCI Freight returned another consignment');
  }
  if (!rows.length) throw new NoHistoryError(PROVIDER, 'TCI Freight returned no dated scans');
  const events: CarrierEvent[] = [], seen = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row) || typeof row.STATUS !== 'string' || !row.STATUS.trim() || row.STATUS.length > 1000
      || typeof row.CITY !== 'string' || row.CITY.length > 300) throw new SchemaError(PROVIDER, 'TCI Freight returned an invalid scan');
    // LIST_ORDER is an internal sorting clock, not the date the public tracker displays.
    const description = clean(row.STATUS), stage = tciFreightStage(description);
    const event: CarrierEvent = { local_time: day(row.STATUS_DATE), description, ...(clean(row.CITY) ? { location: clean(row.CITY) } : {}),
      ...(stage ? { stage, stage_source: 'carrier_map' } : {}) };
    const key = JSON.stringify(event);
    if (!seen.has(key)) { seen.add(key); events.push(event); }
  }
  events.sort((a, b) => b.local_time!.localeCompare(a.local_time!));
  const newest = events[0]!, stage = tciFreightStage(newest.description!);
  return { status: stage ? languageStageStatus(stage) : 'unknown', ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: newest.description, last_update: null, last_update_local: newest.local_time, expected_delivery: null,
    ...(events.length > 100 ? { history_truncated: true } : {}), events: events.slice(0, 100) };
}
