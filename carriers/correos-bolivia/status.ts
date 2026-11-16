import { classifyWording, type ClassifiedWording } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

const TRANSIT = new Set([
  'insertar envío en saca (salida)',
  'recibir envío en oficina de cambio (salida)',
  'enviar envío al extranjero (recibido por edi)',
].map(normalizeStatusWording));
export function correosBoliviaStage(wording: string): ClassifiedWording | null {
  if (TRANSIT.has(normalizeStatusWording(wording))) return { stage: 'in_transit', source: 'carrier_map' };
  const classified = classifyWording(wording, 'in_transit');
  return classified.source === 'none' ? null : classified;
}
export const statusMap: CarrierStatusMap = {
  stage: (_code, wording) => TRANSIT.has(normalizeStatusWording(wording)) ? 'in_transit' : undefined, gaps: [],
};
