export const PAXEL_PAGE = 'https://paxel.co/id/lacak-pengiriman';
export const PAXEL_MAX_BYTES = 2_000_000;
const MAX_RESPONSES = 12;
const ROUTE = `${PAXEL_PAGE}*`;
const TRACKING_FIELD = 'textarea#awb-text-area[name="shipment_code"]';

/** Opt in only to the carrier's printed identifiers and one exact capture endpoint. */
export function paxelBrowserNumber(raw, capture = {}) {
  try {
    if (typeof raw !== 'string' || [...raw].some(character => character.charCodeAt(0) <= 32 || character === '\u007f')
      || raw.includes('#')) return null;
    const url = new URL(raw);
    const number = url.searchParams.get('awb_req');
    if (url.origin + url.pathname !== PAXEL_PAGE || url.username || url.password || url.hash
      || [...url.searchParams].length !== 1
      || !/^(?:TSPX-\d{11}|EM\.[A-Z0-9]{10}-20\d{6}-\d-[A-Z0-9]{6})(?![\s\S])/.test(number ?? '')
      || !Array.isArray(capture.captureResponses) || capture.captureResponses.length !== 1
      || capture.captureResponses[0] !== PAXEL_PAGE
      || capture.cookies?.length || capture.sessionStorage?.size || capture.sessionPage || capture.sessionContext
      || capture.contentWaitForSelector || capture.followMetaRefresh) return null;
    return number;
  } catch { return null; }
}

/** The native main-frame form, bound to the complete requested shipment code. */
export function boundPaxelRequest(request, number, page) {
  try {
    if (!page || request.url() !== PAXEL_PAGE || request.method() !== 'POST'
      || request.frame() !== page.mainFrame() || request.isNavigationRequest() !== true
      || !/^application\/x-www-form-urlencoded(?:[ \t]*;[^\r\n]*)?(?![\s\S])/i.test(request.headers()['content-type'] ?? '')) return false;
    const body = new URLSearchParams(request.postData() ?? '');
    return body.getAll('shipment_code').length === 1 && body.get('shipment_code') === number
      && body.has('_token');
  } catch { return false; }
}

const internalFailures = new WeakMap();
class PaxelFailure extends Error {
  constructor(category, phase) {
    super('Paxel browser operation failed');
    internalFailures.set(this, { category, phase });
  }
}

// Browser exceptions can contain request URLs, proxy credentials and tokens.
// Only fixed categories leave this function, including for hostile thrown values.
function failureCategory(error) {
  if (internalFailures.has(error)) return internalFailures.get(error).category;
  try {
    const name = typeof error?.name === 'string' ? error.name : '';
    const code = typeof error?.code === 'string' ? error.code : '';
    const message = typeof error?.message === 'string' ? error.message.slice(0, 2048) : '';
    if (name === 'AbortError' || code === 'ABORT_ERR') return 'aborted';
    if (name === 'TimeoutError' || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) return 'timeout';
    if (/Target page, context or browser has been closed|Browser has been closed|browserContext\.newPage: Target closed/.test(message)) return 'context_closed';
    if (/net::ERR_(?:PROXY_CONNECTION_FAILED|TUNNEL_CONNECTION_FAILED)\b/.test(message)) return 'proxy';
    if (['ENOTFOUND', 'EAI_AGAIN'].includes(code) || /net::ERR_NAME_NOT_RESOLVED\b/.test(message)) return 'dns';
    if (['ECONNRESET', 'ECONNREFUSED', 'UND_ERR_SOCKET'].includes(code)
      || /net::ERR_CONNECTION_(?:CLOSED|RESET|REFUSED|TIMED_OUT)\b/.test(message)) return 'connection';
    if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(code)
      || /net::ERR_CERT_(?:AUTHORITY_INVALID|DATE_INVALID|COMMON_NAME_INVALID)\b/.test(message)) return 'tls';
  } catch { /* A thrown value need not be a native Error. */ }
  return 'unknown';
}

/**
 * Use the leased service browser, its fresh-context factory and normal Cloudflare
 * helper. Observe before navigating to the blank form; send at most one bound POST.
 */
