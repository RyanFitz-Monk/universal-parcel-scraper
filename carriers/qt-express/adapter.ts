import { readerLanguage, type AdapterFactory, type TrackingContext } from '../../core/adapter/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { normalizeQtNumber, parseQtReply, PROVIDER, QT_EXPRESS_MAX_BYTES, qtExpressUrl, type QtLanguage } from './parser.js';

export class QtExpressTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  fetch(raw: string, context: TrackingContext = {}, language: QtLanguage = 'en'): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeQtNumber(raw);
    return runSteps({ carrier: 'qt-express', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const { response, bytes } = await fetchBounded(qtExpressUrl(number), { signal,
        headers: { Accept: 'application/json', 'User-Agent': userAgentOf(this.options.userAgent) } }, {
        provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(remainingMs)), maxBytes: QT_EXPRESS_MAX_BYTES,
        redirect: 'manual', allowHttpStatuses: [404], fetcher: this.options.fetcher,
      }).catch(error => { signal.throwIfAborted(); throw error; });
      signal.throwIfAborted();
      return parseQtReply(response.status, decodeText(bytes), number, language);
    } }]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new QtExpressTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'qt-express', recordsSteps: true, steps: ['direct'],
    track: (input, context) => tracker.fetch(input.number, context, readerLanguage(input, ['hu']) ?? 'en') };
};
