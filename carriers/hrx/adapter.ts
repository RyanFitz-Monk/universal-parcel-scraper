import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { HRX_ENDPOINT, HRX_MAX_BYTES, normalizeHrxNumber, parseHrxReply, PROVIDER } from './parser.js';

export class HrxTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeHrxNumber(raw);
    return runSteps({ carrier: 'hrx', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const { response, bytes } = await fetchBounded(`${HRX_ENDPOINT}${encodeURIComponent(number)}`, { signal,
        headers: { Accept: 'application/json', 'User-Agent': userAgentOf(this.options.userAgent) } }, {
        provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(remainingMs)), maxBytes: HRX_MAX_BYTES,
        redirect: 'manual', allowHttpStatuses: [404], fetcher: this.options.fetcher,
      }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      return parseHrxReply(response.status, decodeText(bytes), number);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new HrxTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'hrx', recordsSteps: true, steps: ['direct'], track: (input, context) => tracker.fetch(input.number, context) };
};
