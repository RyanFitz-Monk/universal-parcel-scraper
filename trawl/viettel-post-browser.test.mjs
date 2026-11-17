import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { VIETTEL_POST_HISTORY_API as API, viettelPostBrowserNumber, boundViettelPostRequest,
  projectViettelPostHistory, runViettelPostBrowser } from './viettel-post-browser.mjs';

const NUMBER = '000000000001';
const ENTRY = 'https://viettelpost.vn/viettelpost-iframe/tra-cuu-hanh-trinh-don-hang-v3-recaptcha';
const URL = ENTRY + '?orders=' + NUMBER;
const capture = { captureResponses: [API] };
const payload = () => ({ status: 200, error: false, messageKey: 'common.no_header', data: [{ MAVANDON: NUMBER,
  SHOW_ORDER: true, DICH_VU: 'Synthetic express', RECEIVER_FULLNAME: 'PRIVATE recipient',
  TRACKING_ORDERS: [{ STATUS_NAME: 'Delivered', TRACKINGS: [{ MAVANDON: NUMBER, TRANG_THAI: 501,
    THOI_GIAN: '08/04/2026 12:59:58', STATUS_NAME: 'Giao thành công', GHI_CHU: 'Phát thành công',
    TINH: 'Synthetic province', TEN_BUUCUC_DI: 'Synthetic depot', NOI_DUNG: 'PRIVATE recipient prose',
    ADDRESS: 'PRIVATE street', NHAN_VIEN_PHAT_DETAIL: { PHONE: 'PRIVATE phone' }, secret: 'PRIVATE token' }] }] }] });

function harness(options = {}) {
  const state = { closed: 0, made: 0, notes: 0, replacements: 0, submissions: 0, aborted: 0, fallback: 0,
    number: '', token: '', checked: false, solves: 0, checkboxClicks: 0, log: [], reset: 0 };
  const page = new EventEmitter(); let routeHandler;
  const frame = {};
  const request = () => ({ url: () => options.requestUrl ?? API, method: () => 'POST', frame: () => frame,
    postData: () => JSON.stringify({ orders: options.wrongNumber ? NUMBER + '1' : state.number, captcha: state.token }),
    headers: () => ({ 'x-token': 'synthetic.header.signature', ...(options.auth ? { authorization: 'PRIVATE account' } : {}) }) });
  page.mainFrame = () => frame;
  page.setViewportSize = async value => { assert.deepEqual(value, { width: 1280, height: 900 }); };
  page.route = async (_pattern, handler) => { routeHandler = handler; state.log.push('route'); };
  page.goto = async () => { state.log.push('navigation'); return { status: () => options.pageStatus ?? 200 }; };
  page.url = () => ENTRY;
  page.waitForFunction = async () => { state.token = ''; state.checked = false; state.reset++; };
  const button = {
    count: async () => 1,
    click: async () => {
      state.submissions++;
      const req = request(); let allowed = false;
      await routeHandler({ request: () => req, fallback: async () => { state.fallback++; allowed = true; },
        abort: async () => { state.aborted++; } });
      if (!allowed) return;
      const item = options.replies?.[state.submissions - 1] ?? { status: 200, payload: payload() };
      page.emit('response', { url: () => API, request: () => req, status: () => item.status,
        headers: () => ({ 'content-type': 'application/json', 'set-cookie': 'PRIVATE cookie' }),
        body: () => options.bodyNever ? new Promise(() => {}) : Promise.resolve(Buffer.from(item.html ?? JSON.stringify(item.payload))) });
    },
  };
  page.locator = selector => selector === '#txtSearch' ? {
    waitFor: async () => {}, count: async () => 1, fill: async value => { state.number = value; }, inputValue: async () => state.number,
  } : selector === '#btnSearch' ? button : {
    first() { return this; }, inputValue: async () => state.token,
  };
  const anchor = {
    click: async () => { state.checkboxClicks++; state.checked = true; state.token = 'checkbox'.repeat(10); },
    count: async () => state.checked ? 1 : 0, waitFor: async () => { if (!state.checked) throw new Error('Unchecked'); },
  };
  const frameLocator = { first() { return this; }, locator: () => anchor };
  page.frameLocator = () => frameLocator;
  const context = { newPage: async () => page, close: async () => { state.closed++; } };
  const create = async contextOptions => { state.made++; state.contextOptions = contextOptions;
    if (options.openDelay) await new Promise(r => setTimeout(r, options.openDelay)); return context; };
  const handle = { browser: { newContext: create }, noteTemporaryContext: () => { state.notes++; },
    requestBrowserReplacement: () => { state.replacements++; } };
  const run = extra => runViettelPostBrowser({ url: URL, capture, handle, tier: 2, maxTimeout: 2000,
    installPolicy: async () => { state.log.push('policy'); },
    solveCaptcha: async (_page, _timeout, signal) => { signal.throwIfAborted(); state.solves++;
      state.checked = true; state.token = ('token' + state.solves).repeat(20); return options.falseSolver ? false : true; }, ...extra });
  return { run, state, page, context, handle, request, create };
}

