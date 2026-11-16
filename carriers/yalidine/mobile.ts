import { DateTime } from 'luxon';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { ChallengeError, IndeterminateError, SchemaError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { languageStageStatus } from '../../core/status/index.js';
import { decodeText, fetchBounded } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { normalizeYalidineNumber, PROVIDER, YALIDINE_MAX_BYTES, yalidineRequestNumber } from './parser.js';
import { yalidineStage } from './status.js';

export const YALIDINE_MOBILE = 'https://yalidine.app/app/api/parcel-statut.php';
const matches = (value: unknown, number: string) => typeof value === 'string' && value.length <= 64 && normalizeTrackingNumber(value) === number;
function text(value: unknown, required = false): string {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > 500 || (required && !value.trim())) throw new SchemaError(PROVIDER, 'Yalidine returned an invalid mobile scan field');
  return value.trim();
}
export function parseYalidineMobile(payload: unknown, raw: string): CarrierResult {
  const number = normalizeYalidineNumber(raw);
  // The app also receives [] for unknown inputs, without a bound identity or explicit absence.
  if (Array.isArray(payload) && payload.length === 0) throw new IndeterminateError(PROVIDER, 'Yalidine returned no identified mobile history');
  if (!isRecord(payload) || Object.keys(payload).length !== 1 || !matches(Object.keys(payload)[0], number)) {
    throw new IndeterminateError(PROVIDER, 'Yalidine mobile history did not identify the requested item');
  }
  const rows: unknown = Object.values(payload)[0];
  if (!Array.isArray(rows) || rows.length > 500) throw new SchemaError(PROVIDER, 'Yalidine returned an invalid mobile history');
  if (!rows.length) throw new IndeterminateError(PROVIDER, 'Yalidine returned no mobile scans');
  const events = rows.map((row: unknown) => {
    if (!isRecord(row) || !matches(row.tracking, number)) throw new IndeterminateError(PROVIDER, 'Yalidine mixed mobile shipment histories');
    const timestamp = text(row.datetime, true);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) throw new SchemaError(PROVIDER, 'Yalidine returned an invalid mobile scan clock');
    const parsed = DateTime.fromFormat(timestamp, 'yyyy-MM-dd HH:mm:ss', { zone: 'UTC' });
    if (!parsed.isValid || parsed.toFormat('yyyy-MM-dd HH:mm:ss') !== timestamp) throw new SchemaError(PROVIDER, 'Yalidine returned an invalid mobile scan clock');
    const description = text(row.status, true), staged = yalidineStage(description);
    const location = [...new Set([text(row.centre), text(row.commune), text(row.wilaya)].filter(Boolean))].join(', ');
    return { local_time: timestamp.replace(' ', 'T'), description, ...(location ? { location } : {}),
      ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}) };
  });
  // The native app keeps the server's newest-first sequence.
  const latest = events[0]!, current = yalidineStage(latest.description);
  return { status: current ? languageStageStatus(current.stage) : 'unknown',
    ...(current ? { current_stage: current.stage, current_stage_source: current.source } : {}),
    last_status_text: latest.description, last_update: null, last_update_local: latest.local_time,
    expected_delivery: null, events: events.slice(0, 100), ...(events.length > 100 ? { history_truncated: true } : {}) };
}
export async function fetchYalidineMobile(number: string, options: { fetcher?: typeof fetch; signal: AbortSignal; timeoutMs: number }) {
  const { bytes } = await fetchBounded(`${YALIDINE_MOBILE}?${new URLSearchParams({ tracking: yalidineRequestNumber(number) })}`, {
    signal: options.signal, headers: { 'User-Agent': 'Yalidine-App-Android', Accept: 'application/json' },
  }, { provider: PROVIDER, fetcher: options.fetcher, timeoutMs: Math.max(1, Math.floor(options.timeoutMs)), maxBytes: YALIDINE_MAX_BYTES, redirect: 'error' });
  const body = decodeText(bytes);
  if (/^\s*</.test(body)) throw new ChallengeError(PROVIDER, 'Yalidine mobile tracker returned a verification page');
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { throw new SchemaError(PROVIDER, 'Yalidine mobile tracker returned unreadable JSON'); }
  return parseYalidineMobile(payload, number);
}
