import type { ClassifiedWording, Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';

const WORDINGS: ReadonlyMap<string, Stage> = new Map(([
  ['OBJETO CRIADO', 'registered'],
  ['ETIQUETA EMITIDA', 'registered'],
  ['OBJETO POSTADO', 'accepted'],
  ['OBJETO EM TRANSFERÊNCIA', 'in_transit'],
  ['OBJETO SAIU PARA ENTREGA AO DESTINATÁRIO', 'out_for_delivery'],
  ['OBJETO ENTREGUE AO DESTINATÁRIO', 'delivered'],
] as const).map(([wording, stage]) => [normalizeStatusWording(wording), stage]));

export function onlogExpressMappedStage(wording: string): Stage | undefined {
  return WORDINGS.get(normalizeStatusWording(wording));
}

/** Unknown native wording stays visible without a guessed stage. */
export function onlogExpressStage(wording: string): ClassifiedWording | null {
  const stage = onlogExpressMappedStage(wording);
  return stage ? { stage, source: 'carrier_map' } : null;
}

export const statusMap: CarrierStatusMap = {
  stage: (code, wording) => code ? undefined : onlogExpressMappedStage(wording),
  gaps: [],
  wholeWording: true,
};