test('only the exact whole-number guest form and capture endpoint select this helper', () => {
  assert.equal(viettelPostBrowserNumber(URL, capture), NUMBER);
  for (const url of [URL + '&orders=' + NUMBER, URL + '#fragment', URL.replace('https://', 'https://user@'),
    URL.replace('viettelpost.vn', 'viettelpost.vn.evil.invalid'), URL.replace('orders=', 'order='), ENTRY]) {
    assert.equal(viettelPostBrowserNumber(url, capture), null);
  }
  assert.equal(viettelPostBrowserNumber(URL, { captureResponses: [API, API] }), null);
});

test('request binding rejects another query, missing proof, extra body fields and user authentication', () => {
  const h = harness(); h.state.number = NUMBER; h.state.token = 't'.repeat(80);
  const req = h.request(); assert.equal(boundViettelPostRequest(req, NUMBER, h.page), true);
  for (const changed of [
    { postData: () => JSON.stringify({ orders: NUMBER + '1', captcha: 't'.repeat(80) }) },
    { postData: () => JSON.stringify({ orders: NUMBER, captcha: 't'.repeat(80), phone: 'PRIVATE' }) },
    { headers: () => ({}) }, { headers: () => ({ 'x-token': 'a.b.c', token: 'PRIVATE' }) },
    { url: () => API + '?other=1' }, { frame: () => ({}) },
  ]) assert.equal(boundViettelPostRequest({ ...req, ...changed }, NUMBER, h.page), false);
});

test('projection excludes recipient prose, contacts, issued credentials and unexpected fields', () => {
  const text = projectViettelPostHistory(payload()); assert.ok(!text.includes('PRIVATE'));
  const data = JSON.parse(text); assert.equal(data.data[0].MAVANDON, NUMBER);
  assert.equal(data.data[0].TRACKING_ORDERS[0].TRACKINGS[0].THOI_GIAN, '08/04/2026 12:59:58');
  assert.deepEqual(JSON.parse(projectViettelPostHistory({ status: 201, error: true, message: 'captcha PRIVATE secret' })),
    { status: 201, error: true, message: 'captcha verification rejected' });
});

test('observes and fences before navigation, submits native controls once and closes its fresh context', async () => {
  const h = harness(); const result = await h.run();
  assert.deepEqual(h.state.log, ['policy', 'route', 'navigation']);
  assert.equal(result.capturedResponses.length, 1); assert.equal(h.state.fallback, 1); assert.equal(h.state.submissions, 1);
  assert.equal(result.capturedResponses[0].trackingNumberSubmitted, NUMBER); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal(h.state.closed, 1); assert.equal(h.state.notes, 1);
});

