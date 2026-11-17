const ORIGIN = 'https://viettelpost.vn';
const PATH = '/viettelpost-iframe/tra-cuu-hanh-trinh-don-hang-v3-recaptcha';
export const VIETTEL_POST_HISTORY_API = 'https://api.viettelpost.vn/api/orders/viewTrackingOrders3';
export const VIETTEL_POST_HISTORY_BYTES = 512000;
const NUMBER = /^(?:\d{9,13}|V\d{11})$/;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);

export function viettelPostBrowserNumber(raw, capture = {}) {
  let url; try { url = new URL(raw); } catch { return null; }
  const fields = [...url.searchParams];
  return url.origin === ORIGIN && url.pathname === PATH && !url.username && !url.password && !url.hash
    && fields.length === 1 && fields[0][0] === 'orders' && NUMBER.test(fields[0][1])
    && capture.captureResponses?.length === 1 && capture.captureResponses[0] === VIETTEL_POST_HISTORY_API ? fields[0][1] : null;
}

export function boundViettelPostRequest(request, number, page) {
  if (request.url() !== VIETTEL_POST_HISTORY_API || request.method() !== 'POST'
    || page && request.frame() !== page.mainFrame()) return false;
  const text = request.postData();
  if (typeof text !== 'string' || text.length > 65536) return false;
  let body; try { body = JSON.parse(text); } catch { return false; }
  const headers = request.headers();
  return record(body) && Object.keys(body).length === 2 && body.orders === number
    && typeof body.captcha === 'string' && body.captcha.length >= 40 && body.captcha.length <= 16384
    && !headers.authorization && !headers.token && !headers['vtp-access-token']
    && typeof headers['x-token'] === 'string' && headers['x-token'].length <= 8192
    && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(headers['x-token']);
}

/** Keep identity, native scan clocks and wording, without contacts, addresses, keys or free-form recipient prose. */
export function projectViettelPostHistory(payload) {
  if (!record(payload)) return 'null';
  const scalar = value => value === null || ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
  const pick = (row, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(row, key)).map(key => [key, scalar(row[key])]));
  const list = (value, limit, project) => value === null ? null : Array.isArray(value)
    ? value.length <= limit ? value.map(row => record(row) ? project(row) : null) : null : undefined;
  const data = list(payload.data, 10, row => ({ ...pick(row, ['MAVANDON', 'SHOW_ORDER', 'DICH_VU']),
    TRACKING_ORDERS: list(row.TRACKING_ORDERS, 30, group => ({
      TRACKINGS: list(group.TRACKINGS, 500, scan => pick(scan,
        ['MAVANDON', 'THOI_GIAN', 'STATUS_NAME', 'GHI_CHU', 'TRANG_THAI', 'TINH', 'TEN_BUUCUC_DI'])),
    })),
  }));
  return JSON.stringify({ ...pick(payload, ['status', 'error']),
    ...(typeof payload.message === 'string' && /captcha/i.test(payload.message) ? { message: 'captcha verification rejected' } : {}), data });
}

/** A cooldown forbids audio; a single ordinary checkbox can still pass without an answer. */
export async function viettelPostCheckboxOnly(page, timeoutMs, signal) {
  signal?.throwIfAborted();
  const anchor = page.frameLocator('iframe[src*="recaptcha"][src*="anchor"]').first().locator('#recaptcha-anchor');
  await anchor.click({ timeout: Math.max(1, Math.min(8000, timeoutMs)) });
  signal?.throwIfAborted();
  return await page.frameLocator('iframe[src*="recaptcha"][src*="anchor"]').first()
    .locator('#recaptcha-anchor[aria-checked="true"]').waitFor({ state: 'visible', timeout: Math.max(1, Math.min(3000, timeoutMs)) })
    .then(() => true).catch(() => false);
}

