import { ChallengeError, TransportError, UpstreamHttpError } from '../../core/errors/index.js';
import { remoteChromeUserAgent, withRemoteBrowser } from '../../core/transport/localBrowser.js';
import { pageHttpError } from '../../core/transport/trawl.js';
import { PAGE, PROVIDER } from './parser.js';

/** The answer to the page's attestation exchange; the adapter checks the token. */
export interface AttestationReply { status: number; body: string | null; truncated: boolean; retryAfter?: string }

const HOST = 'https://content-firebaseappcheck.googleapis.com';
const EXCHANGE = /^\/v1\/projects\/veho-consumer-mobile\/apps\/[^/]{1,120}:exchangeRecaptchaEnterpriseToken$/;
const MAX_BODY = 16_384;

/**
 * Open Veho's tracker, given no number, in a private Chrome and read the guest attestation its page
 * obtains. The page serves headless Chrome a stub, so the context names the browser as Chrome. No
 * exchange before the deadline is a challenge.
 */
export function attestInBrowser(endpoint: string, signal: AbortSignal, timeoutMs: number): Promise<AttestationReply> {
  return withRemoteBrowser({ provider: PROVIDER, endpoint, signal, timeoutMs }, async ({ browser, signal: stopped, remainingMs }) => {
    const userAgent = await remoteChromeUserAgent(browser, PROVIDER);
    const context = await browser.newContext({ userAgent, serviceWorkers: 'block', acceptDownloads: false });
    stopped.throwIfAborted();
    const page = await context.newPage();
    // Observed before navigation; the page's first answer stands.
    const exchange = page.waitForResponse(response => {
      let url: URL;
      try { url = new URL(response.url()); } catch { return false; }
      return url.origin === HOST && !url.username && !url.password && EXCHANGE.test(url.pathname) && response.request().method() === 'POST';
    }, { timeout: Math.max(1, remainingMs() - 500) });
    void exchange.catch(() => {});
    const navigation = await page.goto(PAGE, { waitUntil: 'domcontentloaded', timeout: Math.max(1, remainingMs() - 500) });
    if (!navigation) throw new TransportError(PROVIDER, "Veho's tracker page is unavailable");
    if (navigation.status() === 429) throw pageHttpError(PROVIDER, 429, navigation.headers());
    if ([401, 403].includes(navigation.status())) throw new ChallengeError(PROVIDER, "Veho refused its tracker's page");
    if (navigation.status() !== 200) throw new UpstreamHttpError(PROVIDER, navigation.status());
    const response = await exchange.catch(() => {
      stopped.throwIfAborted();
      throw new ChallengeError(PROVIDER, "Veho's page obtained no guest attestation");
    });
    const reply: AttestationReply = { status: response.status(), retryAfter: response.headers()['retry-after'], body: null, truncated: false };
    if (reply.status !== 200) return reply;
    if (Number(response.headers()['content-length']) > MAX_BODY) return { ...reply, truncated: true };
    const body = await response.body();
    stopped.throwIfAborted();
    return body.length > MAX_BODY ? { ...reply, truncated: true } : { ...reply, body: body.toString('utf8') };
  });
}
