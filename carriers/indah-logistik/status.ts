import { classifyWording, type ClassifiedWording, type Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/** What the text after a wording's dash names: a branch or warehouse town, the receiver, or something else. */
type Detail = 'place' | 'receiver' | null;
/** A wording's stage, and what the text after its dash names. */
type Entry = readonly [stage: Stage, detail: Detail];

/**
 * The wordings Indah Logistik's lookup writes before a dash, in lower case.
 * Movement wordings name a town after the dash, the delivery and an attempt
 * the receiver and their relation, the courier's row the courier, and a
 * scheduled delivery a note.
 */
const WORDINGS: ReadonlyMap<string, Entry> = new Map([
  // The counter of a branch or drop point books, weighs and prices the parcel.
  ['transaksi', ['accepted', 'place']],
  ['paket sudah berada di gudang asal', ['accepted', 'place']],
  ['paket dalam perjalanan dari gudang asal', ['in_transit', 'place']],
  ['paket telah sampai di gudang transit', ['in_transit', 'place']],
  ['paket telah berangkat dari gudang transit', ['in_transit', 'place']],
  // The destination branch's warehouse, not the recipient.
  ['paket telah sampai di gudang tujuan', ['in_transit', 'place']],
  ['paket sedang diantar oleh kurir', ['out_for_delivery', null]],
  // A delivery booked for a later run, such as one across islands; no attempt was made.
  ['pengantaran terjadwal', ['in_transit', null]],
  ['alamat tidak ditemukan / penerima tidak dapat di hubungi', ['failed_attempt', 'receiver']],
  ['paket telah diterima', ['delivered', 'receiver']],
]);

// The wording, then what the row names after its dash.
export const DASH = /\s+-\s+/;

const key = (wording: string) => wording.split(DASH)[0]!.toLowerCase().replace(/\s+/g, ' ').trim();

/** The stage Indah Logistik's own wording gives a row, read from the wording before its dash. */
export function indahLogistikMappedStage(wording: string): Stage | undefined {
  return WORDINGS.get(key(wording))?.[0];
}

/** What the text after this wording's dash names. */
export function detailOf(wording: string): Detail {
  return WORDINGS.get(key(wording))?.[1] ?? null;
}

/** A row's stage: its wording, else the shared wording rules, else nothing. */
export function indahLogistikStage(wording: string): ClassifiedWording | null {
  const mapped = indahLogistikMappedStage(wording);
  if (mapped) return { stage: mapped, source: 'carrier_map' };
  const worded = classifyWording(wording, 'in_transit');
  return worded.source === 'none' ? null : worded;
}

export const statusMap: CarrierStatusMap = {
  stage: (_code, wording) => indahLogistikMappedStage(wording),
  gaps: [],
};
