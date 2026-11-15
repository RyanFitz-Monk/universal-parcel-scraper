import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/** One status name of the tracker: the wording its script gives it in English and German, and its stage. */
interface NightStarStatus {
  readonly en: string;
  readonly de: string;
  readonly stage: Stage;
}

// The status names of the 1stSCAN tracker's script, with its own translations. A package and
// each of its events carry one. A failed or late pickup leaves the package with its sender; a
// late delivery leaves it with the carrier.
const STATUSES: ReadonlyMap<string, NightStarStatus> = new Map<string, NightStarStatus>([
  ['ORDER_REGISTERED', { en: 'Registered', de: 'Erfasst', stage: 'registered' }],
  ['IN_PICKUP', { en: 'Pickup pending', de: 'Abholung bevorstehend', stage: 'registered' }],
  ['IN_PICKUP_DELAYED', { en: 'Pickup delayed', de: 'Abholung verzögert', stage: 'registered' }],
  ['UNSUCCESSFUL_PICKUP', { en: 'Pickup failed', de: 'Abholung fehlgeschlagen', stage: 'registered' }],
  ['PICKED_UP', { en: 'Goods picked up', de: 'Ware übernommen', stage: 'accepted' }],
  ['IN_TRANSIT', { en: 'In transit', de: 'In Transit', stage: 'in_transit' }],
  ['IN_DELIVERY', { en: 'Out for delivery', de: 'In Auslieferung', stage: 'out_for_delivery' }],
  ['IN_DELIVERY_DELAYED', { en: 'Delivery delayed', de: 'Zustellung verzögert', stage: 'in_transit' }],
  ['UNSUCCESSFUL_DELIVERY', { en: 'Delivery failed', de: 'Zustellung fehlgeschlagen', stage: 'failed_attempt' }],
  ['DELIVERED', { en: 'Delivered', de: 'Zugestellt', stage: 'delivered' }],
  ['CANCELLED', { en: 'Canceled', de: 'Storniert', stage: 'exception' }],
]);

/** A status name's wordings and stage, or undefined for a name the tracker's script does not list. */
export function nightStarStatus(name: string): NightStarStatus | undefined {
  return STATUSES.get(name);
}

export const statusMap: CarrierStatusMap = {
  stage: (code) => (code ? STATUSES.get(code)?.stage : undefined),
  gaps: [],
};
