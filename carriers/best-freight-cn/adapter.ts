import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { BudgetExceededError, ChallengeError, SchemaError, TransportError, UpstreamHttpError, UpstreamNetworkError } from '../../core/errors/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded } from '../../core/transport/boundedFetch.js';
import { userAgentOf } from '../../core/transport/userAgent.js';
import { BestFreightCnOcr } from './ocr.js';
import { BASE, ENTRY, PROVIDER, bestFreightCnEnvelope, normalizeBestFreightCnNumber, parseBestFreightCn } from './parser.js';
import { isRecord } from '../../core/types.js';

type Solver = (bytes: Uint8Array, signal: AbortSignal) => Promise<string>;
export class BestFreightCnTracker {
  private readonly ocr = new BestFreightCnOcr();
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string; solveCaptcha?: Solver } = {}) {}
  async fetch(raw: string, context: TrackingContext = {}) {
    context.signal?.throwIfAborted();
    const number = normalizeBestFreightCnNumber(raw);
    return runSteps({ carrier: 'best-freight-cn', budgetMs: context.budgetMs ?? 25_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const deadline = performance.now() + remainingMs, jar = new CookieJar();
      const get = makeFetchCookie(this.options.fetcher ?? fetch, jar);
      const left = () => { signal.throwIfAborted(); const ms = Math.floor(deadline - performance.now()); if (ms < 1) throw new BudgetExceededError(PROVIDER, remainingMs); return ms; };
      const request = async (path: string, body?: string) => {
        const { response, bytes } = await fetchBounded(BASE + path, { method: 'POST', signal, ...(body === undefined ? {} : { body }),
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', Referer: ENTRY,
            Origin: BASE, 'User-Agent': userAgentOf(this.options.userAgent) } },
        { provider: PROVIDER, fetcher: get, timeoutMs: left(), maxBytes: body === undefined ? 100_000 : 1024 * 1024,
          redirect: 'manual', allowHttpStatuses: [301, 302, 303, 307, 308, 401, 403, 404, 410] });
        left();
        if (response.status === 401 || response.status === 403) throw new ChallengeError(PROVIDER, 'BEST Freight China refused public tracking');
        if (response.status !== 200) throw new TransportError(PROVIDER, 'BEST Freight China is unavailable', { status: response.status });
        const text = decodeText(bytes).replace(/^\uFEFF/, '');
        if (response.headers.get('cf-mitigated') === 'challenge' || /_cf_chl_opt|cf-turnstile|<title>\s*(?:Just a moment|Access Denied|Attention Required)|verify (?:that )?you are human/i.test(text.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'BEST Freight China returned browser verification');
        try { return JSON.parse(text) as unknown; } catch { throw new SchemaError(PROVIDER, 'BEST Freight China returned unreadable JSON'); }
      };
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const payload = bestFreightCnEnvelope(await request('/api/general/imageverifycode'));
          if (!isRecord(payload.data) || typeof payload.data.imageStream !== 'string' || payload.data.imageStream.length > 70_000
            || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload.data.imageStream) || payload.data.imageStream.length % 4 !== 0
            || typeof payload.data.verifyCodeGuid !== 'string' || !/^[\x21-\x7e]{1,256}$/.test(payload.data.verifyCodeGuid)) throw new SchemaError(PROVIDER, 'BEST Freight China returned an invalid text challenge');
          const image = new Uint8Array(Buffer.from(payload.data.imageStream, 'base64'));
          if (!image.length || image.length > 50_000) throw new SchemaError(PROVIDER, 'BEST Freight China returned an invalid challenge image');
          const answer = await (this.options.solveCaptcha ?? this.ocr.solve.bind(this.ocr))(image, signal);
          left();
          if (!/^\d{6}$/.test(answer)) continue;
          const response = await request('/api/billcode/quickly/list', new URLSearchParams({ req: JSON.stringify({ billCodeList: [number], verifyCode: answer, verifyCodeGuid: payload.data.verifyCodeGuid }) }).toString());
          if (isRecord(response) && response.code === 113) continue;
          return parseBestFreightCn(response, number);
        }
        throw new ChallengeError(PROVIDER, 'BEST Freight China text verification did not finish');
      } catch (error) {
        if (error instanceof UpstreamHttpError) throw new UpstreamHttpError(error.provider, error.status, error.retryAfterMs);
        if (error instanceof UpstreamNetworkError) throw new UpstreamNetworkError(error.provider, error.cause);
        throw error;
      } finally { await jar.removeAllCookies(); }
    } }]);
  }
  close() { return this.ocr.close(); }
}
export const adapter: AdapterFactory = environment => {
  const tracker = new BestFreightCnTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'best-freight-cn', recordsSteps: true, steps: ['direct'], track: (input, context) => tracker.fetch(input.number, context), close: () => tracker.close() };
};
