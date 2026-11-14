import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { ChallengeError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { normalizeTciFreightNumber, parseTciFreight, PROVIDER, TCI_FREIGHT_ENDPOINT, tciFreightJson } from './parser.js';

export class TciFreightTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeTciFreightNumber(raw);
    return runSteps({ carrier: 'tci-freight', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const { response, bytes } = await fetchBounded(TCI_FREIGHT_ENDPOINT, { method: 'POST', signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer null',
          Origin: 'https://aerp.tcifreight.in', Referer: 'https://aerp.tcifreight.in/TLOG/WebApp/TLOG_R/TLOGApp/',
          'User-Agent': userAgentOf(this.options.userAgent) },
        body: JSON.stringify({ CnsNo: number, DivisionCode: '1' }),
      }, { provider: PROVIDER, fetcher: this.options.fetcher, timeoutMs: remainingMs, maxBytes: 1024 * 1024,
        redirect: 'manual', allowHttpStatuses: [301, 302, 303, 307, 308, 401, 403, 404, 410] }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      if ([401, 403].includes(response.status)) throw new ChallengeError(PROVIDER, 'TCI Freight refused its guest request');
      if (response.status !== 200) throw new TransportError(PROVIDER, 'TCI Freight tracking endpoint is unavailable', { status: response.status });
      return parseTciFreight(tciFreightJson(decodeText(bytes)), number);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new TciFreightTracker({ fetcher: environment.fetcher, userAgent: environment.userAgent, recorder: environment.recorder });
  return { id: 'tci-freight', recordsSteps: true, steps: ['direct'], track: (input, context) => tracker.fetch(input.number, context) };
};
