import type { SameInstantIdentityPolicy, SameInstantScan } from '../../core/catalog/eventIdentity.js';

const wording = (scan: SameInstantScan) => scan.description.replace(/\s+/g, ' ').trim().toLowerCase();

// A delivering partner's place as JCEX writes it with its offset, "TOWN;ST;;-05:00", which earlier
// releases showed as written and later ones read as "TOWN, ST, US".
const WRITTEN_PLACE = /^([^;]*);([A-Z]{2});[^;]*;[+-]\d{2}:\d{2}$/;

function place(scan: SameInstantScan): string {
  const location = scan.location.trim();
  const written = WRITTEN_PLACE.exec(location);
  return written ? [written[1]!.trim(), written[2], 'US'].filter(Boolean).join(', ') : location;
}

/** One scan read twice: the same wording and place, and codes that agree when both carry one. */
function sameScan(incoming: SameInstantScan, stored: SameInstantScan): boolean {
  return wording(incoming) !== '' && wording(incoming) === wording(stored) && place(incoming) === place(stored)
    && (!incoming.providerCode || !stored.providerCode || incoming.providerCode === stored.providerCode);
}

// A partner's scan stored with its place as written takes the same scan read as a place over.
// JCEX lists a scan it relays a second time on Beijing's wall clock, and that
// copy goes once the scan it copies is listed. A copy stored before then under
// another offset shows, on Beijing's clock, the instant of the scan that comes
// later, which takes its row over.
export const sameInstantIdentityPolicy: SameInstantIdentityPolicy = {
  sourceCarrierId: 'jcex', storedSources: ['jcex'], requireProviderCode: false, matchEachScan: true, matches: sameScan,
  relabelledFrom: 'Asia/Shanghai',
};
