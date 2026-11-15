import { readerLanguage, type AdapterFactory, type TrackingContext } from '../../core/adapter/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import {
  GRUBER_CONFIG_MAX_BYTES, GRUBER_CONFIG_URL, GRUBER_MAX_BYTES, GRUBER_PAGE, normalizeGruberNumber, parseGruberConfig,
  parseGruberReply, PROVIDER,
} from './parser.js';
import type { GruberLanguage } from './status.js';

export class GruberLogisticsTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}, language: GruberLanguage = 'en'): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeGruberNumber(raw);
    const userAgent = userAgentOf(this.options.userAgent);
    return runSteps({ carrier: 'gruber-logistics', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const deadline = Date.now() + remainingMs;
      const left = () => Math.max(1, Math.floor(deadline - Date.now()));
      // The tracking page's settings name its gateway and the key it sends; read them as the page does.
      const settings = await fetchBounded(GRUBER_CONFIG_URL, { signal, headers: { Accept: 'application/json', 'User-Agent': userAgent } }, {
        provider: PROVIDER, timeoutMs: left(), maxBytes: GRUBER_CONFIG_MAX_BYTES, redirect: 'manual', fetcher: this.options.fetcher,
      }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      const gateway = parseGruberConfig(decodeText(settings.bytes));
      const { response, bytes } = await fetchBounded(`${gateway.base}/tracking/v1/tracking/order/${encodeURIComponent(number)}`, { signal,
        headers: { Accept: 'application/json', 'x-apikey': gateway.key, Origin: GRUBER_PAGE, Referer: `${GRUBER_PAGE}/`, 'User-Agent': userAgent } }, {
        provider: PROVIDER, timeoutMs: left(), maxBytes: GRUBER_MAX_BYTES, redirect: 'manual', fetcher: this.options.fetcher,
        allowHttpStatuses: [404, 406, 422],
      }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      return parseGruberReply(response.status, decodeText(bytes), number, language);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new GruberLogisticsTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'gruber-logistics', recordsSteps: true, steps: ['direct'],
    track: (input, context) => tracker.fetch(input.number, context, readerLanguage(input, ['it', 'de']) ?? 'en') };
};
