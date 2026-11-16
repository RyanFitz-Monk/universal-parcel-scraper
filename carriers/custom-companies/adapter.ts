import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { IndeterminateError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { firstAttemptMs, networkRetryStep } from '../../core/runner/networkRetry.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { CUSTOM_COMPANIES_MAX_BYTES, normalizeCustomCompaniesNumber, parseCustomCompanies, PROVIDER } from './parser.js';

/** The FACTS shipment details page Carrier Logistics runs for The Custom Companies. */
export const CUSTOM_COMPANIES_DETAILS = 'https://api.customco.com/scripts/cgiip.exe/boldetail.htm';
const REDIRECTS = [301, 302, 303, 307, 308];
// A missing route is not a missing shipment: the page answers an unknown number with a notice.
const GONE = [404, 410];

/** The details page for one whole shipment number, looked up as a pro number and nothing else. */
export function customCompaniesLookupUrl(number: string): string {
  const query = new URLSearchParams({ wbtn: 'PRO', wpro1: normalizeCustomCompaniesNumber(number), seskey: '', nav: 'top', language: '' });
  return `${CUSTOM_COMPANIES_DETAILS}?${query.toString()}`;
}

export class CustomCompaniesTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string } = {}) {}

  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    const number = normalizeCustomCompaniesNumber(raw);
    const read = async (signal: AbortSignal, timeoutMs: number): Promise<CarrierResult> => {
      const { response, bytes } = await fetchBounded(customCompaniesLookupUrl(number), { method: 'GET', signal, headers: {
        Accept: 'text/html', 'User-Agent': userAgentOf(this.options.userAgent),
      } }, { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: CUSTOM_COMPANIES_MAX_BYTES, redirect: 'manual',
        fetcher: this.options.fetcher, allowHttpStatuses: [...REDIRECTS, ...GONE] });
      if (REDIRECTS.includes(response.status)) throw new TransportError(PROVIDER, 'The Custom Companies redirected its details page');
      if (GONE.includes(response.status)) throw new TransportError(PROVIDER, 'The Custom Companies details page is unavailable');
      const html = decodeText(bytes);
      if (!html.trim()) throw new IndeterminateError(PROVIDER, 'The Custom Companies returned an empty page');
      return parseCustomCompanies(html, number);
    };
    // A lookup that fails to reach the host, or hangs, is sent once more: the first gets half
    // of the budget, so the retry fits in the rest.
    return runSteps({ carrier: 'custom-companies', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [
      { id: 'direct', run: ({ signal, remainingMs }) => read(signal, firstAttemptMs(remainingMs)) },
      networkRetryStep(({ signal, remainingMs }) => read(signal, remainingMs)),
    ]);
  }
}

export const adapter: AdapterFactory = (environment) => {
  const tracker = new CustomCompaniesTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return {
    id: 'custom-companies', recordsSteps: true, steps: ['direct', 'retry'],
    track: (input, context) => tracker.fetch(input.number, context),
  };
};
