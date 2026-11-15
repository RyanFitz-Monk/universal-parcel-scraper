import { classifyWording, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import { escapeRegExp } from '../../core/transport/text.js';
import statuses from './statuses.json' with { type: 'json' };

/**
 * The statuses of Timely Titan's tracking page, which carry no code: its
 * warehouse's, the forwarding line's and the delivering post's, in Chinese.
 * An entry's `…` stands for what the page fills in, such as an office, a day
 * or a number. Another wording falls to the shared wording rules.
 */
const WORDINGS: readonly (readonly [RegExp, Stage])[] = (statuses.entries as readonly { wording: string; stage?: string }[])
  .filter((entry) => entry.stage)
  .map((entry) => [
    new RegExp(`^${normalizeStatusWording(entry.wording).split('…').map(escapeRegExp).join('[^【】]+')}$`, 'u'),
    entry.stage as Stage,
  ]);

// "【本人签收，…】", "【他人代收，…】": who signed for a delivery, after the delivery's own words.
const SIGNING = /【[^【】]*(?:签收|代收)[^【】]*】/g;
// "signed by …", "签收人：…": who took a delivered parcel, to the end of the text.
const RECEIVER = /\s*[,;:.\-–，；：]?\s*(?:(?:signed(?: for)? by|signatory|received by)\b|签收人)[\s\S]*$/i;

/** A wording without who signed for the parcel, as the map and the shared rules read it. */
export function timelyTitanUnsigned(wording: string): string {
  return wording.replace(SIGNING, '').replace(RECEIVER, '').trim();
}

/** The stage Timely Titan's map gives a wording in `normalizeStatusWording` form. */
export function timelyTitanMappedStage(wording: string): Stage | undefined {
  const unsigned = timelyTitanUnsigned(wording);
  return WORDINGS.find(([pattern]) => pattern.test(unsigned))?.[1];
}

/** A wording's stage: the map, else the shared wording rules, else nothing. */
export function timelyTitanStage(wording: string): ClassifiedWording | null {
  const unsigned = timelyTitanUnsigned(wording);
  const mapped = timelyTitanMappedStage(normalizeStatusWording(unsigned));
  if (mapped) return { stage: mapped, source: 'carrier_map' };
  const worded = classifyWording(unsigned, 'in_transit');
  return worded.source === 'none' ? null : worded;
}

/** The estimate of the next arrival names its distance, so no one wording covers it. */
export const statusMap: CarrierStatusMap = {
  stage: (_code, wording) => timelyTitanMappedStage(wording),
  gaps: [],
};
