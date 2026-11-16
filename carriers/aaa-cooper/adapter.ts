import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { IndeterminateError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { firstAttemptMs, networkRetryStep } from '../../core/runner/networkRetry.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { AAA_COOPER_MAX_BYTES, aaaCooperNumber, parseAaaCooper, PROVIDER } from './parser.js';

// The server-rendered results page AAA Cooper's tracking box and older tracking links open.
export const AAA_COOPER_ENDPOINT = 'https://www.aaacooper.com/pwb/Transit/ProTrackResults.aspx';
const REDIRECTS = [301, 302, 303, 307, 308];
// A missing route is not a missing shipment: the page answers unknown numbers with a notice.
const GONE = [404, 410];

export class AaaCooperTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    const { number, pro } = aaaCooperNumber(raw);
    const url = `${AAA_COOPER_ENDPOINT}?${new URLSearchParams({ ProNum: pro })}`;
    const read = async (signal: AbortSignal, timeoutMs: number): Promise<CarrierResult> => {
      const { response, bytes } = await fetchBounded(url, { method: 'GET', signal, headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': userAgentOf(this.options.userAgent),
      } }, { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: AAA_COOPER_MAX_BYTES,
        redirect: 'manual', allowHttpStatuses: [...REDIRECTS, ...GONE], fetcher: this.options.fetcher });
      if (REDIRECTS.includes(response.status)) throw new TransportError(PROVIDER, 'AAA Cooper redirected its tracking lookup');
      if (GONE.includes(response.status)) throw new TransportError(PROVIDER, 'AAA Cooper tracking page is unavailable');
      const html = decodeText(bytes);
      if (!html.trim()) throw new IndeterminateError(PROVIDER, 'AAA Cooper returned an empty page');
      return parseAaaCooper(html, number);
    };
    // A request that fails to reach AAA Cooper, or hangs, gets one more try: the
    // first gets half of the budget, so the retry fits in the rest.
    return runSteps({ carrier: 'aaa-cooper', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [
      { id: 'direct', run: ({ signal, remainingMs }) => read(signal, firstAttemptMs(remainingMs)) },
      networkRetryStep(({ signal, remainingMs }) => read(signal, remainingMs)),
    ]);
  }
}

export const adapter: AdapterFactory = (environment) => {
  const tracker = new AaaCooperTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'aaa-cooper', recordsSteps: true, steps: ['direct', 'retry'], track: (input, context) => tracker.fetch(input.number, context) };
};
