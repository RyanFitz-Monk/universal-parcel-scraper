import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/** One state of the tracker: the wording its page gives it, and its stage. */
interface SwissconnectState {
  readonly wording: string;
  readonly stage: Stage;
}

// The four steps of the tracker's progress bar, in its order, then the state it shows in
// their place for a cancelled shipment. The wordings are its German page's.
const STATES: ReadonlyMap<string, SwissconnectState> = new Map<string, SwissconnectState>([
  ['created', { wording: 'In Vorbereitung', stage: 'registered' }],
  ['pickedUp', { wording: 'Abgeholt', stage: 'accepted' }],
  ['inDelivery', { wording: 'In Zustellung', stage: 'out_for_delivery' }],
  ['delivered', { wording: 'Persönlich zugestellt', stage: 'delivered' }],
  ['annullated', { wording: 'Annulliert', stage: 'exception' }],
]);

/** The progress bar's steps, first to last. */
export const SWISSCONNECT_STEPS = ['created', 'pickedUp', 'inDelivery', 'delivered'] as const;

/** A state's wording and stage, or undefined for a name the tracker's script does not list. */
export function swissconnectState(name: string): SwissconnectState | undefined {
  return STATES.get(name);
}

export const statusMap: CarrierStatusMap = {
  stage: (code) => (code ? STATES.get(code)?.stage : undefined),
  gaps: [],
};
