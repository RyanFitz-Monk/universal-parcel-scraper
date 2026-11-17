import type { Stage } from '../../core/status/index.js';
import { statusWordings } from '../../core/status/english.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

const WORDINGS = statusWordings(statuses.entries);
// The row of the flight the parcel is loaded for names its day in both halves: "预计配载航班11月11日,Expected flight on November 11th".
const LOADED_FLIGHT = /^(预计配载航班)\d{1,2}月\d{1,2}日[,，] ?(expected flight on )[a-z]+ \d{1,2}(?:st|nd|rd|th)$/;

/**
 * The stage PWB's map gives a row, by its `normalizeStatusWording` wording, a booked flight's day as an ellipsis.
 * A row's kind code, when it has one, groups many wordings and decides nothing.
 */
export function pwbStage(_code: string | null, wording: string): Stage | undefined {
  return WORDINGS.stage(wording.replace(LOADED_FLIGHT, '$1…月…日,$2…'));
}

export const statusMap: CarrierStatusMap = { stage: pwbStage, gaps: [] };
