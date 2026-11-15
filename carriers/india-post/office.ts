import { airportTimeZone } from '../../places/index.js';
import { keepsZone } from '../../places/zones.js';

// UN/LOCODE codes of cities whose airports each have their own code, which an office of exchange
// there can be named by: "RUMOWA" is Moscow's, "JPTYOA" Tokyo's. No airport has these codes.
const CITY_CODES = new Set([
  'ARBUE', 'BRRIO', 'BRSAO', 'CNBJS', 'FRPAR', 'GBLON', 'IDJKT', 'ITMIL', 'ITROM', 'JPOSA',
  'JPTYO', 'KRSEL', 'ROBUH', 'RUMOW', 'SESTO', 'USCHI', 'USNYC', 'USWAS',
]);

/**
 * The country of an office of exchange's UPU code ("DEFRAA", "DEFRA", "INMAAB"): its two
 * letters, when the airport after them keeps that country's clock, or when a city code of that
 * country follows them with an office's letter ("RUMOWA"). A word of five or six letters that
 * fails this ("KANPUR", "RODGAU") is an office's name.
 */
export function exchangeCodeCountry(code: string): string | undefined {
  const parts = /^([A-Z]{2})([A-Z]{3})([A-Z\d]?)$/.exec(code);
  if (parts?.[3] && CITY_CODES.has(`${parts[1]}${parts[2]}`)) return parts[1];
  const zone = parts ? airportTimeZone(parts[2]!) : undefined;
  return parts && zone && keepsZone(parts[1]!, zone) ? parts[1] : undefined;
}
