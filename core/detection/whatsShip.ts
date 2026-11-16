import { normalizeTrackingNumber } from './normalize.js';

/** The WhatsShip order-reference family its public guest tracker supports. */
export function isWhatsShipReference(raw: string): boolean {
  return typeof raw === 'string' && raw.length <= 64 && /^WS\d{17}DL$/.test(normalizeTrackingNumber(raw));
}
