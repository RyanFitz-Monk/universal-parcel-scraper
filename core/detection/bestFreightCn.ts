import { normalizeTrackingNumber } from './normalize.js';

/** The supported whole BEST China freight waybill; the numeric shape does not identify its issuer. */
export function isBestFreightCnReference(raw: string): boolean {
  return typeof raw === 'string' && raw.length <= 64 && /^\d{11}$/.test(normalizeTrackingNumber(raw));
}
