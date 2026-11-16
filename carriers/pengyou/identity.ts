import type { SameInstantIdentityPolicy } from '../../core/catalog/eventIdentity.js';
import { hualeiIdentityPolicy } from '../gzyl/identity.js';

const normalized = (value: string) => value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('en-US');

// A row stored with its city in brackets after its wording and no place is taken over by
// the same scan at that city, as are the shared client's other rereadings.
const shared = hualeiIdentityPolicy('pengyou');
export const sameInstantIdentityPolicy: SameInstantIdentityPolicy = {
  ...shared,
  matches: (incoming, stored) => (!stored.location.trim() && !!incoming.location.trim()
    && normalized(stored.description) === normalized(`${incoming.description} [${incoming.location}]`)) || shared.matches!(incoming, stored),
};
