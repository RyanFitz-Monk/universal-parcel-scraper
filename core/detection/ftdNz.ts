import { normalizeTrackingNumber } from './normalize.js';

/** The supported FTD reference shape, without assigning an issuer from a shared short reference. */
export function isFtdNzReference(raw: string): boolean {
  return typeof raw === 'string' && raw.length <= 64 && /^[A-Z]{3}\d{6}$/.test(normalizeTrackingNumber(raw));
}
