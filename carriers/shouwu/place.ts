// The country's code a facility's name can open with, as in "CN,SAMPLE Sort Facility".
const COUNTRY_PREFIX = /^[A-Z]{2},(?=\p{L})/u;
// The town, state, country and postcode FedEx's rows open with, as Shouwu relays them:
// "SAMPLE TOWN, CA, US, 00000, Arrived at FedEx location". The postcode has a digit.
const RELAYED_PLACE = /^\p{L}[\p{L}\p{M} .'’-]{0,59}, [A-Z]{2}, [A-Z]{2}, (?:(?=[A-Z\d -]*\d)[A-Z\d][A-Z\d -]{1,8}[A-Z\d], )?(?=\p{L})/u;

/** A scan's place without the country's code it opens with: the facility's or the town's name. */
export function withoutCountryCode(location: string): string {
  return location.replace(COUNTRY_PREFIX, '');
}

/** A scan's wording without the town, state, country and postcode a relayed FedEx row opens with. */
export function withoutRelayedPlace(description: string): string {
  return description.replace(RELAYED_PLACE, '');
}
