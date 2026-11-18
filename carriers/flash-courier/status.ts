import type { Stage } from '../../core/status/index.js';
import { normalizeStatusWording, type CarrierStatusMap } from '../../core/status/statusMap.js';
const labels: readonly (readonly [string, Stage])[] = [["Aguardando Postagem", "registered"], ["Recebemos sua encomenda, em breve seguiremos com a entrega", "accepted"], ["Enviado para unidade entregadora", "in_transit"], ["Encomenda recebida na unidade entregadora, em breve seguiremos com a sua entrega.", "in_transit"], ["Em rota de entrega", "out_for_delivery"], ["Entrega não Efetuada — Motivo: Destinatário Ausente", "failed_attempt"], ["Entrega efetuada com sucesso", "delivered"]];
const stages = new Map(labels.map(([wording, stage]) => [normalizeStatusWording(wording), stage]));
export const flashCourierStage = (wording: string): Stage | undefined => stages.get(normalizeStatusWording(wording));
export const statusMap: CarrierStatusMap = { stage: (_code, wording) => flashCourierStage(wording), gaps: [] };
