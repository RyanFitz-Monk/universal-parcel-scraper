import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { IndeterminateError, InvalidInputError, NoHistoryError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { explicitOffsetTime } from '../../core/time/index.js';
import { clean } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { MANDAE_ORDER_LABELS, mandaeOrderStage, mandaeStage } from './status.js';

export const PROVIDER = 'Mandaê';

const MAX_SCANS = 500;
// Mandaê's own code (a store's letters and its item number, or a bare number) or the code of the
// partner carrier that took the parcel; Rastreaê's search field takes either.
const CODE = /^[A-Z0-9]{6,40}$/;
const STATE = /^[A-Za-z]{1,40}$/;
const ARRIVAL = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?(?:Z|[+-]\d{2}:\d{2})$/;
// The scan that hands the parcel over names the partner carrier and its code for it.
const POSTED = /\bpostada via .{1,60}? com o código ([A-Z0-9-]{4,40})\.?\s*$/i;
// States whose stage no scan carries: the parcel's end or a problem with it.
const STATE_DECIDES = new Set<Stage>(['delivered', 'returned', 'exception', 'ready_for_pickup']);

export function normalizeMandaeNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (CODE.test(number)) return number;
  throw new InvalidInputError(PROVIDER, 'Mandaê tracks codes of six to forty letters and digits');
}

/** An optional text field; anything but a string is a changed reply. */
function text(row: Record<string, unknown>, key: string, maxLength: number): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') throw new SchemaError(PROVIDER, `Mandaê returned an invalid ${key}`);
  return clean(value, maxLength);
}

interface Scan { event: CarrierEvent; timestamp: number; partnerCode?: string }

function scanOf(row: unknown): Scan {
  if (!isRecord(row)) throw new SchemaError(PROVIDER, 'Mandaê returned an invalid scan');
  const description = text(row, 'descricao', 200);
  if (!description) throw new SchemaError(PROVIDER, 'Mandaê returned a scan without a title');
  const time = explicitOffsetTime(text(row, 'dataHora', 40));
  if (!time) throw new SchemaError(PROVIDER, 'Mandaê returned an invalid scan time');
  const partnerCode = POSTED.exec(text(row, 'complemento', 500))?.[1]?.toUpperCase().replaceAll('-', '');
  const staged = mandaeStage(description);
  // Some scans carry milliseconds; the second is what other sources give for the same scan.
  return {
    event: { time: time.iso.replace(/\.\d+(?=[+-]|Z$)/, ''), description, ...(staged ? { stage: staged.stage, stage_source: staged.source } : {}) },
    timestamp: Math.floor(time.timestamp / 1000) * 1000,
    ...(partnerCode ? { partnerCode } : {}),
  };
}

/**
 * The reply of `GET rastreae.api.mandae.com.br/v2/rastreamentos/{code}`, which Rastreaê's result
 * page makes once AWS WAF's check passes: the order's state, its milestones and `historico`, the
 * scans with their offsets. Asked by the partner carrier's code, it answers with Mandaê's record,
 * whose own code becomes the canonical number. The sentences beside each scan title, the
 * milestones and the partner's name are not read.
 */
export function parseMandae(payload: unknown, rawNumber: string): CarrierResult {
  const number = normalizeMandaeNumber(rawNumber);
  if (!isRecord(payload) || !Array.isArray(payload.historico)) throw new SchemaError(PROVIDER, 'Mandaê returned an invalid reply');
  const own = text(payload, 'codigoRastreamento', 60).toUpperCase();
  if (!CODE.test(own)) throw new SchemaError(PROVIDER, 'Mandaê returned an invalid code');
  const state = text(payload, 'situacaoEncomenda', 60);
  if (state && !STATE.test(state)) throw new SchemaError(PROVIDER, 'Mandaê returned an invalid order state');
  if (payload.historico.length > MAX_SCANS) throw new SchemaError(PROVIDER, 'Mandaê returned an oversized history');

  const scans = payload.historico.map(scanOf);
  if (own !== number && !scans.some(scan => scan.partnerCode === number)) {
    throw new IndeterminateError(PROVIDER, 'Mandaê answered with a record that names neither the code nor its partner\'s');
  }
  if (!scans.length) throw new NoHistoryError(PROVIDER, 'Mandaê lists the order but holds no scan yet', { reason: 'listed' });

  const seen = new Set<string>();
  const ordered = scans.filter(({ event }) => {
    // A scan the reply lists twice is kept once.
    const identity = JSON.stringify(event);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  // Newest first, as the page lists them; scans at the same instant keep the reply's order.
  ordered.sort((left, right) => right.timestamp - left.timestamp);
  const events = ordered.map(({ event }) => event);

  const latest = events[0]!;
  const scanned = events.find(event => event.stage);
  const stated = state ? mandaeOrderStage(state) : undefined;
  const byState = stated !== undefined && (STATE_DECIDES.has(stated) || !scanned) && scanned?.stage !== stated;
  const stage = (byState ? stated : scanned?.stage) as Stage | undefined;
  const arrival = ARRIVAL.exec(text(payload, 'dataChegadaVendida', 40))?.[1];
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: byState ? 'carrier_map' : scanned!.stage_source! } : {}),
    last_status_text: byState ? MANDAE_ORDER_LABELS[state] ?? state : latest.description!,
    last_update: latest.time!,
    // The arrival day the store promised at the sale.
    expected_delivery: arrival && stage !== 'delivered' ? arrival : null,
    ...(own !== number ? { canonical_tracking_number: own } : {}),
    events,
  };
}
