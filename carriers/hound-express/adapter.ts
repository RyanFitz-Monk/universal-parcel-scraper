import { readerLanguage, type AdapterFactory, type TrackingContext } from '../../core/adapter/index.js';
import { TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { HOUND_EXPRESS_MAX_BYTES, HOUND_EXPRESS_URL, normalizeHoundNumber, parseHoundReply, PROVIDER, type HoundLanguage } from './parser.js';

// The partner key the tracking page's script sends for every visitor.
const PARTNER_KEY = 'LLVltP2XxxA%3D_LbVT52BExd%2FGWg8HQ9W6V16axKHokb8qygBjuJ52nyU%3D'; // gitleaks:allow

export class HoundExpressTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}, language: HoundLanguage = 'en'): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeHoundNumber(raw);
    return runSteps({ carrier: 'hound-express', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const { response, bytes } = await fetchBounded(HOUND_EXPRESS_URL, { signal, method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', partnerKey: PARTNER_KEY,
          'User-Agent': userAgentOf(this.options.userAgent) },
        body: JSON.stringify([{ guideNumber: number }]) }, {
        provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(remainingMs)), maxBytes: HOUND_EXPRESS_MAX_BYTES,
        redirect: 'manual', fetcher: this.options.fetcher, allowHttpStatuses: [404, 410],
      }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      // An unknown guide is a reply of its own; a missing address means the service moved.
      if (response.status === 404 || response.status === 410) throw new TransportError(PROVIDER, `Hound Express's tracking service answered HTTP ${response.status}`);
      return parseHoundReply(decodeText(bytes), number, language);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new HoundExpressTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'hound-express', recordsSteps: true, steps: ['direct'],
    track: (input, context) => tracker.fetch(input.number, context, readerLanguage(input, ['es']) ?? 'en') };
};
