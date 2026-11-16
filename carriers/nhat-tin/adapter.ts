import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { ChallengeError, SchemaError, TransportError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { NHAT_TIN_API, NHAT_TIN_MAX_BYTES, normalizeNhatTinNumber, parseNhatTin, PROVIDER } from './parser.js';

export { NHAT_TIN_API } from './parser.js';
const ZONE = 'Asia/Ho_Chi_Minh';
// The constant the tracking page's script puts before the day in its lookup key.
const KEY_PREFIX = 'NTL@!#'; // gitleaks:allow
// The service takes only the key of its own day. Near midnight the host's
// clock and the service's can read different days.
const MIDNIGHT_MARGIN_MINUTES = 10;
const REDIRECTS = [301, 302, 303, 307, 308];
// Bot checks a CDN or firewall could put in place of the reply.
const CHALLENGE = /_cf_chl_opt|cf-turnstile|challenge-platform|<title>\s*(?:Just a moment|Attention Required|Access denied)/i;

/** The page's `Authorization` value for a day: the MD5 of its constant and the day, as DD-MM-YYYY. */
export function nhatTinLookupKey(day: DateTime): string {
  return createHash('md5').update(`${KEY_PREFIX}${day.toFormat('dd-MM-yyyy')}`).digest('hex');
}

/**
 * The days whose key the lookup may send, in order: the day in Vietnam, where
 * the page runs, then the day on the other side of a midnight a few minutes away.
 */
export function nhatTinKeyDays(now: number): DateTime[] {
  const local = DateTime.fromMillis(now, { zone: ZONE });
  const minutes = local.hour * 60 + local.minute;
  if (minutes < MIDNIGHT_MARGIN_MINUTES) return [local, local.minus({ days: 1 })];
  if (minutes >= 24 * 60 - MIDNIGHT_MARGIN_MINUTES) return [local, local.plus({ days: 1 })];
  return [local];
}

function json(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (cause) {
    if (CHALLENGE.test(body.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'Nhat Tin Logistics answered with a browser check', { cause });
    throw new SchemaError(PROVIDER, 'Nhat Tin Logistics returned a reply that is not JSON', { cause });
  }
}

/** The service's refusal of a key: `{"success":false,"message":"Auth Token không đúng"}`. */
function refusedKey(body: string): boolean {
  try {
    const reply: unknown = JSON.parse(body);
    return isRecord(reply) && reply.success === false && typeof reply.message === 'string' && /auth token/i.test(reply.message);
  } catch {
    return false;
  }
}

export class NhatTinTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string; now?: () => number } = {}) {}

  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    const number = normalizeNhatTinNumber(raw);
    const url = `${NHAT_TIN_API}?${new URLSearchParams({ q: number })}`;
    return runSteps({ carrier: 'nhat-tin', budgetMs: context.budgetMs ?? 15_000, signal: context.signal,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      const started = performance.now();
      const days = nhatTinKeyDays((this.options.now ?? Date.now)());
      for (const [index, day] of days.entries()) {
        const { response, bytes } = await fetchBounded(url, { method: 'GET', signal, headers: {
          Accept: 'application/json, text/plain, */*', Authorization: nhatTinLookupKey(day), 'User-Agent': userAgentOf(this.options.userAgent),
        } }, { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(remainingMs - (performance.now() - started))),
          maxBytes: NHAT_TIN_MAX_BYTES, redirect: 'manual', fetcher: this.options.fetcher,
          allowHttpStatuses: [...REDIRECTS, 401, 403, 404, 410] });
        const body = decodeText(bytes);
        if (response.status === 401 || response.status === 403) {
          const refused = refusedKey(body);
          if (refused && index < days.length - 1) continue;
          throw new ChallengeError(PROVIDER, refused ? 'Nhat Tin Logistics refused the tracking page’s lookup key'
            : 'Nhat Tin Logistics refused the tracking request', { status: response.status, reason: 'api_denied' });
        }
        // The service answers an unknown number with HTTP 200; a redirect or a 404 is a moved route.
        if (response.status !== 200) throw new TransportError(PROVIDER, 'Nhat Tin Logistics tracking lookup is unavailable', { status: response.status });
        return parseNhatTin(json(body), number);
      }
      throw new ChallengeError(PROVIDER, 'Nhat Tin Logistics refused the tracking page’s lookup key', { status: 403, reason: 'api_denied' });
    } }]);
  }
}

export const adapter: AdapterFactory = (environment) => {
  const tracker = new NhatTinTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'nhat-tin', recordsSteps: true, steps: ['direct'], track: (input, context) => tracker.fetch(input.number, context) };
};
