import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

// A scan can name who signed for or received the parcel; its stage is read without the name.
export const ZNLOGIC_TAKER = /\s*\b(?:signed|received)\s+by\b\s*[:：]?\s*/i;

export function znlogicStage(_code: string | null, wording: string): Stage | undefined {
  const text = normalizeStatusWording(wording.split(ZNLOGIC_TAKER, 1)[0]!);
  if (/^delivered[.!]?$/.test(text) || /^delivered, in\/at mailbox[.!]?$/.test(text)) return 'delivered';
  if (text === 'out for delivery') return 'out_for_delivery';
  if (['arrived at post office', 'departed usps facility', 'usps in possession of item',
    'picked up by shipping partner, usps awaiting item'].includes(text)) return 'in_transit';
  if (['shipping label created', 'usps awaiting item'].includes(text)) return 'registered';
  return undefined;
}

export const statusMap: CarrierStatusMap = { stage: znlogicStage, gaps: [] };
