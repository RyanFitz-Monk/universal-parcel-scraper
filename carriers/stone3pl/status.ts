import { classifyWording, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
import statuses from './statuses.json' with { type: 'json' };

type Entry = { code?: string; wording: string; stage?: string };
const WORDINGS = new Map<string, Stage>((statuses.entries as readonly Entry[])
  .filter(entry => !entry.code && entry.stage)
  .map(entry => [normalizeStatusWording(entry.wording), entry.stage as Stage]));

// A delivery's signer, from the label to the end: "Delivered, signed by NAME".
const SIGNER = /\s*[,;:.\-–]?\s*\b(?:signed(?: for)? by|signatory|received by)\b[\s\S]*$/i;

/** A wording without the signer it names, as the map and the stage read it. */
export function stone3plUnsigned(wording: string): string {
  return wording.replace(SIGNER, '').replace(/^[\s,;:\-–]+|[\s,;:\-–]+$/g, '');
}

export function stone3plStage(wording: string): Stage | undefined {
  return WORDINGS.get(normalizeStatusWording(wording));
}

export function stone3plScanStage(text: string): ClassifiedWording | null {
  const wording = stone3plUnsigned(text);
  const mapped = stone3plStage(wording);
  if (mapped) return { stage: mapped, source: 'carrier_map' };
  const classified = classifyWording(wording, 'in_transit');
  return classified.source === 'none' ? null : classified;
}

// A scan's numeric status is a broad bucket: even pre-advice can be 1 (in transit).
// The scan's wording, rather than that bucket, establishes its milestone.
export const statusMap: CarrierStatusMap = {
  stage: (_code, wording) => stone3plStage(stone3plUnsigned(wording)),
  gaps: [],
};
