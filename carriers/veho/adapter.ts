import { recognizeFromBrowserLookup, type AdapterEnvironment, type AdapterFactory, type TrackingContext } from '../../core/adapter/index.js';
import { BudgetExceededError, ChallengeError, SchemaError, TransportError, UpstreamHttpError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import type { StepRecord, StepRecorder } from '../../core/telemetry/index.js';
import { browserContextProxy } from '../../core/transport/browserRouteTrial.js';
import { decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { attestInBrowser, type AttestationReply } from './browser.js';
import { API, ATTESTATION, MAX_BYTES, normalizeVehoNumber, ORIGIN, PAGE, parseVeho, PROVIDER, vehoRequest } from './parser.js';

type Route = NonNullable<StepRecord['networkRoute']>;
/** Where an attestation is read: the private browser, or the browser service on its own address or through the fallback proxy. */
type Path = 'private' | 'service' | 'proxy';

/**
 * One lookup's attestation reads: the latest one's path and route, how many, whether the latest
 * step failed before its query, and whether its query returned dated history.
 */
interface ReadRoute { path: Path | null; route: Route | null; reads: number; attesting: boolean; history: boolean }

interface StepArgs { signal: AbortSignal; remainingMs: number }

const TOKEN = /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/;
const ROUTES: Record<Path, Route> = { private: 'residential', service: 'default', proxy: 'residential' };
/**
 * How long a path whose attestation was refused is left alone. The private browser runs on the
 * operator's own address, so it rests longest.
 */
const REFUSAL_REST_MS: Record<Path, number> = { private: 6 * 3_600_000, service: 30 * 60_000, proxy: 30 * 60_000 };
/** The private browser reads at most this often, whatever the outcome. */
const PRIVATE_SPACING_MS = 10 * 60_000;
const QUERY_TIMEOUT_MS = 10_000;

const freshRead = (): ReadRoute => ({ path: null, route: null, reads: 0, attesting: false, history: false });

/**
 * Veho's order service takes a guest attestation its tracker's page obtains in a browser. The
 * attestation lasts an hour and is not bound to a number, so one browser read serves every
 * lookup of that hour over plain HTTP. It stays in memory.
 */
export class VehoTracker {
  private readonly fallbackProxy: string | null;
  private readonly browserEndpoint: string | null;
  private held: { token: string; until: number } | null = null;
  private pending: Promise<void> | null = null;
  private readonly rests = new Map<Path, number>();
  private privateAfter = 0;

  constructor(private readonly environment: AdapterEnvironment, private readonly now: () => number = Date.now) {
    const proxy = environment.env.VEHO_FALLBACK_PROXY_URL?.trim() || null;
    // Checked here, so a mistyped proxy fails at setup with a message that leaves its value out.
    if (proxy) browserContextProxy(proxy);
    this.fallbackProxy = proxy;
    this.browserEndpoint = environment.env.VEHO_BROWSER_WS_ENDPOINT?.trim() || null;
  }

  /** Whether a browser can obtain an attestation. */
  get browses(): boolean { return !!this.browserEndpoint || !!this.environment.trawl; }

  private token(): string | null {
    if (this.held && this.held.until <= this.now()) this.held = null;
    return this.held?.token ?? null;
  }

  /** The recorder, with each browser-service read's route, attempt and dated history on its step. */
  private routed(read: ReadRoute): StepRecorder {
    const recorder = this.environment.recorder;
    return {
      step: record => recorder.step(read.route && ['browser', 'trawl'].includes(record.step) ? { ...record, networkRoute: read.route,
        networkAttempt: read.reads > 1 ? 'retry' : 'initial', historyAvailable: read.history } : record),
      lookup: record => recorder.lookup(record),
    };
  }

  /** Ask the order service with an attestation; a refused one is dropped. */
  private async query(number: string, token: string, signal: AbortSignal | undefined, timeoutMs: number): Promise<CarrierResult> {
    const refused = (): ChallengeError => {
      if (this.held?.token === token) this.held = null;
      return new ChallengeError(PROVIDER, 'Veho refused the guest attestation');
    };
    const { response, bytes } = await fetchBounded(API, { method: 'POST', signal, body: vehoRequest(number),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: token, servicename: 'CWA',
        Origin: ORIGIN, Referer: PAGE, 'User-Agent': userAgentOf(this.environment.userAgent) } },
    { provider: PROVIDER, timeoutMs: Math.max(1, Math.floor(timeoutMs)), maxBytes: MAX_BYTES, fetcher: this.environment.fetcher,
      allowHttpStatuses: [401, 403] });
    signal?.throwIfAborted();
    if (response.status !== 200) throw refused();
    let payload: unknown;
    try { payload = JSON.parse(decodeText(bytes)); } catch { throw new SchemaError(PROVIDER, 'Veho returned invalid JSON'); }
    try { return parseVeho(payload, number); } catch (error) { throw error instanceof ChallengeError ? refused() : error; }
  }

  /** The plain lookup, for as long as an attestation is held. */
  async direct(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    const number = normalizeVehoNumber(raw);
    const token = this.token();
    if (!token) throw new ChallengeError(PROVIDER, "Veho asks for a guest attestation that its tracker's page obtains in a browser");
    return this.query(number, token, context.signal, Math.min(QUERY_TIMEOUT_MS, context.budgetMs ?? QUERY_TIMEOUT_MS));
  }

  /**
   * Open the tracker's page in a browser and keep the attestation it obtains. The page is given no
   * number. Veho attests the address and the browser: a path it refused is left alone for a while.
   */
  private async attest(signal: AbortSignal, timeoutMs: number, path: Path, read: ReadRoute): Promise<string> {
    read.path = path;
    read.route = ROUTES[path];
    if ((this.rests.get(path) ?? 0) > this.now()) throw new ChallengeError(PROVIDER, 'Veho refused this address a guest attestation');
    if (path === 'private' && this.privateAfter > this.now()) {
      throw new ChallengeError(PROVIDER, 'The private browser asked Veho for an attestation moments ago');
    }
    if (timeoutMs < 1) throw new BudgetExceededError(PROVIDER, timeoutMs);
    read.reads += 1;
    if (path === 'private') this.privateAfter = this.now() + PRIVATE_SPACING_MS;
    const response = path === 'private' ? await attestInBrowser(this.browserEndpoint!, signal, timeoutMs)
      : await this.serviceRead(signal, timeoutMs, path === 'proxy' ? this.fallbackProxy : null);
    signal.throwIfAborted();
    if (!response) throw new ChallengeError(PROVIDER, "Veho's page obtained no guest attestation");
    if ([401, 403, 429].includes(response.status)) {
      this.rests.set(path, this.now() + REFUSAL_REST_MS[path]);
      throw new ChallengeError(PROVIDER, 'Veho refused this address a guest attestation');
    }
    if (response.status !== 200) throw new UpstreamHttpError(PROVIDER, response.status);
    if (response.truncated || response.body === null) throw new TransportError(PROVIDER, 'Veho returned an incomplete attestation');
    let reply: unknown;
    try { reply = JSON.parse(response.body); } catch { /* Reported below. */ }
    const { token, ttl } = (reply ?? {}) as { token?: unknown; ttl?: unknown };
    const seconds = typeof ttl === 'string' && /^\d{1,7}s$/.test(ttl) ? Number(ttl.slice(0, -1)) : 0;
    if (typeof token !== 'string' || token.length > 4096 || !TOKEN.test(token) || seconds < 60) {
      throw new SchemaError(PROVIDER, 'Veho returned an invalid attestation');
    }
    this.rests.delete(path);
    // Dropped a little before it ends, so a lookup never starts with one about to lapse.
    this.held = { token, until: this.now() + (seconds - Math.min(300, seconds / 10)) * 1000 };
    return token;
  }

  /** The attestation the browser service captured, if any. */
  private async serviceRead(signal: AbortSignal, timeoutMs: number, proxy: string | null): Promise<AttestationReply | null> {
    const page = await this.environment.trawl!.scrape({ url: PAGE, skipHttp: true, maxTier: 3, maxTimeout: timeoutMs,
      captureResponses: [ATTESTATION], settleTimeout: timeoutMs, ...(proxy ? { proxy } : {}) },
    { provider: PROVIDER, timeoutMs, signal, maxBytes: 200_000, requireSolved: false, captureWindow: 'last' });
    const response = page.capturedResponses.filter(row => row.url === ATTESTATION).at(-1);
    if (!response) return null;
    const incomplete = !!response.error || response.truncated || response.base64Encoded;
    return { status: response.status, body: incomplete ? null : response.body, truncated: incomplete };
  }

  /** One browser read at a time: a lookup waits for the read under way and uses its attestation. */
  private async attested(signal: AbortSignal, deadline: number, path: Path, read: ReadRoute): Promise<string> {
    for (let pending = this.pending; pending && !this.token(); pending = this.pending) {
      let stop!: () => void;
      const aborted = new Promise<void>(resolve => { stop = resolve; signal.addEventListener('abort', stop, { once: true }); });
      try { await Promise.race([pending, aborted]); } finally { signal.removeEventListener('abort', stop); }
      signal.throwIfAborted();
    }
    const held = this.token();
    if (held) return held;
    // The read leaves the query after it two seconds and the service its own two to answer.
    const run = this.attest(signal, Math.min(25_000, Math.floor(deadline - performance.now() - 4000)), path, read);
    const settled = run.then(() => {}, () => {});
    this.pending = settled;
    try { return await run; } finally { if (this.pending === settled) this.pending = null; }
  }

  private async browser(number: string, { signal, remainingMs }: StepArgs, path: Path, read: ReadRoute): Promise<CarrierResult> {
    if (path !== 'private' && !this.environment.trawl) throw new ChallengeError(PROVIDER, 'Veho requires the browser tracking service');
    const deadline = performance.now() + remainingMs;
    read.attesting = true;
    const token = await this.attested(signal, deadline, path, read);
    read.attesting = false;
    const left = deadline - performance.now();
    if (left < 1) throw new BudgetExceededError(PROVIDER, remainingMs);
    read.history = false;
    const result = await this.query(number, token, signal, Math.min(QUERY_TIMEOUT_MS, left));
    read.history = Boolean(result.events?.some(event => event.time));
    return result;
  }

  /**
   * The browser steps. The private browser asks first and leaves the browser service half of the
   * time; any failure to attest there leaves the service its turn. With a fallback proxy, an
   * attestation the service's own address is refused is asked once more through the proxy, and
   * that first read leaves it half of the time.
   */
  browserSteps(number: string, read: ReadRoute = freshRead()) {
    const trawl = !!this.environment.trawl;
    const proxy = trawl && !!this.fallbackProxy;
    return [
      // Only a refusal asks for a new attestation: the order service's other failures are its answer.
      { id: 'browser', enabled: !!this.browserEndpoint, recovers: (error: unknown) => error instanceof ChallengeError,
        run: ({ signal, remainingMs }: StepArgs) => this.browser(number, { signal, remainingMs: trawl ? remainingMs / 2 : remainingMs }, 'private', read) },
      { id: 'trawl', enabled: trawl, recovers: (error: unknown) => error instanceof ChallengeError || (read.path === 'private' && read.attesting),
        run: ({ signal, remainingMs }: StepArgs) => this.browser(number, { signal, remainingMs: proxy ? remainingMs / 2 : remainingMs }, 'service', read) },
      { id: 'trawl', enabled: proxy, recovers: (error: unknown) => error instanceof ChallengeError && read.path === 'service',
        run: (step: StepArgs) => this.browser(number, step, 'proxy', read) },
    ];
  }

  fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    context.signal?.throwIfAborted();
    const number = normalizeVehoNumber(raw);
    const read = freshRead();
    return runSteps({ carrier: 'veho', budgetMs: context.budgetMs ?? 45_000, signal: context.signal, recorder: this.routed(read) }, [
      // Without an attestation the plain lookup can only be refused: with a browser to ask, the lookup starts there.
      { id: 'direct', enabled: !!this.token() || !this.browses,
        run: ({ signal, remainingMs }) => this.direct(number, { signal, budgetMs: Math.min(QUERY_TIMEOUT_MS, remainingMs) }) },
      ...this.browserSteps(number, read),
    ]);
  }
}

export const adapter: AdapterFactory = environment => {
  const tracker = new VehoTracker(environment);
  return { id: 'veho', recordsSteps: true, steps: ['direct', 'browser', 'trawl'], track: (input, context) => tracker.fetch(input.number, context),
    // Without an attestation a plain check can only be refused, so the adapter offers the browser check alone.
    recognizeWithBrowser: (number, context, previous) => {
      if (previous instanceof SchemaError) return Promise.reject(previous);
      if (!tracker.browses) return Promise.reject(new ChallengeError(PROVIDER, 'Veho requires a browser'));
      return recognizeFromBrowserLookup(() => runSteps({ carrier: 'veho', budgetMs: context?.budgetMs ?? 45_000,
        signal: context?.signal, recorder: environment.recorder }, tracker.browserSteps(normalizeVehoNumber(number))));
    } };
};
