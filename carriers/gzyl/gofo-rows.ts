import { DateTime } from 'luxon';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { firstOccurrence, usStateTimeZone } from '../../core/time/index.js';
import { gofoScanZone } from '../gofo/clock.js';

// A US partner's scan a tracker copies under the town and its state's code, as GOFO's hub scans ("EXAMPLE TOWN,IL").
const US_TOWN_STATE = /^([^,]+),\s*([A-Z]{2})$/;
/** The town of a place a tracker writes as a US town and its state's code; null for another place. */
export function hualeiUsTown(place: string): string | null {
  const parts = US_TOWN_STATE.exec(place.trim());
  return parts && usStateTimeZone(parts[2]) ? parts[1]!.trim() : null;
}

// GOFO's label, which a tracker copies in GOFO's words on a line into the United States.
const GOFO_LABEL = /^shipping label created$/i;
/** Whether a row is one a US partner wrote that a tracker copies, on the partner's wall clock: under a US town and state, or GOFO's label. */
export const isHualeiUsPartnerRow = (wording: string, place: string): boolean => GOFO_LABEL.test(wording.trim()) || hualeiUsTown(place) !== null;

/** The result with the wall clocks `zoneOf` places dated in that zone, and the newest scan's instant as the last update. */
export function dateWallClocks(result: CarrierResult, zoneOf: (event: CarrierEvent) => { zone: string; basis: 'carrier' | 'place' } | null): CarrierResult {
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

/**
 * The result with the rows a tracker copies from GOFO dated on GOFO's clocks: a station GOFO
 * dates on its zone, and its label on Pacific time. GOFO's own reply gives their digits to the second
 * on those clocks; read on Beijing time a hub scan came 14 hours early. A US partner's row at a town
 * GOFO does not list keeps its wall clock, which the state dates.
 */
export const dateHualeiGofoRows = (result: CarrierResult): CarrierResult => dateWallClocks(result, (event) => {
  const description = event.description ?? '';
  const location = event.location ?? '';
  if (!isHualeiUsPartnerRow(description, location)) return null;
  const town = hualeiUsTown(location);
  const zone = gofoScanZone(town ?? '', description);
  return zone ? { zone, basis: town ? 'place' : 'carrier' } : null;
});