test('verified callback state outranks a false solver return', async () => {
  const h = harness({ falseSolver: true }); const result = await h.run();
  assert.equal(result.capturedResponses.length, 1); assert.equal(h.state.submissions, 1);
});

test('preserves a rejected verification before one fresh-token retry and stops at two requests', async () => {
  const h = harness({ replies: [{ status: 200, payload: { status: 201, error: true, message: 'captcha invalid' } },
    { status: 200, payload: payload() }] });
  const result = await h.run({ maxTimeout: 30000 });
  assert.equal(result.capturedResponses.length, 2); assert.equal(h.state.reset, 1); assert.equal(h.state.solves, 2);
  assert.equal(JSON.parse(result.capturedResponses[0].body).status, 201);
  assert.equal(JSON.parse(result.capturedResponses[1].body).data[0].SHOW_ORDER, true);
});

test('rate limits and block HTML retain their verdict without another verification attempt', async () => {
  for (const reply of [{ status: 429, payload: {} }, { status: 200, html: '<html>Sorry, you have been blocked</html>' }]) {
    const h = harness({ replies: [reply] }); const result = await h.run();
    assert.equal(h.state.submissions, 1); assert.equal(h.state.solves, 1);
    assert.equal(result.capturedResponses[0].status, reply.status);
    if (reply.status === 200) assert.equal(result.capturedResponses[0].error, 'challenge-html');
  }
});

test('an active audio cooldown permits only an ordinary checkbox and never calls the audio solver', async () => {
  const h = harness(); const result = await h.run({ audioAllowed: async () => false });
  assert.equal(h.state.solves, 0); assert.equal(h.state.checkboxClicks, 1); assert.equal(result.capturedResponses.length, 1);
});

test('the supplied proxy context factory is used without falling back to the original browser address', async () => {
  const h = harness(); h.handle.browser.newContext = async () => { throw new Error('Wrong address'); };
  const result = await h.run({ openContext: h.create });
  assert.equal(result.capturedResponses.length, 1); assert.equal(h.state.made, 1); assert.equal(h.state.notes, 0);
});

test('a configured SOCKS proxy and its credentials stay in the fresh context options', async () => {
  const h = harness(); const result = await h.run({ proxy: 'socks5://user%40name:secret@proxy.invalid:1080' });
  assert.equal(result.capturedResponses.length, 1);
  assert.deepEqual(h.state.contextOptions, { viewport: { width: 1280, height: 900 },
    proxy: { server: 'socks5://proxy.invalid:1080', username: 'user@name', password: 'secret' } });
  assert.ok(!JSON.stringify(result).includes('secret'));
});

test('wrong whole requests are aborted and cannot publish a captured reply', async () => {
  const h = harness({ wrongNumber: true }); const result = await h.run();
  assert.equal(h.state.aborted, 1); assert.equal(h.state.fallback, 0); assert.equal(result.capturedResponses.length, 0);
  assert.equal(result.reason, 'viettel-post-runtime');
});

test('cancellation starts no context and an in-flight body deadline closes and marks the incomplete capture', async () => {
  const h = harness(), controller = new AbortController(); controller.abort(new Error('Stopped'));
  await assert.rejects(h.run({ signal: controller.signal }), /Stopped/); assert.equal(h.state.made, 0);
  const delayed = harness({ bodyNever: true }); const result = await delayed.run({ maxTimeout: 70 });
  assert.equal(delayed.state.closed, 1); assert.equal(result.capturedResponses[0].error, 'capture-incomplete');
});

test('a context arriving after the deadline is closed rather than used for another lookup', async () => {
  const h = harness({ openDelay: 80 }); const result = await h.run({ maxTimeout: 60 });
  assert.equal(result.capturedResponses.length, 0); assert.equal(h.state.replacements, 1);
  await new Promise(r => setTimeout(r, 100)); assert.equal(h.state.closed, 1); assert.equal(h.state.submissions, 0);
});
