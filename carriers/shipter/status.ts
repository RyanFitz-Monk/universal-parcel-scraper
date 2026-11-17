import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

type Entry = { wording: string; stage?: string; note?: string };

const ENTRIES = statuses.entries as readonly Entry[];

const WORDINGS = new Map<string, Stage>(ENTRIES.filter((entry) => entry.stage)
  .map((entry) => [normalizeStatusWording(entry.wording), entry.stage as Stage]));

// Partners' notices relayed after Shipter's acceptance: the parcel keeps the stage of the scan before them.
const NOTICES: ReadonlySet<string> = new Set(ENTRIES.filter((entry) => !entry.stage)
  .map((entry) => normalizeStatusWording(entry.wording)));

/** Partner rows repeat a depot before the wording; towns and hubs are variable. */
export function shipterScanKey(wording: string): string {
  const text = wording.replace(/^([^,]{1,100}), \1, (your .+)$/, '$2');
  return text.replace(/^(your parcel is currently in transit to )[^.]+\.\.$/, '$1…')
    .replace(/^(your parcel has been received at )[^.]+( depot\.\.)$/, '$1…$2')
    .replace(/^(parcel received in processing centre \()[^)]+\)$/, '$1…)')
    .replace(/^(parcel depart from )[^.]+( depot)$/, '$1…$2')
    .replace(/^(the item is ready for shipment)[a-z][a-z -]*$/, '$1…');
}

export const shipterStage = (_code: string | null, wording: string): Stage | undefined => WORDINGS.get(shipterScanKey(wording));

/** Whether a wording is a notice that moves nothing. */
export const isShipterNotice = (wording: string): boolean => NOTICES.has(shipterScanKey(wording));

export const statusMap: CarrierStatusMap = {
  stage: shipterStage,
  gaps: ENTRIES.filter((entry) => !entry.stage).map((entry) => ({ wording: normalizeStatusWording(entry.wording), note: entry.note! })),
};
