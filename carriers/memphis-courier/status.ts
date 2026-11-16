import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/**
 * The tracker's scan codes. Its page moves its step bar on FLT (created), BRP (customs), CLA
 * (released) and DLV (delivered); the other codes come with Portuguese wordings of their own.
 */
const CODES: ReadonlyMap<string, Stage> = new Map([
  ['FLT', 'registered'],
  // "Entrada registrada no Centro de Distribuição" names no centre, so it can come before or after the flight.
  ['CHK', 'in_transit'],
  ['ENO', 'in_transit'],
  ['TRA', 'in_transit'],
  // The flight to Guarulhos and the airport's receipt.
  ['DEP', 'in_transit'],
  ['ARR', 'in_transit'],
  ['AAZ', 'in_transit'],
  // Clearance starts, then customs and ANVISA, the health regulator, inspect the parcel.
  ['BRP', 'customs'],
  ['HOC', 'customs'],
  ['ANV', 'customs'],
  // Released by customs: the parcel moves on.
  ['CLA', 'in_transit'],
  ['DLV', 'delivered'],
]);

export function memphisStage(code: string): Stage | undefined {
  return CODES.get(code);
}

export const statusMap: CarrierStatusMap = {
  stage: (code) => (code ? CODES.get(code) : undefined),
  gaps: [],
};
