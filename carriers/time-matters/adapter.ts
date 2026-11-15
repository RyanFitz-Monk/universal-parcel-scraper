import { readerLanguage, type AdapterFactory, type TrackingContext } from '../../core/adapter/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { normalizeTimeMattersNumber, parseTimeMattersReply, PROVIDER, TIME_MATTERS_MAX_BYTES, timeMattersUrl, type TimeMattersLanguage } from './parser.js';

export class TimeMattersTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}, language: TimeMattersLanguage = 'en'): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeTimeMattersNumber(raw);
    return runSteps({ carrier: 'time-matters', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const { response, bytes } = await fetchBounded(timeMattersUrl(number), { signal,
        headers: { Accept: 'application/json', 'User-Agent': userAgentOf(this.options.userAgent) } }, {
        provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(remainingMs)), maxBytes: TIME_MATTERS_MAX_BYTES,
        redirect: 'manual', allowHttpStatuses: [404], fetcher: this.options.fetcher,
      }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      return parseTimeMattersReply(response.status, decodeText(bytes), number, language);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new TimeMattersTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'time-matters', recordsSteps: true, steps: ['direct'],
    track: (input, context) => tracker.fetch(input.number, context, readerLanguage(input, ['de', 'fr']) ?? 'en') };
};
