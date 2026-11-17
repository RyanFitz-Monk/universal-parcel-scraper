import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { ChallengeError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { firstAttemptMs, networkRetryStep } from '../../core/runner/networkRetry.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded } from '../../core/transport/boundedFetch.js';
import { userAgentOf } from '../../core/transport/userAgent.js';
import { FTD_NZ_ENTRY, FTD_NZ_MAX_BYTES, PROVIDER, normalizeFtdNzNumber, parseFtdNz } from './parser.js';

export class FtdNzTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; userAgent?: string; recorder?: StepRecorder } = {}) {}
  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeFtdNzNumber(raw), url = FTD_NZ_ENTRY + '?' + new URLSearchParams({ code: number }).toString();
    const read = async (signal: AbortSignal, timeoutMs: number): Promise<CarrierResult> => {
      const { response, bytes } = await fetchBounded(url, { signal,
        headers: { Accept: 'text/html', 'User-Agent': userAgentOf(this.options.userAgent), Referer: FTD_NZ_ENTRY } },
      { provider: PROVIDER, fetcher: this.options.fetcher, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: FTD_NZ_MAX_BYTES,
        redirect: 'manual', allowHttpStatuses: [301, 302, 303, 307, 308, 401, 403, 404, 410] });
      signal.throwIfAborted();
      if (response.status === 401 || response.status === 403 || response.headers.get('cf-mitigated') === 'challenge') throw new ChallengeError(PROVIDER, 'FTD New Zealand refused public tracking');
      if (response.status !== 200) throw new TransportError(PROVIDER, 'FTD New Zealand tracking is unavailable', { status: response.status });
      return parseFtdNz(decodeText(bytes), number);
    };
    return runSteps({ carrier: 'ftd-nz', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [
      { id: 'direct', run: ({ signal, remainingMs }) => read(signal, firstAttemptMs(remainingMs)) },
      networkRetryStep(({ signal, remainingMs }) => read(signal, remainingMs)),
    ]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new FtdNzTracker({ fetcher: environment.fetcher, userAgent: environment.userAgent, recorder: environment.recorder });
  return { id: 'ftd-nz', recordsSteps: true, steps: ['direct', 'retry'], track: (input, context) => tracker.fetch(input.number, context) };
};
