import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { ChallengeError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { ANE_ENDPOINT, aneJson, normalizeAneNumber, parseAne, PROVIDER } from './parser.js';

export class AneLogisticsTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeAneNumber(raw);
    return runSteps({ carrier: 'ane-logistics', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const { response, bytes } = await fetchBounded(ANE_ENDPOINT, { method: 'POST', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          Referer: 'https://www.ane56.com/self-detail.html', 'X-Requested-With': 'XMLHttpRequest', 'User-Agent': userAgentOf(this.options.userAgent) },
        body: new URLSearchParams({ billNo: number }).toString(),
      }, { provider: PROVIDER, fetcher: this.options.fetcher, timeoutMs: remainingMs, maxBytes: 2_000_000,
        redirect: 'manual', allowHttpStatuses: [301, 302, 303, 307, 308, 401, 403, 404, 410] }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      if ([401, 403].includes(response.status)) throw new ChallengeError(PROVIDER, 'ANE Logistics refused its guest request');
      if (response.status !== 200) throw new TransportError(PROVIDER, 'ANE Logistics tracking endpoint is unavailable', { status: response.status });
      return parseAne(aneJson(decodeText(bytes)), number);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new AneLogisticsTracker({ fetcher: environment.fetcher, userAgent: environment.userAgent, recorder: environment.recorder });
  return { id: 'ane-logistics', recordsSteps: true, steps: ['direct'], track: (input, context) => tracker.fetch(input.number, context) };
};
