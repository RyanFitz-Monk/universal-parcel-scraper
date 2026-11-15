import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

// The tracking page's script groups the status ids of the tracker's reply into its five steps.
// A step's ids are staged when the step says what happened: documented, collected or crossing
// the border, at the destination branch or received in Mexico, delivered. The fourth step,
// "on the delivery route", gathers ids the script does not tell apart, so it says no more than
// that the parcel is on its way. Each step also has ids the script shows as a problem without
// naming it; they keep their wording and no stage, except the one the partner documentation names.
const GROUPS: readonly (readonly [Stage, readonly number[]])[] = [
  ['registered', [1]],
  ['accepted', [43, 62, 40, 27, 58, 1001, 60, 71]],
  ['in_transit', [64, 44, 68, 39, 42, 38, 75, 37, 80, 78, 1008, 34, 18, 3, 59, 67, 1011, 1013, 33, 41, 93, 36, 95, 69, 74, 94, 48, 72]],
  ['delivered', [2, 31, 63, 1012, 1014]],
  // NO ONE TO RECEIVE (NBROA): the partner documentation's delivery attempt where nobody took the parcel.
  ['failed_attempt', [46]],
];

const STAGES: ReadonlyMap<string, Stage> = new Map(GROUPS.flatMap(([stage, ids]) => ids.map(id => [String(id), stage] as const)));

// Two problems the FAQ names in both languages, whatever id carries them.
const WORDINGS: ReadonlyMap<string, Stage> = new Map([
  ['held at customs', 'customs'], ['detenido en aduana', 'customs'],
  ['prohibited import', 'exception'], ['importación prohibida', 'exception'],
]);

/** The stage of a status id, or of a wording the FAQ names; undefined for a problem the script does not name or an id it does not list. */
export function houndStage(id: string | null, ...wordings: readonly string[]): Stage | undefined {
  const staged = id ? STAGES.get(id) : undefined;
  if (staged) return staged;
  for (const wording of wordings) {
    const named = WORDINGS.get(normalizeStatusWording(wording));
    if (named) return named;
  }
  return undefined;
}

export const statusMap: CarrierStatusMap = {
  stage: (code, wording) => houndStage(code, wording),
  gaps: [],
};
