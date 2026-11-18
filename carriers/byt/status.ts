import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

const WORDINGS = new Map<string, Stage>(statuses.entries.map((entry) => [normalizeStatusWording(entry.wording), entry.stage as Stage]));
// The hand-over to another last-mile carrier, which goes on with that carrier's number.
const NEW_VENDOR = /^the warehouse changed the last-mile vendor\b/;

/**
 * The stage BYT's map gives a row, by its `normalizeStatusWording` wording. A row's kind code,
 * when it has one, groups many wordings and decides nothing.
 */
export function bytStage(_code: string | null, wording: string): Stage | undefined {
  return WORDINGS.get(wording) ?? (NEW_VENDOR.test(wording) ? 'in_transit' : undefined);
}

export const statusMap: CarrierStatusMap = { stage: bytStage, gaps: [] };
