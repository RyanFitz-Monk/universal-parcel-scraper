import { test } from 'node:test';
import assert from 'node:assert/strict';
import { australiaPostBrowserRequest, runAustraliaPostBrowser } from './australia-post-browser.mjs';

const number = '7T0000000000000000001';
const url = `https://auspost.com.au/mypost/track/details/${number}`;
const api = `https://digitalapi.auspost.com.au/shipments-gateway/v1/watchlist/shipments?trackingIds=${number}`;
const capture = { captureResponses: [api], settleTimeout: 20 };

test('dedicated context only serves the exact Australia Post page and one query', () => {
  assert.equal(australiaPostBrowserRequest(url, capture), true);
  for (const candidate of [url + '?extra=1', url + '#test', url.replace('auspost.com.au', 'example.test'),
    url.replace(number, 'LETTERSLETTERS'), url.replace('/details/', '/search/'),
    url.replace('https://', 'https://user:password@')]) {
    assert.equal(australiaPostBrowserRequest(candidate, capture), false);
  }
  assert.equal(australiaPostBrowserRequest(url, { captureResponses: [api, 'https://example.test'] }), false);
  assert.equal(australiaPostBrowserRequest(url, { captureResponses: [api + 'OTHER'] }), false);
});

function fixture() {
  const handlers = {};
  const state = { closed: 0, counted: 0, replacements: 0, policy: 0, detached: 0, options: undefined };
  const body = JSON.stringify([{ trackingIds: [number], status: 200, shipment: { articles: [{ articleId: number }] } }]);
  const page = {
    on(event, handler) { handlers[event] = handler; }, off() { state.detached++; },
    goto: async () => ({ status: () => 200 }), content: async () => '<html>Australia Post</html>', url: () => url,
    evaluate: async (_callback, args) => {
      if (!args) return 'synthetic-browser';
      await handlers.response({ url: () => api, status: () => 200, request: () => ({ method: () => 'GET' }),
        headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from(body) });
    },
  };
  const context = { newPage: async () => page, close: async () => { state.closed++; } };
  const handle = { browser: { newContext: async options => { state.options = options; return context; } },
    noteTemporaryContext: () => { state.counted++; }, requestBrowserReplacement: () => { state.replacements++; } };
  const options = { url, handle, tier: 3, maxTimeout: 1000, capture,
    locale: 'de-DE', installPolicy: async () => { state.policy++; } };
  return { options, context, page, handle, state };
}

test('uses a fresh scoped locale context, preserves outbound policy, returns actual capture and closes', async () => {
  const { options, state } = fixture();
  const result = await runAustraliaPostBrowser(options);
  assert.equal(result.status, 'success');
  assert.deepEqual(state.options, { viewport: null, locale: 'de-DE' });
  assert.equal(state.policy, 1);
  assert.equal(state.counted, 1);
  assert.equal(state.closed, 1);
  assert.equal(state.replacements, 0);
  assert.ok(state.detached > 0);
  assert.equal(result.capturedResponses[0].url, api);
  assert.deepEqual(result.cookies, []);
  assert.equal(result.statusCode, 200);
});

test('cached and fresh tiers use the same isolated context path', async () => {
  for (const tier of [2, 3]) {
    const { options, state } = fixture();
    const result = await runAustraliaPostBrowser({ ...options, tier, locale: 'en-GB' });
    assert.equal(result.tier, tier);
    assert.equal(state.options.locale, 'en-GB');
    assert.equal(state.closed, 1);
  }
});

test('closes on failed or timed-out navigation and does not expose arbitrary error text', async () => {
  for (const hanging of [false, true]) {
    const { options, page, state } = fixture();
    page.goto = () => hanging ? new Promise(() => {}) : Promise.reject(new Error('PRIVATE_TEST_ERROR'));
    const result = await runAustraliaPostBrowser({ ...options, maxTimeout: 10 });
    assert.equal(result.status, 'error');
    assert.equal(JSON.stringify(result).includes('PRIVATE_TEST_ERROR'), false);
    assert.equal(state.closed, 1);
  }
});

test('closes a context that finishes creation after its request deadline', async () => {
  const { options, handle, context, state } = fixture();
  let release;
  handle.browser.newContext = () => new Promise(resolve => { release = resolve; });
  const result = await runAustraliaPostBrowser({ ...options, maxTimeout: 5 });
  assert.equal(result.status, 'error');
  release(context);
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(state.closed, 1);
});

