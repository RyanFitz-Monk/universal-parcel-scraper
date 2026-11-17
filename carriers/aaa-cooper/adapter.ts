import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { ChallengeError, IndeterminateError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps, singleFlight, takeTurn } from '../../core/runner/index.js';
import { firstAttemptMs, networkRetryStep } from '../../core/runner/networkRetry.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded } from '../../core/transport/boundedFetch.js';
import { userAgentOf } from '../../core/transport/userAgent.js';
import { sendsThrough } from '../../core/transport/transportOf.js';
import { AAA_COOPER_MAX_BYTES, aaaCooperNumber, parseAaaCooper, PROVIDER } from './parser.js';
import { aaaCooperCanRecover, recoverAaaCooper, type AaaCooperPage } from './recovery.js';

// The server-rendered results page AAA Cooper's tracking box and older tracking links open.
export const AAA_COOPER_ENDPOINT = 'https://www.aaacooper.com/pwb/Transit/ProTrackResults.aspx';
const REDIRECTS = [301, 302, 303, 307, 308];
// A missing route is not a missing shipment: the page answers unknown numbers with a notice.
const GONE = [404, 410];

export class AaaCooperTracker {
  // Direct reads stay independent; only CPU recovery takes a turn on this tracker.
  private readonly captchaTurn = singleFlight();
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const { number, pro } = aaaCooperNumber(raw);
    const url = `${AAA_COOPER_ENDPOINT}?${new URLSearchParams({ ProNum: pro })}`;
    const jar = new CookieJar(), userAgent = userAgentOf(this.options.userAgent);
    const fetcher = sendsThrough(makeFetchCookie(this.options.fetcher ?? fetch, jar), this.options.fetcher);
    const page: AaaCooperPage = { html: '', receivedAt: 0 };
    const read = async (signal: AbortSignal, timeoutMs: number): Promise<CarrierResult> => {
      page.html = '';
      const { response, bytes } = await fetchBounded(url, { method: 'GET', signal, headers: {
        Accept: 'text/html,application/xhtml+xml', 'User-Agent': userAgent,
      } }, { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: AAA_COOPER_MAX_BYTES,
        redirect: 'manual', allowHttpStatuses: [...REDIRECTS, ...GONE], fetcher });
      signal.throwIfAborted();
      if (REDIRECTS.includes(response.status)) throw new TransportError(PROVIDER, 'AAA Cooper redirected its tracking lookup');
      if (GONE.includes(response.status)) throw new TransportError(PROVIDER, 'AAA Cooper tracking page is unavailable');
      if (response.url && response.url !== url) throw new SchemaError(PROVIDER, 'AAA Cooper returned another tracking URL');
      page.html = decodeText(bytes); page.receivedAt = performance.now();
      if (!page.html.trim()) throw new IndeterminateError(PROVIDER, 'AAA Cooper returned an empty page');
      return parseAaaCooper(page.html, number);
    };
    try {
      // Only an idempotent initial read is retried after a connection failure.
      return await runSteps({ carrier: 'aaa-cooper', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
        recorder: this.options.recorder ?? NOOP_RECORDER }, [
        { id: 'direct', run: ({ signal, remainingMs }) => read(signal, firstAttemptMs(remainingMs)) },
        networkRetryStep(({ signal, remainingMs }) => read(signal, remainingMs)),
        { id: 'captcha', recovers: error => error instanceof ChallengeError && aaaCooperCanRecover(page),
          run: ({ signal, remainingMs }) => takeTurn(this.captchaTurn, 'aaa-cooper', { signal, budgetMs: remainingMs }, turn =>
            recoverAaaCooper({ number, url, page, fetcher, userAgent, signal: turn.signal!, remainingMs: turn.budgetMs! })) },
      ]);
    } catch (error) {
      // Preserve an explicit caller cancellation even when fetch wrapped its reason.
      if (context.signal?.aborted && !(context.signal.reason instanceof DOMException && context.signal.reason.name === 'TimeoutError')) throw context.signal.reason;
      throw error;
    } finally { page.html = ''; await jar.removeAllCookies(); }
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new AaaCooperTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'aaa-cooper', recordsSteps: true, steps: ['direct', 'retry', 'captcha'], track: (input, context) => tracker.fetch(input.number, context) };
};
