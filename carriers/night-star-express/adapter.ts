import { readerLanguage, type AdapterFactory, type TrackingContext } from '../../core/adapter/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { NIGHT_STAR_ENDPOINT, NIGHT_STAR_MAX_BYTES, normalizeNightStarNumber, parseNightStarReply, PROVIDER, type NightStarLanguage } from './parser.js';

export class NightStarExpressTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}, language: NightStarLanguage = 'en'): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeNightStarNumber(raw);
    return runSteps({ carrier: 'night-star-express', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      // The page posts each reference with the recipient's postcode when it has one; none is sent here.
      const { response, bytes } = await fetchBounded(NIGHT_STAR_ENDPOINT, { method: 'POST', signal,
        headers: { Accept: 'application/json', 'Accept-Language': language, 'Content-Type': 'application/json',
          'User-Agent': userAgentOf(this.options.userAgent) },
        body: JSON.stringify({ searches: [{ search: number }] }) }, {
        provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(remainingMs)), maxBytes: NIGHT_STAR_MAX_BYTES,
        redirect: 'manual', allowHttpStatuses: [404], fetcher: this.options.fetcher,
      }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      return parseNightStarReply(response.status, decodeText(bytes), number, language);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new NightStarExpressTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'night-star-express', recordsSteps: true, steps: ['direct'],
    track: (input, context) => tracker.fetch(input.number, context, readerLanguage(input, ['de']) ?? 'en') };
};
