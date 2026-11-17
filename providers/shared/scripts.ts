import { ONE_BATCH_SCRIPTS } from '../../carriers/gzyl/script.js';
import { carrierIdFromName } from '../../core/catalog/hints.js';
import { NoHistoryError } from '../../core/errors/index.js';
import { withoutEvents } from '../../core/result/due.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';

/**
 * A provider's answer without its copies of a script (`ONE_BATCH_SCRIPTS`): every row it relays from
 * a carrier that writes a record's whole feed at once but the order's registration, as the carrier's
 * own answer holds them back. The copies carry no write times, so the carrier's own test cannot be
 * run on them: without it, a copy of the script's delivery row would read as a delivery. The carrier
 * is the one a row names (`reporting_carrier`), else the parcel's (`discovered_carrier`) when the
 * provider names no other. An answer with nothing else relays only the script.
 */
export function withoutScriptCopies(result: CarrierResult, source: string): CarrierResult {
  const named = Array.isArray(result.reported_carriers) ? result.reported_carriers : [];
  const parcel = typeof result.discovered_carrier === 'string' && named.length <= 1 ? result.discovered_carrier : null;
  const scripted = (event: CarrierEvent) => {
    const carrier = typeof event.reporting_carrier === 'string' ? carrierIdFromName(event.reporting_carrier) ?? null : parcel;
    return carrier !== null && ONE_BATCH_SCRIPTS.has(carrier) && event.stage !== 'registered';
  };
  const kept = withoutEvents(result, scripted);
  if (!kept) throw new NoHistoryError(source, `${source} relays only a timeline written ahead`, { reason: 'written_ahead' });
  return kept;
}
