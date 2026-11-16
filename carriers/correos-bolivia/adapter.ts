import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { ChallengeError, SchemaError, TransportError } from '../../core/errors/index.js';
import { runSteps } from '../../core/runner/index.js';
import { firstAttemptMs, networkRetryStep } from '../../core/runner/networkRetry.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { normalizeCorreosBoliviaNumber, parseCorreosBolivia, PROVIDER } from './parser.js';

export const CORREOS_BOLIVIA_ENDPOINT = 'https://trackingbo.correos.gob.bo/api/public/tracking/eventos';
export class CorreosBoliviaTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}
  async fetch(raw: string, context: TrackingContext = {}) {
    const number = normalizeCorreosBoliviaNumber(raw);
    const url = `${CORREOS_BOLIVIA_ENDPOINT}?${new URLSearchParams({ codigo: number })}`;
    const read = async (signal: AbortSignal, timeoutMs: number) => {
      const { response, bytes } = await fetchBounded(url, { signal, headers: {
        Accept: 'application/json', 'User-Agent': userAgentOf(this.options.userAgent),
      } }, { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: 1_000_000,
        allowHttpStatuses: [404], redirect: 'error', fetcher: this.options.fetcher });
      const text = decodeText(bytes);
      if (/^\s*</.test(text)) {
        if (response.status === 404) throw new TransportError(PROVIDER, 'Correos de Bolivia tracking endpoint is unavailable');
        throw new ChallengeError(PROVIDER, 'Correos de Bolivia returned a verification page');
      }
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw new SchemaError(PROVIDER, 'Correos de Bolivia returned unreadable tracking JSON'); }
      const result = parseCorreosBolivia(payload, number);
      if (response.status !== 200) throw new SchemaError(PROVIDER, 'Correos de Bolivia returned an inconsistent tracking response');
      return result;
    };
    return runSteps({ carrier: 'correos-bolivia', budgetMs: context.budgetMs ?? 25_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [
      { id: 'direct', run: ({ signal, remainingMs }) => read(signal, firstAttemptMs(remainingMs)) },
      networkRetryStep(({ signal, remainingMs }) => read(signal, remainingMs)),
    ]);
  }
}
export const adapter: AdapterFactory = environment => {
  const tracker = new CorreosBoliviaTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'correos-bolivia', recordsSteps: true, steps: ['direct', 'retry'], track: (input, context) => tracker.fetch(input.number, context) };
};
