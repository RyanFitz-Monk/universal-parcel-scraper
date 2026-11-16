import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

/** The history's wordings, as `statuses.json` stages them; a row's wording is its whole first column. */
const WORDINGS: ReadonlyMap<string, Stage> = new Map(statuses.entries.flatMap((entry) =>
  'stage' in entry && entry.stage ? [[normalizeStatusWording(entry.wording), entry.stage as Stage] as const] : []));

/** The stage the map gives a history row's wording, if it knows it. */
export function tforceStage(wording: string): Stage | undefined {
  return WORDINGS.get(normalizeStatusWording(wording));
}

/** What the map says about one row; the tracker gives no codes. */
export const statusMap: CarrierStatusMap = {
  stage: (_code, wording) => tforceStage(wording),
  gaps: [
    { wording: 'status', note: 'A companion row whose time column holds a reason, such as Not Performed: RTS; not an event.' },
    { wording: 'expected by', note: 'The delivery estimate, not an event.' },
  ],
  wholeWording: true,
};
