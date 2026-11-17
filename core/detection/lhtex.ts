import { normalizeTrackingNumber } from './normalize.js';

/** Supported by LHT's own guest lookup; this shared numeric shape does not identify an issuer. */
export function isLhtexReference(raw: string): boolean {
  return typeof raw === 'string' && raw.length <= 64 && /^\d{12}$/.test(normalizeTrackingNumber(raw));
}
