import { classifyWording, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

/**
 * The wording of AAA Cooper's PRO tracking page, in `normalizeStatusWording` form: the
 * status field, and each tracing row, whose sentence ends with or names the place. None
 * carries a code.
 */
const WORDINGS: readonly (readonly [RegExp, Stage])[] = [
  // The status field over the rows.
  [/^delivered$/, 'delivered'],
  [/^out for delivery$/, 'out_for_delivery'],
  // "Shipment Picked Up From Shipper In NORCROSS, GA": collected from the shipper.
  [/^shipment picked up from shipper in \S.*$/, 'accepted'],
  // "Shipment departed NASHVILLE Service Center", "Shipment arrived at NASHVILLE Service Center".
  [/^shipment departed \S.* service center$/, 'in_transit'],
  [/^shipment arrived at \S.* service center$/, 'in_transit'],
  // "Shipment arrived at destination Service Center ORLANDO, FL": at the delivering terminal.
  [/^shipment arrived at destination service center \S.*$/, 'in_transit'],
  [/^shipment out for delivery to consignee in \S.*$/, 'out_for_delivery'],
  [/^delivered to consignee in \S.*$/, 'delivered'],
];

/** The stage the map gives AAA Cooper's wording, if it knows it. */
export function aaaCooperMappedStage(wording: string): Stage | undefined {
  const normalized = normalizeStatusWording(wording);
  return WORDINGS.find(([pattern]) => pattern.test(normalized))?.[1];
}

/**
 * A row's or the status field's stage from the map, else from the shared wording rules.
 * Wording neither knows stays without a stage, so it remains visible for review.
 */
export function aaaCooperStage(wording: string): ClassifiedWording | null {
  const mapped = aaaCooperMappedStage(wording);
  if (mapped) return { stage: mapped, source: 'carrier_map' };
  const worded = classifyWording(wording, 'in_transit');
  return worded.source === 'none' ? null : worded;
}

/** The page carries wording only; the map leaves none of it out on purpose. */
export const statusMap: CarrierStatusMap = {
  stage: (code, wording) => (code ? undefined : aaaCooperMappedStage(wording)),
  gaps: [],
  wholeWording: true,
};
