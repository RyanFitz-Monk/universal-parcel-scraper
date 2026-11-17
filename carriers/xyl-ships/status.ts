import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

type Entry = { wording: string; stage?: string; note?: string };

const ENTRIES = statuses.entries as readonly Entry[];

const WORDINGS = new Map<string, Stage>(ENTRIES.filter((entry) => entry.stage)
  .map((entry) => [normalizeStatusWording(entry.wording), entry.stage as Stage]));

export const xylShipsStage = (_code: string | null, wording: string): Stage | undefined => WORDINGS.get(normalizeStatusWording(wording));

export const statusMap: CarrierStatusMap = {
  stage: xylShipsStage,
  gaps: ENTRIES.filter((entry) => !entry.stage).map((entry) => ({ wording: normalizeStatusWording(entry.wording), note: entry.note! })),
};
