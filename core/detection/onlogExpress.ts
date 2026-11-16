import { normalizeTrackingNumber } from './normalize.js';

/** References supported by Onlog Express's public guest tracker, without establishing ownership. */
export function isOnlogExpressReference(raw: string): boolean {
  return typeof raw === 'string' && raw.length <= 64 && /^AA\d{10}$/.test(normalizeTrackingNumber(raw));
}
