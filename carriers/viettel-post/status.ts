import { classifyWording, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import evidence from './statuses.json' with { type: 'json' };

const WORDINGS = new Map(evidence.entries.map(entry => [normalizeStatusWording(entry.wording), entry.stage as Stage]));

export function viettelPostStage(wording: string): ClassifiedWording | null {
  const stage = WORDINGS.get(normalizeStatusWording(wording));
  if (stage) return { stage, source: 'carrier_map' };
  const classified = classifyWording(wording, 'in_transit');
  return classified.source === 'none' ? null : classified;
}

const HISTORY_CODES: ReadonlyMap<string, Stage> = new Map([
  ['100', 'registered'], ['200', 'accepted'], ['300', 'in_transit'], ['400', 'in_transit'],
  ['500', 'out_for_delivery'], ['501', 'delivered'],
]);

export function viettelPostHistoryStage(code: string): Stage | undefined { return HISTORY_CODES.get(code); }

export const statusMap: CarrierStatusMap = {
  stage: (code, wording) => code && /^\d{3,4}$/.test(code) ? HISTORY_CODES.get(code) : WORDINGS.get(wording),
  gaps: [
    { code: '103', note: 'Order assigned to a post office; does not establish physical collection.' },
    { code: '202', note: 'Waybill details edited; retains the preceding shipment stage.' },
  ],
};
