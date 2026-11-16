import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { IndeterminateError, UpstreamHttpError, UpstreamNetworkError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { fetchBounded, parseJsonBytes, userAgentOf } from '../../core/transport/index.js';
import { GLS_NL_MAX_BYTES, normalizeGlsNlNumber, normalizeGlsNlPostcode, parseGlsNl, PROVIDER } from './parser.js';

/** The request gls-info.nl's tracking page makes for a number and its delivery postcode, in English. */
export const GLS_NL_API = 'https://apm.gls.nl/api/tracktrace/v1';

export function glsNlDetailsUrl(raw: string, rawPostcode: string | null | undefined): string {
  const number = encodeURIComponent(normalizeGlsNlNumber(raw));
  return `${GLS_NL_API}/${number}/postalcode/${encodeURIComponent(normalizeGlsNlPostcode(rawPostcode))}/details/en-GB`;
}

/** The same failure without the request and response details fetchBounded attaches: the address holds the postcode. */
function withoutPostcode(error: unknown): unknown {
  if (error instanceof UpstreamHttpError) return new UpstreamHttpError(error.provider, error.status, error.retryAfterMs);
  if (error instanceof UpstreamNetworkError) return new UpstreamNetworkError(error.provider, error.cause);
  return error;
}

export class GlsNlTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  async fetch(raw: string, rawPostcode: string | null | undefined, context: TrackingContext = {}): Promise<CarrierResult> {
    const number = normalizeGlsNlNumber(raw);
    // Without the postcode GLS shows nothing, so no request is made.
    const url = glsNlDetailsUrl(number, rawPostcode);
    const read = async (signal: AbortSignal, timeoutMs: number): Promise<CarrierResult> => {
      let response: Response;
      let bytes: Uint8Array;
      try {
        ({ response, bytes } = await fetchBounded(url, { method: 'GET', signal, headers: {
          Accept: 'application/json', 'User-Agent': userAgentOf(this.options.userAgent),
        } }, { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: GLS_NL_MAX_BYTES,
          fetcher: this.options.fetcher }));
      } catch (error) {
        throw withoutPostcode(error);
      }
      // A wrong postcode and a parcel GLS no longer holds both get an empty 204.
      if (response.status === 204 || bytes.length === 0) {
        throw new IndeterminateError(PROVIDER, 'GLS Netherlands shows nothing for that number and postcode', { reason: 'portal_not_found' });
      }
      return parseGlsNl(parseJsonBytes(bytes, PROVIDER), number);
    };
    return runSteps({ carrier: 'gls-nl', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [
      { id: 'direct', run: ({ signal, remainingMs }) => read(signal, remainingMs) },
    ]);
  }
}

export const adapter: AdapterFactory = (environment) => {
  const tracker = new GlsNlTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  // Every lookup needs the postcode, and an unknown number and a wrong
  // postcode get the same empty reply, so the adapter cannot recognize a number alone.
  return {
    id: 'gls-nl', recordsSteps: true, steps: ['direct'],
    track: (input, context) => tracker.fetch(input.number, input.postcode, context),
  };
};
