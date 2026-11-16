import type { SameInstantIdentityPolicy } from '../../core/catalog/eventIdentity.js';
import { matchesDroppedLocation } from '../../core/catalog/locationIdentity.js';
import { bpostPlaceName } from './parser.js';

// Scans stored with a name that is no place as their location ("LCI", "PSM IN PARCELS") lose it and keep their row.
export const sameInstantIdentityPolicy: SameInstantIdentityPolicy = {
  sourceCarrierId: 'bpost', storedSources: ['bpost'], requireProviderCode: false,
  matchEachScan: true,
  matches: (incoming, stored) => matchesDroppedLocation(incoming, stored, (location) => bpostPlaceName(location) === ''),
};