export async function runPaxelBrowser({
  url, capture, handle, tier, maxTimeout, signal, installPolicy, createContext, waitCloudflare,
}) {
  const number = paxelBrowserNumber(url, capture);
  if (!number) return undefined;
  signal?.throwIfAborted();

  const start = Date.now();
  const validBudget = Number.isFinite(maxTimeout) && maxTimeout > 0;
  const reserve = validBudget ? Math.min(5000, Math.max(50, Math.floor(maxTimeout / 8))) : 50;
  const deadline = validBudget ? start + maxTimeout - reserve : start;
  const rows = [];
  const allowedRequests = new WeakSet();
  const closedContexts = new WeakMap();
  let context, page, timer, onResponse, onRoute;
  let phase = 'validation';
  let accepting = true;
  let expired = false;
  let posts = 0;
  let boundObserved = false;
  let statusCode = 0;
  let finish, rejectFault, onAbort;
  const terminal = new Promise(resolve => { finish = resolve; });
  const fault = new Promise((_, reject) => { rejectFault = reject; });

  const remaining = () => {
    signal?.throwIfAborted();
    if (expired || !accepting || Date.now() >= deadline) throw new PaxelFailure('budget_exhausted', phase);
    return Math.max(1, deadline - Date.now());
  };
  const result = (status, reason, diagnostic) => ({
    tier, status, durationMs: Date.now() - start, effectiveUrl: url, statusCode,
    // The useful document is the bound POST body, not an unrelated rendered page.
    html: '', body: new Uint8Array(), cookies: [], capturedResponses: rows, reason,
    ...(diagnostic ? { diagnostic } : {}),
  });
  const requestReplacement = () => {
    try { handle?.requestBrowserReplacement?.('Paxel context cleanup failed'); } catch { /* Cleanup must not mask evidence. */ }
  };
  const closeContext = target => {
    if (closedContexts.has(target)) return closedContexts.get(target);
    const closing = (async () => {
      let cleanupTimer;
      let closed = false;
      try {
        await Promise.race([
          Promise.resolve().then(() => target.close()).then(() => { closed = true; }).catch(() => {}),
          new Promise(resolve => { cleanupTimer = setTimeout(resolve, Math.min(1500, reserve)); }),
        ]);
      } finally {
        clearTimeout(cleanupTimer);
        if (!closed) requestReplacement();
      }
    })();
    closedContexts.set(target, closing);
    return closing;
  };
  const failCapture = error => {
    if (accepting) rejectFault(new PaxelFailure(failureCategory(error), 'capture_metadata'));
  };

  const readBody = async (response, row, headers) => {
    let bytes, bodyTimer;
    try {
      const declaredLength = headers['content-length'];
      if (declaredLength !== undefined && /^\d+$/.test(declaredLength)
        && Number(declaredLength) > PAXEL_MAX_BYTES) {
        row.truncated = true;
        return;
      }
      bytes = await Promise.race([
        response.body(),
        new Promise((_, reject) => {
          bodyTimer = setTimeout(() => reject(new PaxelFailure('body_timeout', 'capture_body')), Math.min(3000, remaining()));
        }),
      ]);
      if (!accepting) return;
      if (!(bytes instanceof Uint8Array)) throw new Error('Unexpected body representation');
      if (bytes.byteLength > PAXEL_MAX_BYTES) row.truncated = true;
      else row.body = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch (error) {
      if (accepting) row.error = internalFailures.get(error)?.category === 'body_timeout'
        ? 'body_timeout' : 'body_unreadable';
    } finally {
      clearTimeout(bodyTimer);
      if (bytes instanceof Uint8Array) bytes.fill(0);
      if (accepting) finish();
    }
  };

  const work = async () => {
    if (!validBudget) throw new PaxelFailure('budget_exhausted', phase);
    if (!handle || typeof createContext !== 'function' || typeof installPolicy !== 'function'
      || typeof waitCloudflare !== 'function') throw new PaxelFailure('service_contract', phase);
    remaining();
    phase = 'context_creation';
    const created = await createContext(handle);
    if (!created || typeof created.close !== 'function') throw new PaxelFailure('service_contract', phase);
    if (!accepting || expired || signal?.aborted || Date.now() >= deadline) {
      await closeContext(created);
      remaining();
    }
    context = created;
    remaining();
    phase = 'page_creation';
    page = await context.newPage();
    remaining();
    phase = 'policy_installation';
    await installPolicy(page);
    remaining();

    phase = 'request_guard_installation';
    onRoute = async route => {
      let request;
      try {
        request = route.request();
        if (request.method() === 'POST') {
          if (!accepting || expired || signal?.aborted || Date.now() >= deadline
            || posts !== 0 || !boundPaxelRequest(request, number, page)) {
            await route.abort('blockedbyclient');
            return;
          }
          posts++;
          allowedRequests.add(request);
        }
      } catch (error) {
        try { await route.abort('blockedbyclient'); } catch { /* The context may already be closed. */ }
        if (accepting) rejectFault(new PaxelFailure(failureCategory(error), 'request_binding'));
        return;
      }
      try { await route.fallback(); }
      catch (error) {
        if (accepting) rejectFault(new PaxelFailure(failureCategory(error), 'request_dispatch'));
      }
    };
    await page.route(ROUTE, onRoute);
    remaining();

    phase = 'response_observer_installation';
    onResponse = response => {
      if (!accepting) return;
      try {
        const request = response.request();
        if (request.url() !== PAXEL_PAGE) return;
        const bound = allowedRequests.has(request);
        if (boundObserved || (!bound && (request.method() !== 'GET'
          || request.frame() !== page.mainFrame() || rows.length >= MAX_RESPONSES - 1))) return;
        const headers = response.headers();
        const row = {
          url: PAXEL_PAGE, status: response.status(),
          headers: Object.fromEntries(['content-type', 'retry-after'].filter(key => typeof headers[key] === 'string')
            .map(key => [key, headers[key].slice(0, 100)])),
          body: null, error: null, truncated: false, base64Encoded: false,
          ...(bound ? { trackingNumberSubmitted: number } : {}),
        };
        rows.push(row);
        statusCode = row.status;
        if (bound) {
          boundObserved = true;
          void readBody(response, row, headers);
        }
      } catch (error) { failCapture(error); }
    };
    page.on('response', onResponse);
    remaining();
    phase = 'navigation';
    await page.goto(PAXEL_PAGE, { waitUntil: 'domcontentloaded', timeout: remaining() });
    remaining();
    phase = 'verification';
    const clearance = await waitCloudflare(page, remaining(), PAXEL_PAGE);
    remaining();
    if (clearance !== 'ok') return result('success', 'paxel-verification_unfinished', {
      phase, category: 'verification_unresolved',
    });

    phase = 'form_readiness';
    await page.locator(TRACKING_FIELD).waitFor({ state: 'visible', timeout: remaining() });
    remaining();
    phase = 'form_fill';
    await page.locator(TRACKING_FIELD).fill(number, { timeout: remaining() });
    remaining();
    phase = 'form_submission';
    const submitted = await page.evaluate(expected => {
      const field = document.querySelector('textarea#awb-text-area[name="shipment_code"]');
      const form = field?.form;
      if (!form || field.value !== expected || form.method.toUpperCase() !== 'POST'
        || form.action !== 'https://paxel.co/id/lacak-pengiriman'
        || !form.querySelector('input[type="hidden"][name="_token"]')
        || !form.querySelector('input[type="hidden"][name="auto_open_awb"]')) return false;
      HTMLFormElement.prototype.submit.call(form);
      return true;
    }, number);
    remaining();
    if (submitted !== true) throw new PaxelFailure('form_contract', phase);
    phase = 'capture_wait';
    await terminal;
    remaining();
    return result('success', 'paxel-reply');
  };

  try {
    return await Promise.race([
      work(), fault,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new PaxelFailure('budget_exhausted', phase));
        }, Math.max(1, deadline - Date.now()));
      }),
      ...(signal ? [new Promise((_, reject) => {
        onAbort = () => { expired = true; reject(signal.reason); };
        signal.addEventListener('abort', onAbort, { once: true });
        if (signal.aborted) onAbort();
      })] : []),
    ]);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    const category = expired ? 'budget_exhausted' : failureCategory(error);
    const failedPhase = internalFailures.get(error)?.phase ?? phase;
    return result('error', category === 'budget_exhausted' ? 'Paxel browser budget exhausted'
      : `Paxel browser retrieval failed (phase=${failedPhase}; category=${category})`,
    { phase: failedPhase, category });
  } finally {
    accepting = false;
    expired = true;
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener('abort', onAbort);
    // Closing the context also tears down pending route/page operations. Avoid an
    // unbounded unroute wait while the caller's cleanup reserve is running out.
    try { if (page && onResponse) page.off('response', onResponse); } catch { /* Context may already be gone. */ }
    if (context) await closeContext(context);
  }
}
