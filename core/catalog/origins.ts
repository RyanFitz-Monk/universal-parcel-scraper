/**
 * Carriers that follow some parcels under the number of the carrier that
 * delivers them.
 *
 * Cainiao shows AliExpress buyers the delivery carrier's own number on some
 * lanes, from the day the parcel ships, and Sengi Express carries parcels to
 * Italy under the SDA waybill Poste Italiane delivers them with. Both carriers
 * then know one number, at different stages of the same journey. This module
 * imports nothing, so detection can read it.
 */
const PARTNER_NUMBER_ORIGINS: ReadonlySet<string> = new Set(['aliexpress', 'sengi-express']);

export function followsPartnerNumbers(carrier: string): boolean {
  return PARTNER_NUMBER_ORIGINS.has(carrier);
}