export async function runViettelPostBrowser({ url, capture, handle, tier, maxTimeout, signal, installPolicy,
  openContext, proxy, solveCaptcha, audioAllowed }) {
  const number = viettelPostBrowserNumber(url, capture);
  if (!number) return undefined;
  signal?.throwIfAborted();
  const start = Date.now(), reserve = Math.min(2000, Math.max(25, Math.floor(maxTimeout / 10)));
  const deadline = start + maxTimeout - reserve, controller = new AbortController();
  const joined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  let context, page, timer, abort, opening = false, expired = false, accepting = true, onRoute, onResponse, finish;
  let pageStatus = 0, requests = 0, responses = 0, totalBytes = 0, submitted = false, runtimeFailed = false;
  const rows = [], closing = new WeakMap();
  const left = (cap = 60000) => {
    joined.throwIfAborted(); const remaining = Math.min(cap, deadline - Date.now());
    if (expired || remaining <= 0) throw new Error('Viettel Post browser deadline'); return remaining;
  };
  const close = target => {
    if (closing.has(target)) return closing.get(target);
    const task = (async () => {
      let closed = false, t;
      try { await Promise.race([Promise.resolve().then(() => target.close()).then(() => { closed = true; }).catch(() => {}),
        new Promise(resolve => { t = setTimeout(resolve, Math.max(1, Math.min(1500, reserve))); })]); }
      finally { clearTimeout(t); if (!closed) handle.requestBrowserReplacement?.('Viettel Post context cleanup failed'); }
    })(); closing.set(target, task); return task;
  };
  const result = () => ({ tier, status: 'success', durationMs: Date.now() - start, effectiveUrl: url,
    statusCode: pageStatus, html: '', body: new Uint8Array(), cookies: [], capturedResponses: rows,
    reason: rows.length ? 'viettel-post-reply' : runtimeFailed ? 'viettel-post-runtime'
      : submitted ? 'viettel-post-capture_missing' : 'viettel-post-verification_unfinished' });
  const work = async () => {
    const contextOptions = { viewport: { width: 1280, height: 900 } };
    if (proxy) {
      let parsed;
      try { parsed = new URL(proxy); } catch { throw new Error('Viettel Post proxy configuration is invalid'); }
      if (!['http:', 'https:', 'socks5:'].includes(parsed.protocol) || !parsed.hostname || parsed.hash || parsed.search
        || parsed.pathname !== '' && parsed.pathname !== '/') throw new Error('Viettel Post proxy configuration is invalid');
      contextOptions.proxy = { server: `${parsed.protocol}//${parsed.host}`,
        ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
        ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}) };
    }
    left(); opening = true; const made = openContext ? await openContext() : await handle.browser.newContext(contextOptions);
    opening = false; if (!openContext) handle.noteTemporaryContext?.();
    if (expired) { await close(made); throw new Error('Viettel Post context arrived late'); }
    context = made; page = await context.newPage(); left(); await installPolicy?.(page); left();
    onRoute = async route => {
      if (!accepting || expired || !boundViettelPostRequest(route.request(), number, page) || requests >= 2) {
        runtimeFailed = true; finish?.(); return route.abort();
      }
      requests++; return route.fallback();
    };
    await page.route(/^https:\/\/api\.viettelpost\.vn\/api\/orders\//, onRoute);
    onResponse = response => {
      if (!accepting || !boundViettelPostRequest(response.request(), number, page)) return;
      if (++responses > 2) { if (rows.length) rows.at(-1).error = 'response-limit'; finish?.(); return; }
      const headers = response.headers();
      const row = { url: VIETTEL_POST_HISTORY_API, status: response.status(), trackingNumberSubmitted: number,
        headers: Object.fromEntries(['content-type', 'retry-after'].filter(key => headers[key]).map(key => [key, headers[key].slice(0, 100)])),
        body: null, error: null, truncated: false, base64Encoded: false };
      rows.push(row);
      if (row.status !== 200) { finish?.(); return; }
      void (async () => {
        const bytes = await response.body(); if (!accepting) return;
        totalBytes += bytes.length;
        if (bytes.length > 1000000 || totalBytes > 2000000) row.truncated = true;
        else {
          const text = bytes.toString('utf8');
          if (/_cf_chl_opt|cf-chl-|challenge-platform|Sorry, you have been blocked|<title>\s*(?:Just a moment|Access Denied)/i.test(text.slice(0, 64000))) row.error = 'challenge-html';
          else {
            let data; try { data = JSON.parse(text); } catch { row.error = 'invalid-json'; }
            if (!row.error) { row.body = projectViettelPostHistory(data); if (new TextEncoder().encode(row.body).length > VIETTEL_POST_HISTORY_BYTES) row.truncated = true; }
          }
        }
      })().catch(() => { if (accepting) row.error = 'body-read'; }).finally(() => finish?.());
    };
    page.on('response', onResponse);
    const nav = await page.goto(ORIGIN + PATH, { waitUntil: 'domcontentloaded', timeout: left(25000) });
    pageStatus = nav?.status() ?? 0; left();
    if (page.url() !== ORIGIN + PATH || pageStatus !== 200) return result();
    const field = page.locator('#txtSearch');
    await field.waitFor({ state: 'visible', timeout: left(15000) }); left();
    if (await field.count() !== 1) { runtimeFailed = true; return result(); }
    await field.fill(number, { timeout: left(3000) });
    for (let attempt = 0; attempt < 2; attempt++) {
      left(); const audio = audioAllowed ? await audioAllowed() : true; left();
      if (audio) await solveCaptcha?.(page, left(45000), joined);
      else await viettelPostCheckboxOnly(page, left(11000), joined);
      left();
      const token = await page.locator('textarea[name="g-recaptcha-response"]').first().inputValue().catch(() => '');
      const checked = await page.frameLocator('iframe[src*="recaptcha"][src*="anchor"]').first()
        .locator('#recaptcha-anchor[aria-checked="true"]').count().catch(() => 0);
      if (!checked || token.length < 40) return result();
      if (await field.inputValue() !== number || await page.locator('#btnSearch').count() !== 1) { runtimeFailed = true; return result(); }
      left(); const replied = new Promise(resolve => { finish = resolve; }); submitted = true;
      await page.locator('#btnSearch').click({ timeout: left(5000) }); await replied; left();
      const last = rows.at(-1);
      if (!last || last.status !== 200 || last.error || last.truncated || typeof last.body !== 'string') break;
      let payload; try { payload = JSON.parse(last.body); } catch { break; }
      if (!(payload?.error === true && payload?.status === 201 && /captcha/i.test(payload?.message ?? '')) || attempt || left() < 20000) break;
      // The native component resets the rejected token; never submit it again.
      await page.waitForFunction(() => !document.querySelector('textarea[name="g-recaptcha-response"]')?.value,
        undefined, { timeout: left(3000) });
    }
    return result();
  };
  try {
    if (!Number.isFinite(maxTimeout) || maxTimeout < 1 || deadline <= start) { runtimeFailed = true; return result(); }
    const stopped = new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; controller.abort(new DOMException('Deadline', 'TimeoutError')); reject(controller.signal.reason); }, Math.max(1, deadline - Date.now()));
      abort = () => { expired = true; controller.abort(signal.reason); if (context) void close(context); reject(signal.reason); };
      signal?.addEventListener('abort', abort, { once: true });
    });
    return await Promise.race([work(), stopped]);
  } catch {
    if (signal?.aborted) signal.throwIfAborted();
    if (!pageStatus) runtimeFailed = true;
    return result();
  } finally {
    accepting = false; expired = true; controller.abort(); clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort);
    if (page && onResponse) page.off('response', onResponse);
    if (opening) handle.requestBrowserReplacement?.('Viettel Post context arrived after deadline');
    if (context) await close(context);
    for (const row of rows) if (row.status === 200 && row.body === null && !row.error && !row.truncated) row.error = 'capture-incomplete';
  }
}
