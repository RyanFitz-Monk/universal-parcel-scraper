import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

export function bestFreightCnStage(wording: string): Stage | undefined {
  switch (normalizeStatusWording(wording)) {
    case '揽收': return 'accepted';
    case '发件': case '到件': case '装车': return 'in_transit';
    default: return undefined;
  }
}

export const statusMap: CarrierStatusMap = { stage: (_code, wording) => bestFreightCnStage(wording), gaps: [] };
