import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { ChallengeError, IndeterminateError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { firstAttemptMs, networkRetryStep } from '../../core/runner/networkRetry.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { parseTForce, PROVIDER, TFORCE_MAX_BYTES, tforceNumber } from './parser.js';

/** TForce Final Mile's public tracker. */
export const TFORCE_TRACK = 'https://direct.tfesg.com/finalmiletrack/Track';
const REDIRECTS = [301, 302, 303, 307, 308];
// A missing route is not a missing package: the tracker answers an unknown number with a notice.
const GONE = [404, 410];

/** The tracker's page for one whole number, as its form submits it. */
export function tforceLookupUrl(number: string): string {
  return `${TFORCE_TRACK}?${new URLSearchParams({ trackingNumber: tforceNumber(number), brand: '0' }).toString()}`;
}

export class TForceTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string; now?: () => Date } = {}) {}

  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    const number = tforceNumber(raw);
    const read = async (signal: AbortSignal, timeoutMs: number): Promise<CarrierResult> => {
      // The tracker fails with HTTP 500 on a request without a language.
      const { response, bytes } = await fetchBounded(tforceLookupUrl(number), { method: 'GET', signal, headers: {
        Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9', 'User-Agent': userAgentOf(this.options.userAgent),
      } }, { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: TFORCE_MAX_BYTES, redirect: 'manual',
        fetcher: this.options.fetcher, allowHttpStatuses: [403, ...REDIRECTS, ...GONE] });
      // The tracker's firewall refuses whole countries with its own page.
      if (response.status === 403) {
        throw new ChallengeError(PROVIDER, response.headers.get('x-sucuri-block')?.startsWith('GEO')
          ? 'TForce Logistics refuses this network’s country' : 'TForce Logistics answered with a block page');
      }
      if (REDIRECTS.includes(response.status)) throw new TransportError(PROVIDER, 'TForce Logistics redirected its tracker');
      if (GONE.includes(response.status)) throw new TransportError(PROVIDER, 'TForce Logistics tracker is unavailable');
      const html = decodeText(bytes);
      if (!html.trim()) throw new IndeterminateError(PROVIDER, 'TForce Logistics returned an empty page');
      return parseTForce(html, number, this.options.now?.() ?? new Date());
    };
    // A lookup that fails to reach the tracker, or hangs, is sent once more: the first gets half
    // of the budget, so the retry fits in the rest.
    return runSteps({ carrier: 'tforce-logistics', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [
      { id: 'direct', run: ({ signal, remainingMs }) => read(signal, firstAttemptMs(remainingMs)) },
      networkRetryStep(({ signal, remainingMs }) => read(signal, remainingMs)),
    ]);
  }
}

export const adapter: AdapterFactory = (environment) => {
  const tracker = new TForceTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return {
    id: 'tforce-logistics', recordsSteps: true, steps: ['direct', 'retry'],
    track: (input, context) => tracker.fetch(input.number, context),
  };
};
