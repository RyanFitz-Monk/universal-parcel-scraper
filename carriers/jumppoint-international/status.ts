import { classifyWording, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

/** International API labels; the domestic portal's status codes are a different vocabulary. */
export const JUMPPOINT_INTERNATIONAL_STAGES: Readonly<Record<string, Stage>> = {
  'Successful Delivery': 'delivered',
  'Out For Last Mile Delivery': 'out_for_delivery',
  'Arrival at Last Mile Distribution Point': 'in_transit',
  'On way to next Sorting Station': 'in_transit',
  'Arrived at Main Sorting Warehouse': 'in_transit',
  'Import Customs Handover To Lastmile': 'in_transit',
  'Arrival at Destination Airport': 'in_transit',
  'Departure from Origin Airport': 'in_transit',
  'Handover to Linehaul': 'in_transit',
  'Arrival at Origin Warehouse': 'accepted',
  'Order Created': 'registered',
  'Order Confirmed': 'registered',
};
const stages = new Map(Object.entries(JUMPPOINT_INTERNATIONAL_STAGES).map(([wording, stage]) => [normalizeStatusWording(wording), stage]));
export function jumppointInternationalStage(wording: string): ClassifiedWording {
  const stage = stages.get(normalizeStatusWording(wording));
  return stage ? { stage, source: 'carrier_map' } : classifyWording(wording, 'in_transit');
}
export const statusMap: CarrierStatusMap = { stage: (_code, wording) => stages.get(normalizeStatusWording(wording)), gaps: [] };
