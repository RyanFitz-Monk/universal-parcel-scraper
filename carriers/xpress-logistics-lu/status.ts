import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/** One status of the service: the wording the tracking page gives it, and its stage. */
interface XpressStatus {
  readonly fr: string;
  readonly stage: Stage;
}

// The statuses the tracking page's template names, each with its French wording.
const STATUSES: ReadonlyMap<string, XpressStatus> = new Map<string, XpressStatus>([
  ['waiting', { fr: 'Colis déclaré et prêt pour expédition', stage: 'registered' }],
  ['picked up', { fr: 'Expédition', stage: 'accepted' }],
  ['warehouse', { fr: "A l'entrepôt Xpress Logistics", stage: 'in_transit' }],
  ['delivering', { fr: 'En cours de livraison', stage: 'out_for_delivery' }],
  ['delivered', { fr: 'Livré', stage: 'delivered' }],
  ['attempt delivery', { fr: 'Destinataire absent ou destination non trouvée', stage: 'failed_attempt' }],
  ['canceled', { fr: 'Livraison annulée', stage: 'exception' }],
]);

/** A status's wording and stage, or undefined for one the tracking page does not name. */
export function xpressStatus(name: string): XpressStatus | undefined {
  return STATUSES.get(name);
}

export const statusMap: CarrierStatusMap = {
  stage: (code) => (code ? STATUSES.get(code)?.stage : undefined),
  gaps: [],
};
