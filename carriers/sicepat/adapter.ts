import type { AdapterEnvironment, AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { BudgetExceededError, ChallengeError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { API, normalizeSicepatNumber, PAGE, parseSicepat, PROVIDER, sicepatJson, TOKEN, VERIFICATION } from './parser.js';

const GUEST_CLIENT_ID = "67b98547-6cf7-4f05-9c1b-be597fca892f"; // Shared in the official app's PUBLIC_CLIENT_ID resource. gitleaks:allow

export class SicepatTracker {
  constructor(private readonly environment: AdapterEnvironment) {}

  fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeSicepatNumber(raw);
    return runSteps({ carrier: 'sicepat', budgetMs: context.budgetMs ?? 30_000, signal: context.signal, recorder: this.environment.recorder }, [
      { id: 'trawl', run: async ({ signal, remainingMs }) => {
        if (!this.environment.trawl) throw new ChallengeError(PROVIDER, 'SiCepat requires app guest verification through the browser service');
        const deadline = performance.now() + remainingMs;
        const browserMs = Math.min(20_000, Math.floor(remainingMs - 4000));
        if (browserMs < 1000) throw new BudgetExceededError(PROVIDER, remainingMs);
        const page = await this.environment.trawl.scrape({ url: PAGE, skipHttp: true, maxTier: 3, maxTimeout: browserMs,
          captureResponses: [VERIFICATION] }, { provider: PROVIDER, timeoutMs: browserMs, signal, maxBytes: 32_768 });
        signal.throwIfAborted();
        let verification: unknown;
        try { verification = JSON.parse(page.html) as unknown; } catch { /* A service without the helper returned the website instead. */ }
        if (!isRecord(verification) || verification.kind !== 'sicepat-app-verification' || verification.version !== 1
          || verification.origin !== PAGE || verification.action !== 'checkAwb' || typeof verification.token !== 'string' || !TOKEN.test(verification.token)) {
          throw new ChallengeError(PROVIDER, 'The browser service returned no fresh SiCepat app verification');
        }
        const left = Math.floor(deadline - performance.now());
        if (left < 1) throw new BudgetExceededError(PROVIDER, remainingMs);
        const { response, bytes } = await fetchBounded(API + number, { signal, headers: { Accept: 'application/json', 'Accept-Language': 'id',
          auth: GUEST_CLIENT_ID, 'x-api-key': GUEST_CLIENT_ID, 'x-recaptcha': verification.token, 'User-Agent': userAgentOf(this.environment.userAgent) } },
        { provider: PROVIDER, fetcher: this.environment.fetcher, timeoutMs: Math.min(10_000, left), maxBytes: 1_000_000,
          redirect: 'manual', allowHttpStatuses: [301, 302, 303, 307, 308, 400, 401, 403, 404, 410] }).catch(error => { signal.throwIfAborted(); throw error; });
        signal.throwIfAborted();
        if ([401, 403].includes(response.status)) throw new ChallengeError(PROVIDER, 'SiCepat refused its guest request');
        if (![200, 400].includes(response.status)) throw new TransportError(PROVIDER, 'SiCepat app endpoint is unavailable', { status: response.status });
        const payload = sicepatJson(decodeText(bytes));
        if (response.status === 400 && isRecord(payload) && payload.statusCode !== 400) throw new SchemaError(PROVIDER, 'SiCepat returned inconsistent HTTP status');
        return parseSicepat(payload, number);
      } },
    ]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new SicepatTracker(environment);
  return { id: 'sicepat', recordsSteps: true, steps: ['trawl'], track: (input, context) => tracker.fetch(input.number, context) };
};
