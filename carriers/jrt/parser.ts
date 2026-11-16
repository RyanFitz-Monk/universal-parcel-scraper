import { DateTime } from 'luxon';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { firstOccurrence } from '../../core/time/index.js';
import { gofoScanZone } from '../gofo/clock.js';
import { dateDhlRows } from '../gzyl/dhl-rows.js';
import { normalizeHualeiNumber, parseHualeiPage, parseHualeiTrack, type HualeiTenant } from '../gzyl/hualei.js';
import {
  isJrtDhlGermanRow, isJrtDhlRow, isJrtJtMexicoRow, isJrtUpsRow, isJrtUsPartnerRow, jrtCountryPlace, jrtEnglish, jrtStage, jrtUsTown,
} from './status.js';

export const PROVIDER = 'JRT';
export const JRT_ORIGIN = 'http://106.53.64.22:8082';
// Once JRT hands a parcel over, the record's tracking number is the delivering carrier's, as
// DHL's into Europe or FedEx's on the line to Ireland, whose product names FedEx, and JRT's
// own number, which still finds the order, is in no field.
export const JRT: HualeiTenant = {
  carrier: 'jrt', provider: PROVIDER, origin: JRT_ORIGIN, stage: jrtStage, english: jrtEnglish,
  clock: ({ content, location }) => (isJrtUpsRow(content, location) || isJrtUsPartnerRow(content, location) || isJrtDhlRow(content)
    || isJrtJtMexicoRow(content) ? 'wall' : 'platform'),
  ownNumber: /^JRT\d{10}[A-Z]{2}$/, unlabelledPartners: ['dhl'], productPartners: [[/\bFEDEX\b/i, 'fedex']],
};

/** The result with the rows the tracker copies from DHL dated, each keeping its wall clock, and a country's code beside them shown as one. */
export function dateJrtDhlRows(result: CarrierResult): CarrierResult {
  const dated = dateDhlRows(result, { isRow: isJrtDhlRow, isGermanRow: isJrtDhlGermanRow });
  if (!dated.events?.some((event) => event.location && isJrtDhlRow(event.description ?? '') && jrtCountryPlace(event.location) !== event.location)) return dated;
  return {
    ...dated,
    events: dated.events.map((event) => (event.location && isJrtDhlRow(event.description ?? '') ? { ...event, location: jrtCountryPlace(event.location) } : event)),
  };
}

/** The result with the wall clocks `zoneOf` places dated in that zone, and the newest scan's instant as the last update. */
function dateWallClocks(result: CarrierResult, zoneOf: (event: CarrierEvent) => { zone: string; basis: 'carrier' | 'place' } | null): CarrierResult {
  const placed = (event: CarrierEvent) => (!event.time && event.local_time ? zoneOf(event) : null);
  if (!result.events?.some(placed)) return result;
  const events = result.events.map((event): CarrierEvent => {
    const clock = placed(event);
    if (!clock) return event;
    const time = firstOccurrence(DateTime.fromISO(event.local_time!, { zone: clock.zone })).toISO({ suppressMilliseconds: true });
    return time ? { ...event, time, time_zone: clock.zone, time_zone_basis: clock.basis } : event;
  });
  const newest = events[0];
  const { last_update_local: local, ...rest } = result;
  return { ...rest, last_update: newest?.time ?? result.last_update, ...(newest?.time || !local ? {} : { last_update_local: local }), events };
}

// J&T Express Mexico writes its scans on Mexico City's clock, as its own tracker answers them.
const JT_MEXICO_ZONE = 'America/Mexico_City';

/** The result with the rows the tracker copies from J&T Express Mexico dated on J&T's clock. */
export const dateJrtJtMexicoRows = (result: CarrierResult): CarrierResult => dateWallClocks(result,
  (event) => (isJrtJtMexicoRow(event.description ?? '') ? { zone: JT_MEXICO_ZONE, basis: 'carrier' } : null));

/**
 * The result with the rows the tracker copies from GOFO dated on GOFO's clocks: a station GOFO
 * dates on its zone, and its label on Pacific time. GOFO's own reply gives their digits to the second
 * on those clocks; read on Beijing time a hub scan came 14 hours early. A US partner's row at a town
 * GOFO does not list keeps its wall clock, which the state dates.
 */
export const dateJrtGofoRows = (result: CarrierResult): CarrierResult => dateWallClocks(result, (event) => {
  const description = event.description ?? '';
  const location = event.location ?? '';
  if (!isJrtUsPartnerRow(description, location)) return null;
  const town = jrtUsTown(location);
  const zone = gofoScanZone(town ?? '', description);
  return zone ? { zone, basis: town ? 'place' : 'carrier' } : null;
});

/** The result with the rows the tracker copies from DHL, J&T Express Mexico and GOFO dated on their clocks. */
export const dateJrtRows = (result: CarrierResult): CarrierResult => dateJrtGofoRows(dateJrtJtMexicoRows(dateJrtDhlRows(result)));

export const normalizeJrtNumber = (raw: string): string => normalizeHualeiNumber(raw, PROVIDER);
/** The track interface's reply, or null when it holds no row for the number. */
export function parseJrtTrack(payload: unknown, number: string, readAt?: number): CarrierResult | null {
  const result = parseHualeiTrack(payload, number, JRT, readAt);
  return result && dateJrtRows(result);
}
export const parseJrtPage = (html: string, number: string, readAt?: number): CarrierResult =>
  dateJrtRows(parseHualeiPage(html, number, JRT, readAt));
