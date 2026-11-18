import { load } from 'cheerio';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import type { ClassifiedStatus } from '../../core/status/index.js';
import { zonedTime } from '../../core/time/index.js';
import { clean } from '../../core/transport/index.js';
import { normalizeDtdcNumber } from './parser.js';
import { dtdcStatus } from './status.js';

const PROVIDER = 'DTDC';
// DTDC's network is in India; the page prints its scans on India's clock.
const ZONE = 'Asia/Kolkata';

/**
 * The shipment page www.dtdc.com shows after its picture check. Its header names the waybill and the
 * sender's reference; the page keeps a copy of the history for each of its states, and the shown one
 * is marked active. A scan has a label, a time and a line; a remark has a time and a line only.
 * The current scan heads the list and is repeated below it, except a delivery.
 * Without the shipment, the page repeats the number after its notice.
 */
export function parseDtdcPage(html: string, trackingNumber: string): CarrierResult {
  const requested = normalizeDtdcNumber(trackingNumber);
  const $ = load(html);
  const notice = $('.notfound').first();
  if (notice.length) {
    const echoed = clean(notice.clone().children().remove().end().text().replace(/^[\s:]+/, ''), 64);
    if (normalizeTrackingNumber(echoed) !== requested) throw new SchemaError(PROVIDER, 'DTDC returned a different shipment');
    throw new NotFoundError(PROVIDER, 'DTDC has no details for this shipment');
  }
  const header = $('.tracking-header').first();
  const references = [clean(header.find('.awb-text').first().text().replace(/^\s*AWB:/i, ''), 64), clean(header.find('.ref-number').first().text().replace(/^#/, ''), 64)]
    .filter(Boolean).map(normalizeTrackingNumber);
  if (!references.includes(requested)) throw new SchemaError(PROVIDER, 'DTDC returned a different shipment');
  const active = $('.state-container.active');
  if (active.length !== 1) throw new SchemaError(PROVIDER, 'DTDC changed its shipment page');
  const items = active.find('.timeline .timeline-item, .timeline .timeline-item-middle');
  if (items.length > 1000) throw new SchemaError(PROVIDER, 'DTDC returned an oversized history');
  const scans: { event: CarrierEvent; mapped: ClassifiedStatus | undefined }[] = [];
  const seen = new Set<string>();
  items.each((_, item) => {
    const label = clean($(item).find('.timeline-status, .timeline-status-middle').first().text(), 200);
    const description = clean($(item).find('.timeline-description, .timeline-description-middle').first().text(), 500) || label;
    if (!description) return;
    const time = zonedTime($(item).find('.timeline-date, .timeline-date-middle').first().text(), 'MMM dd, yyyy hh:mma', ZONE, { locale: 'en-US' });
    if (!time) throw new SchemaError(PROVIDER, 'DTDC returned an invalid event time');
    // The label goes first, as a scan's line can still name an earlier step.
    const mapped = (label ? dtdcStatus(label) : undefined) ?? dtdcStatus(description);
    const event: CarrierEvent = { description, time: time.iso, ...(mapped ? { stage: mapped.stage } : {}) };
    const key = JSON.stringify(event);
    if (!seen.has(key)) { seen.add(key); scans.push({ event, mapped }); }
  });
  // The page lists the newest first; a stable sort keeps its order among scans of one minute.
  scans.sort((a, b) => Date.parse(b.event.time!) - Date.parse(a.event.time!));
  const newest = scans[0];
  if (!newest) throw new SchemaError(PROVIDER, 'DTDC returned a shipment without scans');
  const { event: last, mapped } = newest;
  const events = scans.map(scan => scan.event);
  return { status: mapped?.status ?? 'unknown', ...(mapped ? { current_stage: mapped.stage } : {}),
    last_status_text: last.description!, last_update: last.time!, timezone: ZONE,
    ...(mapped?.stage === 'delivered' ? { delivered_at: last.time! } : {}),
    ...(events.length > 100 ? { history_truncated: true } : {}), events: events.slice(0, 100) };
}
