import { classifyWording, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

interface Entry { readonly code?: string; readonly wording?: string; readonly stage?: string; readonly note?: string }
const ENTRIES: readonly Entry[] = statuses.entries;

/**
 * The tracker's `trackstatus` codes, which only a record carries: its page labels them and files
 * 102 with 110, 198 with 104 and 202 with 201. Scans carry English wording without a code.
 */
const CODES: ReadonlyMap<string, Stage> = new Map(ENTRIES.filter((entry) => entry.code && entry.stage)
  .map((entry) => [entry.code!, entry.stage as Stage]));
const WORDINGS: ReadonlyMap<string, Stage> = new Map(ENTRIES.filter((entry) => !entry.code && entry.wording && entry.stage)
  .map((entry) => [normalizeStatusWording(entry.wording!), entry.stage as Stage]));

/** The stage of a record's `trackstatus`, or undefined for a code that names none. */
export const takesendStatusStage = (code: string): Stage | undefined => CODES.get(code);

/** A scan's stage: the map, else the shared wording rules, else nothing. */
export function takesendStage(wording: string): ClassifiedWording | null {
  const mapped = WORDINGS.get(normalizeStatusWording(wording));
  if (mapped) return { stage: mapped, source: 'carrier_map' };
  const worded = classifyWording(wording, 'in_transit');
  return worded.source === 'none' ? null : worded;
}

/** What the map says about a record's code or a scan's wording. */
export const statusMap: CarrierStatusMap = {
  stage: (code, wording) => (code ? CODES.get(code) : WORDINGS.get(wording)),
  gaps: ENTRIES.filter((entry) => entry.code && !entry.stage).map((entry) => ({ code: entry.code!, note: entry.note! })),
};
