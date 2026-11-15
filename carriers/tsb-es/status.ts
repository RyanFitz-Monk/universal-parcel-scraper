import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

/** One status of the tracker: its wording in the tracker's three languages, and its stage. */
interface TsbStatus {
  readonly en: string;
  readonly es: string;
  readonly ca: string;
  readonly stage: Stage;
}

// The steps of the public page's progress rail, by the date field each one shows. A delivery round
// that failed has no wording of its own on the rail, so it takes the tracker's wording for a failed delivery.
const STEPS: ReadonlyMap<string, TsbStatus> = new Map<string, TsbStatus>([
  ['alta', { en: 'Recorded', es: 'Creada', ca: 'Creada', stage: 'registered' }],
  ['recepcion', { en: 'Reception', es: 'Recepción', ca: 'Recepció', stage: 'accepted' }],
  ['salida', { en: 'Departure', es: 'Salida de origen', ca: 'Sortida Origen', stage: 'in_transit' }],
  ['llegada', { en: 'Arrival', es: 'Llegada en destino', ca: 'Arribada Destí', stage: 'in_transit' }],
  ['llegadaAlmacenInternacional', { en: 'Arrival International', es: 'Llegada internacional', ca: 'Arribada internacional', stage: 'in_transit' }],
  ['reparto', { en: 'On Delivery', es: 'En Reparto', ca: 'Repartiment', stage: 'out_for_delivery' }],
  ['repartoFallida', { en: 'FAILED DELIVERY', es: 'REPARTO FALLIDO', ca: 'ENTREGA FALLIDA', stage: 'failed_attempt' }],
  ['entrega', { en: 'Delivered', es: 'Entregada', ca: 'Entregada', stage: 'delivered' }],
]);

// The situations the tracker's script names for a shipment. A partial and a deferred delivery leave
// goods to come; `FALT` is a shortage; the `D` situations are a return under way and `DENT` its end.
const SITUATIONS: ReadonlyMap<string, TsbStatus> = new Map<string, TsbStatus>([
  ['ALTA', { en: 'PENDING', es: 'PENDIENTE', ca: 'PENDENT', stage: 'registered' }],
  ['LECT', { en: 'PENDING', es: 'PENDIENTE', ca: 'PENDENT', stage: 'registered' }],
  ['COMP', { en: 'PENDING', es: 'PENDIENTE', ca: 'PENDENT', stage: 'registered' }],
  ['LLEG', { en: 'AT DESTINATION', es: 'DESTINO', ca: 'DESTÍ', stage: 'in_transit' }],
  ['CPCE', { en: 'IN TRANSIT', es: 'EN TRANSITO', ca: 'EN TRÀNSIT', stage: 'in_transit' }],
  ['REPA', { en: 'IN DELIVERY', es: 'REPARTO', ca: 'REPARTIMENT', stage: 'out_for_delivery' }],
  ['ENTR', { en: 'DELIVERED', es: 'ENTREGADA', ca: 'ENTREGADA', stage: 'delivered' }],
  ['BBEN', { en: 'DELIVERED', es: 'ENTREGADA', ca: 'ENTREGADA', stage: 'delivered' }],
  ['BBTR', { en: 'DELIVERED*', es: 'ENTREGADA*', ca: 'ENTREGADA*', stage: 'delivered' }],
  ['BBTRI', { en: 'FAILED DELIVERY', es: 'REPARTO FALLIDO', ca: 'ENTREGA FALLIDA', stage: 'failed_attempt' }],
  ['CREP', { en: 'FAILED DELIVERY', es: 'REPARTO FALLIDO', ca: 'ENTREGA FALLIDA', stage: 'failed_attempt' }],
  ['IREP', { en: 'FAILED DELIVERY', es: 'REPARTO FALLIDO', ca: 'ENTREGA FALLIDA', stage: 'failed_attempt' }],
  ['ENPA', { en: 'PARTIAL DELIVERY', es: 'E.PARCIAL', ca: 'E.PARCIAL', stage: 'in_transit' }],
  ['ENAP', { en: 'DEFERRED', es: 'E.APLAZADA', ca: 'E.APLAÇADA', stage: 'in_transit' }],
  ['DGEN', { en: 'RETURN', es: 'DEVOLUCION', ca: 'DEVOLUCIÓ', stage: 'returned' }],
  ['DORD', { en: 'RETURN', es: 'DEVOLUCION', ca: 'DEVOLUCIÓ', stage: 'returned' }],
  ['DPRO', { en: 'RETURN', es: 'DEVOLUCION', ca: 'DEVOLUCIÓ', stage: 'returned' }],
  ['DENT', { en: 'RETURNED', es: 'DEVUELTA', ca: 'RETORNADA', stage: 'returned' }],
  ['FALT', { en: 'INCIDENCE', es: 'FALTA', ca: 'FALTA', stage: 'exception' }],
  ['ANUL', { en: 'CANCELLED', es: 'ANULADA', ca: 'ANULADA', stage: 'exception' }],
  ['SACO', { en: 'INTERNATIONAL DEPARTURE', es: 'SALIDA INTERNACIONAL', ca: 'SORTIDA INTERNACIONAL', stage: 'in_transit' }],
]);

// A shipment still in the sender's own system: recorded there, or announced to the carrier.
const RECORDED: TsbStatus = { en: 'SAVED', es: 'GRABADA', ca: 'GRAVADA', stage: 'registered' };
const ANNOUNCED: TsbStatus = { en: 'COMMUNICATED', es: 'COMUNICADA', ca: 'COMUNICADA', stage: 'registered' };

/** A step of the progress rail, by its name. */
export function tsbStep(name: string): TsbStatus | undefined {
  return STEPS.get(name);
}

/** A situation the tracker's script names, by its code. */
export function tsbSituation(code: string): TsbStatus | undefined {
  return SITUATIONS.get(code);
}

/**
 * The shipment's stated situation as the tracker's script reads it: a code after its translation
 * key, or a state of the sender's system, which starts with `E` and is recorded when it starts with `E2`.
 */
export function tsbState(value: unknown): { code: string; status: TsbStatus } | undefined {
  if (typeof value !== 'string') return undefined;
  const code = /^estados\.padua\.situacion\.([A-Z]{2,8})$/.exec(value)?.[1];
  const known = code ? SITUATIONS.get(code) : undefined;
  if (code && known) return { code, status: known };
  if (/^E[A-Z0-9]{0,15}$/.test(value)) return value.startsWith('E2') ? { code: 'grabacion', status: RECORDED } : { code: 'comunicada', status: ANNOUNCED };
  return undefined;
}

export const statusMap: CarrierStatusMap = {
  stage: (code) => (code ? (STEPS.get(code) ?? SITUATIONS.get(code) ?? (code === 'grabacion' ? RECORDED : code === 'comunicada' ? ANNOUNCED : undefined))?.stage : undefined),
  gaps: [],
};
