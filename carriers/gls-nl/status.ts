import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/**
 * GLS Netherlands' scans carry GLS's event number and the reason that comes
 * with it, written here as `event/reason`, and the wording in the language
 * asked for. The numbers stage a scan; a reason not listed takes its event's
 * stage.
 */
const EVENTS = new Map<number, Stage>([
  [0, 'accepted'],
  [1, 'in_transit'],
  [2, 'in_transit'],
  [3, 'delivered'],
  [4, 'failed_attempt'],
  [11, 'out_for_delivery'],
  // The parcel was collected from the sender.
  [17, 'accepted'],
  // Back at the depot undelivered, with the attempt's reason; it goes out again or waits for an instruction.
  [35, 'failed_attempt'],
  // A check or registration scan in GLS's network.
  [46, 'in_transit'],
  // A new label stuck on in a depot.
  [72, 'in_transit'],
  // Collected from the sender by GLS.
  [81, 'accepted'],
]);

const REASONS = new Map<string, Stage>([
  // The sender's data reached GLS; GLS does not have the parcel yet.
  ['0/100', 'registered'],
  ['0/1480', 'registered'],
  // Sorted on arrival as a small business parcel.
  ['0/29', 'in_transit'],
  // GLS took the parcel from the ParcelShop the sender left it at.
  ['1/124', 'accepted'],
  // The sender left the parcel at a ParcelShop.
  ['2/1241', 'accepted'],
  // Handed to a ParcelShop or put in a locker for the recipient to collect.
  ['3/124', 'ready_for_pickup'],
  ['3/872', 'ready_for_pickup'],
  ['3/896', 'ready_for_pickup'],
]);

/**
 * The ParcelShop arrival: the sender's drop-off before GLS has the parcel,
 * the recipient's pickup point after delivery. The scan's own state says
 * which.
 */
export const PARCELSHOP_ARRIVAL = '2/124';
/** A scan's `state` once GLS delivered the parcel, to the door, a ParcelShop or a locker. */
export const DELIVERED_STATE = 4;

/** Notices that move nothing: the parcel keeps the stage of the scan before. */
const NOTICES = new Map<number, string>([
  [12, 'Not taken out on a round, with the reason: a delivery planned for a later day, or the business closed.'],
  [33, 'An instruction from the recipient, such as to collect the parcel from a ParcelShop.'],
  [73, 'The sender paid for the label.'],
  [77, 'A request from the recipient for another delivery, or a locker booked for it.'],
  [85, 'Information from a locker, such as the parcel fitting its compartment.'],
  [90, 'GLS told the recipient the parcel is on its way.'],
]);

export const glsNlCode = (event: number, reason: number) => `${event}/${reason}`;

function parts(code: string): [number, number] | null {
  const match = /^(\d{1,4})\/(\d{1,5})$/.exec(code);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

/** The stage GLS's numbers give a scan, or undefined for a notice, the ParcelShop arrival or a number not listed. */
export function glsNlMappedStage(code: string): Stage | undefined {
  const numbers = parts(code);
  if (!numbers || code === PARCELSHOP_ARRIVAL || NOTICES.has(numbers[0])) return undefined;
  return REASONS.get(code) ?? EVENTS.get(numbers[0]);
}

/** A scan's stage, with the ParcelShop arrival read by the scan's state. */
export function glsNlStage(code: string, state: number | null): Stage | undefined {
  if (code === PARCELSHOP_ARRIVAL) return state === DELIVERED_STATE ? 'ready_for_pickup' : state === null ? undefined : 'accepted';
  return glsNlMappedStage(code);
}

export const statusMap: CarrierStatusMap = {
  stage: (code) => (code === null ? undefined : glsNlMappedStage(code)),
  gaps: [],
  gapNote: (code) => {
    const numbers = code === null ? null : parts(code);
    if (!numbers) return undefined;
    if (code === PARCELSHOP_ARRIVAL) return "The ParcelShop arrival: the sender's drop-off, or the recipient's pickup point once the scan's state is delivered.";
    return NOTICES.get(numbers[0]);
  },
};
