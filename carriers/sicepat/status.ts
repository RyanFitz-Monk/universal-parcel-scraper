import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

export function sicepatStage(code: string, wording: string): Stage | undefined {
  if (code === 'PICKREQ') return 'registered';
  if (code === 'PICK') return 'accepted';
  if (code === 'IN') return /manifested/i.test(wording) ? 'accepted' : 'in_transit';
  if (['OUT', 'RTA'].includes(code)) return 'in_transit';
  if (code === 'DLV') return 'delivered';
  if (code === 'ANT') return 'out_for_delivery';
  if (code === 'BAD ADDRESS') return 'failed_attempt';
  if (['RETUR PUSAT', 'ANT_RETUR', 'RETURN TO SHIPPER'].includes(code)) return 'returned';
  return undefined;
}

export const statusMap: CarrierStatusMap = { stage: (code, wording) => code ? sicepatStage(code, wording) : undefined, gaps: [] };