test('asks the pool to replace a browser when context cleanup fails', async () => {
  const { options, context, state } = fixture();
  context.close = () => Promise.reject(new Error('cleanup failed'));
  const result = await runAustraliaPostBrowser(options);
  assert.equal(result.status, 'success');
  assert.equal(state.replacements, 1);
});

test('injected proxy context keeps its options and owns the temporary-context count', async () => {
  const { options, handle, state } = fixture();
  const proxyOptions = { viewport: null, proxy: { server: 'http://proxy.example' } };
  const result = await runAustraliaPostBrowser({ ...options, openContext: async () => {
    const created = await handle.browser.newContext(proxyOptions);
    handle.noteTemporaryContext();
    return created;
  } });
  assert.equal(result.status, 'success');
  assert.deepEqual(state.options, proxyOptions);
  assert.equal(state.counted, 1);
  assert.equal(state.closed, 1);
  assert.equal(state.policy, 1);
  assert.equal(state.replacements, 0);
});

test('a rejected factory cannot open a direct context or expose its message', async () => {
  const { options, handle, state } = fixture();
  handle.browser.newContext = () => { throw new Error('Direct fallback is forbidden'); };
  const result = await runAustraliaPostBrowser({ ...options, openContext: async () => {
    throw new Error('PRIVATE_PROXY_FACTORY_ERROR');
  } });
  assert.equal(result.status, 'error');
  assert.equal(state.counted, 0);
  assert.equal(state.options, undefined);
  assert.equal(JSON.stringify(result).includes('PRIVATE_PROXY_FACTORY_ERROR'), false);
});

test('cancellation closes an injected context that completes after the cancelled read', async () => {
  const { options, context, handle, state } = fixture();
  const controller = new AbortController();
  let release;
  const result = runAustraliaPostBrowser({ ...options, signal: controller.signal,
    openContext: () => new Promise(resolve => { release = () => {
      handle.noteTemporaryContext(); resolve(context);
    }; }) });
  controller.abort();
  assert.equal((await result).status, 'error');
  assert.equal(state.closed, 0);
  release();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(state.counted, 1);
  assert.equal(state.closed, 1);
  assert.equal(state.policy, 0);
});

test('a pre-aborted proxy read never invokes its context factory', async () => {
  const { options, state } = fixture();
  const controller = new AbortController();
  controller.abort();
  let opens = 0;
  const result = await runAustraliaPostBrowser({ ...options, signal: controller.signal,
    openContext: async () => { opens++; throw new Error('Cancelled factory'); } });
  assert.equal(result.status, 'error');
  assert.equal(opens, 0);
  assert.equal(state.counted, 0);
  assert.equal(state.closed, 0);
});

test('in-flight proxy cancellation closes the context and detaches capture', async () => {
  const { options, context, page, handle, state } = fixture();
  const controller = new AbortController();
  page.goto = () => new Promise(() => {});
  const result = runAustraliaPostBrowser({ ...options, signal: controller.signal,
    openContext: async () => { handle.noteTemporaryContext(); return context; } });
  setTimeout(() => controller.abort(), 5);
  assert.equal((await result).status, 'error');
  assert.equal(state.closed, 1);
  assert.equal(state.counted, 1);
  assert.ok(state.detached > 0);
});

test('proxy-only custom state stays generic without changing default request eligibility', () => {
  for (const options of [{ cookies: [{ name: 'fixture', value: 'opaque' }] },
    { sessionStorage: new Map([['fixture', 'opaque']]) }, { sessionPage: {} },
    { contentWaitForSelector: '#fixture-ready' }, { followMetaRefresh: true }]) {
    assert.equal(australiaPostBrowserRequest(url, { ...capture, ...options }, { proxied: true }), false);
    assert.equal(australiaPostBrowserRequest(url, { ...capture, ...options }), true);
  }
  assert.equal(australiaPostBrowserRequest(url, { ...capture, cookies: [], sessionStorage: new Map() }, { proxied: true }), true);
});

test('an exhausted or invalid budget cannot open an injected context', async () => {
  for (const maxTimeout of [0, -1, Infinity, NaN]) {
    const { options, state } = fixture(); let opened = 0;
    const answer = await runAustraliaPostBrowser({ ...options, maxTimeout,
      openContext: async () => { opened++; throw new Error('Unexpected context'); } });
    assert.equal(answer.status, 'error'); assert.equal(opened, 0); assert.equal(state.counted, 0);
  }
});
