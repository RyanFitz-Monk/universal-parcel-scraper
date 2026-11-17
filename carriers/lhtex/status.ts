import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

export function lhtexStage(wording: string): Stage | undefined {
  switch (normalizeStatusWording(wording)) {
    case '已签收': return 'delivered';
    case '派送中': return 'out_for_delivery';
    case '运输中': return 'in_transit';
    case '已揽收': return 'accepted';
    case '已接单':
    case '下单成功': return 'registered';
    default: return undefined;
  }
}

export const statusMap: CarrierStatusMap = { stage: (_code, wording) => lhtexStage(wording), gaps: [] };
