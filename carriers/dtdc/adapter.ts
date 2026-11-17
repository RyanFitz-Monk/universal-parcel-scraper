import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { BudgetExceededError, ChallengeError, IndeterminateError, SchemaError, TransportError, UpstreamHttpError } from '../../core/errors/index.js';
import { runSteps, type StepContext } from '../../core/runner/index.js';
import { NOOP_RECORDER, type StepRecorder } from '../../core/telemetry/index.js';
import { decodeText, fetchBounded, parseJsonBytes, userAgentOf } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { DtdcOcr } from './ocr.js';
import { parseDtdcPage } from './page.js';
import { normalizeDtdcNumber, parseDtdc } from './parser.js';

// The current official MyDTDC app's anonymous tracking feed. Its deployed
// assets/configs/prod.json names this host; the Flutter client calls this path.
const ENDPOINT = 'https://ebookingbackend.dtdc.in/trackConsignment';
const ORIGIN = 'https://www.dtdc.com';
const PAGE = `${ORIGIN}/track-your-shipment/`;
const SHIPMENT_PAGE = `${ORIGIN}/trackshipment`;
// The tracking page decrypts its picture with this key, the same for every visitor.
const PICTURE_KEY = 'TlY5pUTfHG1cec/Ei4XNJNQb1tpoTvUx+9lqENUXegY='; // gitleaks:allow
const PICTURES = 3;
type Solver = (bytes: Uint8Array, signal: AbortSignal) => Promise<string>;

/** The picture of `GET generate-captcha`: base64 of its key and AES-GCM picture, the IV first and the tag last. */
async function picture(payload: unknown): Promise<{ key: string; png: Uint8Array }> {
  if (!isRecord(payload) || typeof payload.data !== 'string' || payload.data.length > 100_000) throw new SchemaError('DTDC', 'DTDC changed its picture check');
  let parts: unknown;
  try { parts = JSON.parse(Buffer.from(payload.data, 'base64').toString('utf8')); } catch { parts = null; }
  if (!isRecord(parts) || typeof parts.k !== 'string' || !/^[A-Za-z0-9+/=._:-]{16,512}$/.test(parts.k) || typeof parts.i !== 'string') {
    throw new SchemaError('DTDC', 'DTDC changed its picture check');
  }
  const sealed = Buffer.from(parts.i, 'base64');
  if (sealed.length < 29) throw new SchemaError('DTDC', 'DTDC changed its picture check');
  const key = await crypto.subtle.importKey('raw', Buffer.from(PICTURE_KEY, 'base64'), { name: 'AES-GCM' }, false, ['decrypt']);
  try {
    return { key: parts.k, png: new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.subarray(0, 12) }, key, sealed.subarray(12))) };
  } catch (cause) { throw new SchemaError('DTDC', 'DTDC changed its picture key', { cause }); }
}

export class DtdcTracker {
  private readonly ocr = new DtdcOcr();
  constructor(private readonly options: { fetcher?: typeof fetch; recorder?: StepRecorder; userAgent?: string; solveCaptcha?: Solver } = {}) {}

