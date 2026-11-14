import type { Stage } from '../../core/status/index.js';
import type { CarrierStatusMap } from '../../core/status/statusMap.js';

export function aneStage(code: string): Stage | undefined {
  if (code === 'GOT') return 'accepted';
  if (['DEPARTURE_S', 'UNLOAD_IN', 'UNLOAD_OUT', 'DEPARTURE_C'].includes(code)) return 'in_transit';
  return undefined;
}

export const statusMap: CarrierStatusMap = { stage: code => code ? aneStage(code) : undefined, gaps: [] };
