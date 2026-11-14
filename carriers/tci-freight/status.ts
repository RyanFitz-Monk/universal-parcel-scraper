import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

export function tciFreightStage(wording: string): Stage | undefined {
  if (/^Consignment Booked for .+$/i.test(wording)) return 'accepted';
  if (/^Consignment (?:Arrived at|Dispatched to) .+$/i.test(wording)) return 'in_transit';
  return undefined;
}

export const statusMap: CarrierStatusMap = { stage: (code, wording) => code ? undefined : tciFreightStage(wording), gaps: [] };
