import { airportTimeZone } from '../../places/index.js';
import { keepsZone } from '../../places/zones.js';

/**
 * The country of an office of exchange's UPU code ("DEFRAA", "DEFRA", "INMAAB"): its two
 * letters, when the airport after them keeps that country's clock. A word of five or six
 * letters that fails this ("KANPUR", "RODGAU") is an office's name.
 */
export function exchangeCodeCountry(code: string): string | undefined {
  const parts = /^([A-Z]{2})([A-Z]{3})[A-Z\d]?$/.exec(code);
  const zone = parts ? airportTimeZone(parts[2]!) : undefined;
  return parts && zone && keepsZone(parts[1]!, zone) ? parts[1] : undefined;
}
