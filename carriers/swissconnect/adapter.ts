import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { NotFoundError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { hyphenatedSwissconnectNumber, normalizeSwissconnectNumber, parseSwissconnect, PROVIDER, SWISSCONNECT_ENDPOINT,
  SWISSCONNECT_MAX_BYTES, swissconnectJson } from './parser.js';

export class SwissconnectTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeSwissconnectNumber(raw);
    return runSteps({ carrier: 'swissconnect', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const deadline = performance.now() + remainingMs;
      const ask = async (trackingId: string): Promise<CarrierResult> => {
        const { response, bytes } = await fetchBounded(SWISSCONNECT_ENDPOINT, { method: 'POST', signal,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': userAgentOf(this.options.userAgent) },
          body: JSON.stringify({ trackingId }) }, {
          provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(deadline - performance.now())), maxBytes: SWISSCONNECT_MAX_BYTES,
          redirect: 'manual', allowHttpStatuses: [404], fetcher: this.options.fetcher,
        }).catch(error => { signal.throwIfAborted(); throw error; });
        signal.throwIfAborted();
        // The service answers a missing shipment with HTTP 200; a 404 is a moved service.
        if (response.status !== 200) throw new TransportError(PROVIDER, 'swissconnect tracking service is unavailable', { status: response.status });
        return parseSwissconnect(swissconnectJson(decodeText(bytes)), number);
      };
      try {
        return await ask(number);
      } catch (error) {
        // A number arrives without its hyphen; one the service does not find that way is asked once more as its form writes it.
        const written = error instanceof NotFoundError && !number.includes('-') ? hyphenatedSwissconnectNumber(number) : null;
        if (!written) throw error;
        return ask(written);
      }
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new SwissconnectTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'swissconnect', recordsSteps: true, steps: ['direct'], track: (input, context) => tracker.fetch(input.number, context) };
};
