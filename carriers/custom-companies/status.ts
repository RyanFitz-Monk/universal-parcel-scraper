import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap, type IntentionalStatusGap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

/** The wordings of the history and of the delivery details block, as `statuses.json` stages them. */
const WORDINGS: ReadonlyMap<string, Stage> = new Map(statuses.entries.flatMap((entry) =>
  'stage' in entry && entry.stage ? [[normalizeStatusWording(entry.wording), entry.stage as Stage] as const] : []));
// A departure names the terminal the trailer leaves for: "Trailer Departed For Northlake, Il".
const DEPARTED_FOR = /^trailer departed for \p{L}[\p{L} .'-]{0,59}, [a-z]{2}$/u;
// An appointment booked with the consignee, with its day and time or a note: "Appointment Set: Del Appt On 04/26 @ 1900".
const APPOINTMENT = /^appointment set:/;

const GAPS: readonly IntentionalStatusGap[] = [
  { code: 'RECLASS', note: 'A freight class correction at the dock; it moves nothing.' },
  { wording: 'reclass', note: 'A freight class correction at the dock; it moves nothing.' },
  { code: 'APPT', note: 'A delivery appointment booked with the consignee; it moves nothing.' },
  { wording: 'linehaul estimated departure', note: 'An estimate, not an event.' },
];

/** The stage the map gives a history row's or the details block's wording, if it knows it. */
export function customCompaniesStage(wording: string): Stage | undefined {
  const normalized = normalizeStatusWording(wording);
  return WORDINGS.get(normalized) ?? (DEPARTED_FOR.test(normalized) ? 'in_transit' : undefined);
}

/** What the map says about one row, by its code and wording: the wording decides, since one code covers several. */
export const statusMap: CarrierStatusMap = {
  stage: (_code, wording) => customCompaniesStage(wording),
  gaps: GAPS,
  gapNote: (code, wording) => (APPOINTMENT.test(wording) && (code === null || code === 'APPT')
    ? 'A delivery appointment booked with the consignee; it moves nothing.' : undefined),
  wholeWording: true,
};
