import type { SameInstantIdentityPolicy, SameInstantScan } from '../../core/catalog/eventIdentity.js';
import { matchesDroppedLocation, matchesLocationEnrichment } from '../../core/catalog/locationIdentity.js';
import { swissPostRevoked } from './status.js';

/** A site number or postcode stored as the whole location of a scan with no town or country. */
const bareNumber = (location: string) => /^\d+$/.test(location);

/** A facility's name and the number ending it: the former tracker's six-digit site, or the tracker's postcode. */
const SITE = /^(.*\S)\s+\d{6}$/;
const POSTCODE = /^(.*\S)\s+\d{4}$/;

/**
 * The same place: the same text, or the facility the former tracker named with its site number
 * and the tracker names with its postcode ("Härkingen Paketzentrum" and two numbers).
 */
function samePlace(incoming: string, stored: string): boolean {
  const [now, before] = [incoming.trim(), stored.trim()];
  if (now === before) return true;
  const name = POSTCODE.exec(now)?.[1];
  return Boolean(name) && name!.toLocaleLowerCase('de-CH') === SITE.exec(before)?.[1]?.toLocaleLowerCase('de-CH');
}

/**
 * The tracker words a scan in its reader's language. With the code the policy
 * requires, the instant and the place, it is the scan stored in another
 * wording, unless one of the two is revoked and the other not.
 */
function reworded(incoming: SameInstantScan, stored: SameInstantScan): boolean {
  return samePlace(incoming.location, stored.location)
    && swissPostRevoked(incoming.description) === swissPostRevoked(stored.description);
}

// The destination post's scans of a parcel sent abroad came with Swiss Post's
// Zurich offset until October 2026, and now show the destination's when it
// keeps one clock. A scan stored with a bare number as its location loses it.
// The former tracker ended a facility's name with its site number, the tracker
// with its postcode, in the same code.
export const sameInstantIdentityPolicy: SameInstantIdentityPolicy = {
  sourceCarrierId: 'swiss-post', storedSources: ['swiss-post'], requireProviderCode: true,
  matchEachScan: true,
  matches: (incoming, stored) => reworded(incoming, stored) || matchesLocationEnrichment(incoming, stored)
    || matchesDroppedLocation(incoming, stored, bareNumber),
  relabelledFrom: 'Europe/Zurich',
};
