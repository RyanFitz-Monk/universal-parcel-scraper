import type { SameInstantIdentityPolicy } from '../../core/catalog/eventIdentity.js';
import { withoutLastmile } from './status.js';

const normalized = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');

// A row stored with the delivery carrier's number after its wording is taken over
// by the same scan without it, at the same instant, place and code.
export const sameInstantIdentityPolicy: SameInstantIdentityPolicy = {
  sourceCarrierId: 'topyou', storedSources: ['topyou'], requireProviderCode: false, matchEachScan: true,
  matches: (incoming, stored) => {
    const bare = withoutLastmile(stored.description);
    return bare !== stored.description && normalized(bare) === normalized(incoming.description)
      && normalized(incoming.location) === normalized(stored.location)
      && (!incoming.providerCode || !stored.providerCode || incoming.providerCode === stored.providerCode);
  },
};
