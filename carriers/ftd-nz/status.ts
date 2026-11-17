import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

/** Only the five headings read on FTD's own guest timeline. */
export function ftdNzStage(wording: string): Stage | undefined {
  const text = normalizeStatusWording(wording).replace(/^【[^【】]{1,100}】\s*/, '');
  if (/^已揽收(?:\s|$)/.test(text)) return 'accepted';
  if (/^(?:分拣中心|货物已发往机场|已发往中国|已抵达)(?:\s|$)/.test(text)) return 'in_transit';
  return undefined;
}

export const statusMap: CarrierStatusMap = { stage: (_code, wording) => ftdNzStage(wording), gaps: [] };
