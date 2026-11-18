import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

/** One of PDU's states: the label its English tracking page gives it, and its stage. */
interface PduState {
  readonly label: string;
  readonly stage: Stage;
}

/**
 * The states PDU files a parcel and each of its scans under (`trackStatus`), with the labels of
 * its tracking page's English script. `DELIVERY` holds the last-mile carrier's national transit
 * as well as its round, so it stays in transit unless the scan's wording says the round began.
 */
const STATES: ReadonlyMap<string, PduState> = new Map<string, PduState>([
  ['TRANSIT', { label: 'In Transit', stage: 'in_transit' }],
  ['COLLECTING', { label: 'Being Collected', stage: 'in_transit' }],
  ['FINAL_COLLECTING', { label: 'Last-Mile Collection', stage: 'in_transit' }],
  ['DELIVERY', { label: 'Out for Delivery', stage: 'in_transit' }],
  ['DELIVERY_EXCEPTION', { label: 'Delivery Exception', stage: 'exception' }],
  ['SIGNED', { label: 'Delivered', stage: 'delivered' }],
  ['TO_BE_RETURN', { label: 'Awaiting Return', stage: 'exception' }],
  ['RETURNED', { label: 'Returned', stage: 'returned' }],
]);

/**
 * Scan wordings, after the last-mile carrier's code, whose stage is finer than their state's.
 * The shared wording rules misread some: the first scan's "not found in last mile or customs"
 * says no last-mile record exists yet, not that customs holds the parcel.
 */
export const PDU_WORDINGS: Readonly<Record<string, Stage>> = {
  'Shipment information sent to PDU.': 'registered',
  'Package not found in last mile or customs process.': 'registered',
  'Recogida en Aduanas': 'in_transit',
  'Ingreso a CEDI': 'in_transit',
  'En tránsito nacional': 'in_transit',
  'Salida a Ruta': 'out_for_delivery',
  Entregado: 'delivered',
};

const WORDINGS = new Map(Object.entries(PDU_WORDINGS).map(([wording, stage]) => [normalizeStatusWording(wording), stage]));

/** A state's label and stage, or undefined for a name the page's script does not list. */
export function pduState(name: string): PduState | undefined {
  return STATES.get(name);
}

/** A scan's stage: its wording's where the map knows it, else its state's. */
export function pduStage(state: string | null, wording: string): Stage | undefined {
  return WORDINGS.get(normalizeStatusWording(wording)) ?? (state ? STATES.get(state)?.stage : undefined);
}

export const statusMap: CarrierStatusMap = {
  stage: (code, wording) => pduStage(code, wording),
  gaps: [],
};
