import { attachTrackingCapture, australiaPostClientKnown } from './tracking-capture.mjs';

/**
 * Through a proxy, whose traffic is paid by the byte, the page loads only the tracking page's
 * document, DataDome's tag, reports and device check, the tracking request, and the application
 * module while this process has not read its key. Images, fonts, styles, analytics, chat and
 * account frames are refused: a full page costs about 4 MB, this one about 0.1 MB.
 */
export function australiaPostProxyAllows(request, pageUrl) {
  let url;
  try { url = new URL(request.url()); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  // DataDome: the tag, its reports and the device check that clears the tracking request.
  if (url.origin === 'https://dd.auspost.com.au' || /^(?:[a-z0-9-]+\.)?captcha-delivery\.com$/.test(url.hostname) && !url.port) return true;
  if (url.origin === 'https://digitalapi.auspost.com.au') return url.pathname === '/shipments-gateway/v1/watchlist/shipments';
  if (url.origin !== 'https://auspost.com.au') return false;
  if (request.resourceType() === 'document') return request.isNavigationRequest() && url.href === pageUrl;
  return request.resourceType() === 'script' && /^\/mypost\/track\/assets\/index-[\w-]+\.js$/.test(url.pathname)
    && !url.search && !australiaPostClientKnown(url.pathname);
}

/** Only the carrier's public detail page and its exact anonymous query opt in. */
export function australiaPostBrowserRequest(rawUrl, capture = {}, { proxied = false } = {}) {
  // Stateful or explicitly awaited proxy reads keep the generic context behavior.
  if (proxied && (capture.cookies?.length || capture.sessionStorage?.size || capture.sessionPage
    || capture.contentWaitForSelector || capture.followMetaRefresh)) return false;
  let url;
  try { url = new URL(rawUrl); } catch { return false; }
  if (url.origin !== 'https://auspost.com.au' || url.username || url.password || url.search || url.hash) return false;
  const number = /^\/mypost\/track\/details\/((?=[A-Z0-9]*\d)[A-Z0-9]{10,34})\/?$/.exec(url.pathname)?.[1];
  const api = `https://digitalapi.auspost.com.au/shipments-gateway/v1/watchlist/shipments?trackingIds=${number}`;
  return Boolean(number && capture.captureResponses?.length === 1 && capture.captureResponses[0] === api);
}

/** A fresh context on the leased browser; an injected context retains its proxy and fingerprint. */
export async function runAustraliaPostBrowser({ url, handle, tier, maxTimeout, capture, installPolicy, openContext, signal,
  locale = process.env.AUSTRALIA_POST_BROWSER_LOCALE || 'de-DE',
  filterProxied = process.env.AUSTRALIA_POST_PROXY_FILTER !== 'off' }) {
  const start = Date.now();
  let context;
  let pageCapture;
  let timer;
  let abort;
  let expired = false;
  const remaining = () => Math.max(1, maxTimeout - (Date.now() - start));
  const close = async target => {
    let finished = false;
    let cleanupTimer;
    try {
      await Promise.race([
        Promise.resolve().then(() => target.close()).then(() => { finished = true; }).catch(() => {}),
        new Promise(resolve => { cleanupTimer = setTimeout(resolve, 1500); }),
      ]);
    } finally {
      clearTimeout(cleanupTimer);
      if (!finished) handle.requestBrowserReplacement?.('Australia Post context cleanup timed out');
    }
  };
  try {
    if (!Number.isFinite(maxTimeout) || maxTimeout <= 0) { expired = true; throw new Error('Australia Post browser budget exhausted'); }
    if (signal?.aborted) { expired = true; signal.throwIfAborted(); }
    return await Promise.race([
      (async () => {
        // Match the verified network locale without changing the shared pool.
        // Carrier event offsets and the API's status vocabulary are independent.
        const created = openContext ? await openContext() : await handle.browser.newContext({ viewport: null, locale });
        if (!openContext) handle.noteTemporaryContext?.();
        if (expired) { await close(created); throw new Error('Australia Post context arrived after its deadline'); }
        context = created;
        const page = await context.newPage();
        await installPolicy(page);
        if (openContext && filterProxied) {
          await page.route('**/*', route => australiaPostProxyAllows(route.request(), url)
            ? route.fallback() : route.abort('blockedbyclient'));
        }
        pageCapture = await attachTrackingCapture(page, url, capture);
        const navigation = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: remaining() });
        await pageCapture.prepare(remaining());
        await pageCapture.settle(remaining());
        const evidence = await pageCapture.drain();
        const html = await page.content();
        return { tier, status: 'success', durationMs: Date.now() - start,
          html, statusCode: navigation?.status() ?? 0, effectiveUrl: page.url(),
          cookies: [], userAgent: await page.evaluate(() => navigator.userAgent), ...evidence };
      })(),
      new Promise((resolve, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error('Australia Post browser budget exhausted')); }, maxTimeout);
      }),
      ...(signal ? [new Promise((_, reject) => {
        abort = () => { expired = true; reject(new Error('Australia Post browser interrupted')); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      })] : []),
    ]);
  } catch {
    return { tier, status: 'error', durationMs: Date.now() - start,
      reason: expired ? 'Australia Post browser budget exhausted' : 'Australia Post browser retrieval failed' };
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener('abort', abort);
    expired = true;
    await pageCapture?.drain().catch(() => {});
    if (context) await close(context);
  }
}