  /** The tracking page's own lookup: a picture check opens a token for one shipment page. */
  private async website(number: string, { signal, remainingMs }: StepContext) {
    const deadline = performance.now() + remainingMs;
    const left = () => {
      signal.throwIfAborted();
      const remaining = Math.floor(deadline - performance.now());
      if (remaining < 1) throw new BudgetExceededError('DTDC', remainingMs);
      return remaining;
    };
    const request = async (url: string, init: RequestInit, maxBytes: number) => (await fetchBounded(url, { ...init, signal, headers: {
      Origin: ORIGIN, Referer: PAGE, 'User-Agent': userAgentOf(this.options.userAgent), ...init.headers as Record<string, string> },
    }, { provider: 'DTDC', timeoutMs: left(), maxBytes, fetcher: this.options.fetcher })).bytes;
    // A web page in place of the lookup's JSON says nothing about the shipment.
    const reply = (bytes: Uint8Array): unknown => {
      if (/^\s*</.test(decodeText(bytes.subarray(0, 256)))) throw new IndeterminateError('DTDC', 'DTDC answered with a web page in place of its reply');
      return parseJsonBytes(bytes, 'DTDC');
    };
    const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const solve = this.options.solveCaptcha ?? this.ocr.solve.bind(this.ocr);
    let token: string | null = null;
    for (let tries = 0; tries < PICTURES && !token; tries += 1) {
      const challenge = await picture(reply(await request(`${ORIGIN}/wp-json/custom/v1/generate-captcha?t=${Date.now()}`,
        { headers: { Accept: 'application/json' } }, 100_000)));
      const answer = await solve(challenge.png, signal);
      left();
      // A misread picture is followed by a fresh one.
      if (!/^[A-Za-z0-9]{6}$/.test(answer)) continue;
      const checked = reply(await request(`${ORIGIN}/wp-json/custom/v1/captcha/validate`, json({ captchaKey: challenge.key, captchaValue: answer }), 10_000));
      if (!isRecord(checked) || typeof checked.success !== 'boolean') throw new SchemaError('DTDC', 'DTDC changed its picture check');
      if (!checked.success) continue;
      if (typeof checked.token !== 'string' || !/^[A-Za-z0-9._-]{16,1024}$/.test(checked.token)) throw new SchemaError('DTDC', 'DTDC changed its picture check');
      token = checked.token;
    }
    if (!token) throw new ChallengeError('DTDC', 'DTDC rejected the picture answers');
    const opened = reply(await request(`${ORIGIN}/wp-json/custom/v1/tracking/pull-details`,
      { ...json({ trackNumbers: [number] }), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-DTDC-Track-Token': token } }, 1_000_000));
    if (!isRecord(opened) || typeof opened.success !== 'boolean') throw new SchemaError('DTDC', 'DTDC changed its shipment lookup');
    if (!opened.success) throw new IndeterminateError('DTDC', 'DTDC could not open the shipment page');
    // The page reads the shipment out of the sealed payload the lookup hands it.
    if (opened.redirect !== SHIPMENT_PAGE || typeof opened.payload !== 'string' || !/^[A-Za-z0-9_-]{16,500000}$/.test(opened.payload)) {
      throw new SchemaError('DTDC', 'DTDC changed its shipment lookup');
    }
    const page = await request(SHIPMENT_PAGE, { method: 'POST', headers: { Accept: 'text/html', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ d: opened.payload }).toString() }, 2_000_000);
    return parseDtdcPage(decodeText(page), number);
  }

  async fetch(raw: string, context: TrackingContext = {}) {
    const number = normalizeDtdcNumber(raw);
    return runSteps({ carrier: 'dtdc', signal: context.signal, budgetMs: context.budgetMs ?? 30_000,
      recorder: this.options.recorder ?? NOOP_RECORDER }, [{ id: 'direct', run: async ({ signal, remainingMs }) => {
      try {
        // The feed's failure leaves time for the tracking page.
        const { bytes } = await fetchBounded(`${ENDPOINT}?reference_number=${number}`, { signal, headers: { Accept: 'application/json', 'User-Agent': userAgentOf(this.options.userAgent) } }, {
          provider: 'DTDC', timeoutMs: Math.max(1, Math.floor(remainingMs / 3)), maxBytes: 1_000_000, fetcher: this.options.fetcher,
        });
        return parseDtdc(parseJsonBytes(bytes, 'DTDC'), number);
      } catch (error) {
        // The feed answers unavailable references with a generic HTTP 400,
        // which does not prove absence. Endpoint 404s are not parcel absence.
        if (error instanceof UpstreamHttpError && error.status === 400) throw new IndeterminateError('DTDC', 'DTDC could not return shipment details', { cause: error });
        if (error instanceof UpstreamHttpError && [404, 410].includes(error.status)) throw new TransportError('DTDC', 'DTDC tracking endpoint is unavailable', { cause: error });
        throw error;
      }
    } }, { id: 'website', run: step => this.website(number, step) }]);
  }

  close() { return this.ocr.close(); }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new DtdcTracker({ fetcher: environment.fetcher, recorder: environment.recorder, userAgent: environment.userAgent });
  return { id: 'dtdc', recordsSteps: true, steps: ['direct', 'website'], track: (input, context) => tracker.fetch(input.number, context) };
};
