import { normalizeTrackingNumber } from '../../core/detection/normalize.js';
import { IndeterminateError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { explicitOffsetTime } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { xylShipsStage } from './status.js';

export const PROVIDER = 'XYL-Ships';
export const XYL_SHIPS_ENDPOINT = 'https://siking-track.com/api/tracking/';

export function normalizeXylShipsNumber(raw: string): string {
  const number = normalizeTrackingNumber(raw);
  if (!/^[A-Z0-9]{6,40}$/.test(number)) throw new InvalidInputError(PROVIDER, 'XYL-Ships needs a whole tracking number');
  return number;
}

function field(value: unknown, max: number): string {
  if (typeof value !== 'string' || value.length > max) throw new SchemaError(PROVIDER, 'XYL-Ships returned an invalid tracking field');
  return clean(value, max);
}

/** The tracker's JSON: one transfer bound to the whole number, with scans stamped with their offset. */
export function parseXylShips(payload: unknown, raw: string): CarrierResult {
  const number = normalizeXylShipsNumber(raw);
  if (!isRecord(payload) || typeof payload.code !== 'number') throw new SchemaError(PROVIDER, 'XYL-Ships returned no tracking envelope');
  if (payload.code === -1 && isRecord(payload.message) && payload.message.error === '未找到对应的物流订单') throw new NotFoundError(PROVIDER);
  if (payload.code !== 0) throw new IndeterminateError(PROVIDER, 'XYL-Ships did not complete the lookup');
  const record = payload.data;
  if (!isRecord(record)) throw new SchemaError(PROVIDER, 'XYL-Ships returned no shipment');
  if (typeof record.transfer_no !== 'string' || normalizeTrackingNumber(record.transfer_no) !== number) {
    throw new SchemaError(PROVIDER, 'XYL-Ships returned another shipment');
  }
  if (!Array.isArray(record.events) || record.events.length > 500) throw new SchemaError(PROVIDER, 'XYL-Ships returned an invalid history');
  if (!record.events.length) throw new NoHistoryError(PROVIDER, 'XYL-Ships returned no scans');
  const scans: { event: CarrierEvent; at: number }[] = [], seen = new Set<string>();
  for (const row of record.events as unknown[]) {
    if (!isRecord(row)) throw new SchemaError(PROVIDER, 'XYL-Ships returned an invalid scan');
    const at = explicitOffsetTime(row.event_time), description = field(row.content, 2000);
    if (!at) throw new SchemaError(PROVIDER, 'XYL-Ships returned an invalid scan clock');
    if (!description || /[<>]/.test(description)) throw new SchemaError(PROVIDER, 'XYL-Ships returned no scan wording');
    const location = row.location == null ? '' : field(row.location, 200), stage = xylShipsStage(null, description);
    const event: CarrierEvent = { time: at.iso, description, ...(location ? { location } : {}),
      ...(stage ? { stage, stage_source: 'carrier_map' } : {}) };
    const key = JSON.stringify(event);
    if (!seen.has(key)) { seen.add(key); scans.push({ event, at: at.timestamp }); }
  }
  // The tracker lists the newest first; `order` names the order, not a position.
  const events = scans.sort((a, b) => b.at - a.at).map(scan => scan.event);
  const latest = events[0]!, stage = latest.stage as Stage | undefined;
  return { status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: latest.description!, last_update: latest.time!,
    expected_delivery: null, events: events.slice(0, 100), ...(events.length > 100 ? { history_truncated: true } : {}) };
}
