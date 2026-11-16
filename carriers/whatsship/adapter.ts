import { recognizeFromLookup, type AdapterEnvironment, type AdapterFactory, type TrackingContext } from '../../core/adapter/index.js';
import { isWhatsShipReference } from '../../core/detection/whatsShip.js';
import { ChallengeError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { firstAttemptMs, networkRetryStep } from '../../core/runner/networkRetry.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { normalizeWhatsShipNumber, parseWhatsShip, PROVIDER } from './parser.js';

export function whatsShipApiUrl(raw: string): string {
  return 'https://57track.com/api/tracking?' + new URLSearchParams({ tracking_number: normalizeWhatsShipNumber(raw) }).toString();
}

export class WhatsShipTracker {
  constructor(private readonly environment: AdapterEnvironment) {}

  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeWhatsShipNumber(raw), url = whatsShipApiUrl(number);
    const read = async (signal: AbortSignal, timeoutMs: number): Promise<CarrierResult> => {
      const { response, bytes } = await fetchBounded(url, { signal, headers: {
        Accept: 'application/json', Origin: 'https://www.whatsship.com', Referer: 'https://www.whatsship.com/',
        'User-Agent': userAgentOf(this.environment.userAgent),
      } }, { provider: PROVIDER, fetcher: this.environment.fetcher, timeoutMs: Math.max(1, Math.floor(timeoutMs)),
        maxBytes: 1024 * 1024, redirect: 'manual', allowHttpStatuses: [301, 302, 303, 307, 308, 401, 403, 404, 410, 422] });
      signal.throwIfAborted();
      if (response.status === 401 || response.status === 403) throw new ChallengeError(PROVIDER, 'WhatsShip refused guest tracking');
      if (response.status !== 200 && response.status !== 422) throw new TransportError(PROVIDER, 'WhatsShip tracking is unavailable', { status: response.status });
      const text = decodeText(bytes).replace(/^\uFEFF/, '');
      if (response.headers.get('cf-mitigated') === 'challenge'
        || /_cf_chl_opt|cf-turnstile|<title>\s*(?:Just a moment|Access Denied|Attention Required)|verify (?:that )?you are human/i.test(text.slice(0, 64_000))) {
        throw new ChallengeError(PROVIDER, 'WhatsShip returned browser verification');
      }
      let payload: unknown;
      try { payload = JSON.parse(text) as unknown; } catch { throw new SchemaError(PROVIDER, 'WhatsShip returned a reply that is not JSON'); }
      if (response.status === 422 && (!isRecord(payload) || payload.status !== 422 || 'Item' in payload)) {
        throw new SchemaError(PROVIDER, 'WhatsShip returned an inconsistent error response');
      }
      return parseWhatsShip(payload, number);
    };
    return runSteps({ carrier: 'whatsship', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.environment.recorder }, [
      { id: 'direct', run: ({ signal, remainingMs }) => read(signal, firstAttemptMs(remainingMs)) },
      networkRetryStep(({ signal, remainingMs }) => read(signal, remainingMs)),
    ]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new WhatsShipTracker(environment);
  return { id: 'whatsship', recordsSteps: true, steps: ['direct', 'retry'], track: (input, context) => tracker.fetch(input.number, context),
    recognize: (number, context) => recognizeFromLookup(() => tracker.fetch(number, context), () => isWhatsShipReference(number)),
  };
};
