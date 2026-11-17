import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { australiaPostBrowserRequest } from './australia-post-browser.mjs';

// Exercise the installer-owned dispatch itself without starting a browser or running the installer.
const source = readFileSync(new URL('./install.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  if (carrierRequest && australiaPostBrowserRequest(');
const end = source.indexOf('\n  if (carrierPage && track123Number', start);
assert.ok(start >= 0 && end > start);
const blockTemplate = source.slice(start, end);
const number = 'TEST1234567890';
const url = 'https://auspost.com.au/mypost/track/details/' + number;
const api = 'https://digitalapi.auspost.com.au/shipments-gateway/v1/watchlist/shipments?trackingIds=' + number;
const proxy = 'http://fixture:opaque@proxy.invalid:8080';

function fixture(fresh = true) {
  const block = vm.runInNewContext("`" + blockTemplate + "`", { fresh });
  const state = { opens: [], helpers: 0, budgetRuns: 0 };
  const handle = { browser: {}, noteTemporaryContext() {}, requestBrowserReplacement() {} };
  const budget = { signal: new AbortController().signal, async run(fn) { state.budgetRuns++; return await fn(); } };
  const dispatch = vm.runInNewContext(`(async function({url,capture,proxyUrl,handle,budget,carrierRequest=true${fresh ? ',ignoreCertificateErrors' : ''}}) {
    const carrierRun = { url, capture, handle, tier: 3, maxTimeout: 1000, installPolicy: async () => {} };
    ${block}
    return { generic: true };
  })`, {
    australiaPostBrowserRequest,
    async runAustraliaPostBrowser(options) {
      state.helpers++;
      return { helper: true, options, context: options.openContext ? await options.openContext() : undefined };
    },
    async newWanbContext(browser, options) { state.opens.push({ browser, options }); return { fresh: true }; },
  });
  const run = (options = {}) => dispatch({ url, capture: { captureResponses: [api] }, proxyUrl: proxy, handle, budget, ...options });
  return { state, handle, budget, run };
}

test('AU proxy dispatch honors the supplied network resolver inside the lookup budget', async () => {
  const f = fixture(); let supplied;
  const result = await f.run({ capture: { captureResponses: [api], networkProxy: async value => { supplied = value; return 'http://mapped.invalid:8080'; } } });
  assert.equal(result.helper, true); assert.equal(supplied, proxy); assert.equal(f.state.budgetRuns, 1);
  assert.equal(f.state.opens.length, 1); assert.equal(f.state.opens[0].options.proxy, 'http://mapped.invalid:8080');
  assert.equal(f.state.opens[0].options.onCreated, f.handle.noteTemporaryContext);
  assert.equal(f.state.opens[0].options.requestReplacement, f.handle.requestBrowserReplacement);
  assert.equal(result.options.signal, f.budget.signal);
});

test('proxy resolver failures or missing routes never open an unproxied context', async () => {
  for (const networkProxy of [async () => { throw new Error('fixture failure'); }, async () => undefined, async () => '']) {
    const f = fixture();
    await assert.rejects(f.run({ capture: { captureResponses: [api], networkProxy } }));
    assert.equal(f.state.opens.length, 0);
  }
});

test('plain proxy reads retain the configured route and certificate policy without a locale override', async () => {
  const f = fixture(); await f.run({ ignoreCertificateErrors: true });
  assert.equal(f.state.opens[0].options.proxy, proxy);
  assert.equal(f.state.opens[0].options.ignoreHttpsErrors, true);
  assert.equal('locale' in f.state.opens[0].options, false);
  assert.equal(f.state.budgetRuns, 0);
});

test('new proxy dispatch leaves custom state and readiness on the generic path', async () => {
  for (const options of [{ cookies: [{ name: 'fixture', value: 'opaque' }] },
    { sessionStorage: new Map([['fixture', 'opaque']]) }, { sessionPage: {} },
    { contentWaitForSelector: '#fixture-ready' }, { followMetaRefresh: true }]) {
    const f = fixture(); const result = await f.run({ capture: { captureResponses: [api], ...options } });
    assert.equal(result.generic, true); assert.equal(f.state.helpers, 0); assert.equal(f.state.opens.length, 0);
  }
});

test('default context creation remains with the original helper', async () => {
  const f = fixture(); const result = await f.run({ proxyUrl: undefined });
  assert.equal(result.helper, true); assert.equal(result.options.openContext, undefined);
  assert.equal(result.options.signal, undefined); assert.equal(f.state.opens.length, 0);
});

test('the dispatch cannot turn a foreign, partial or non-carrier request into an AU lookup', async () => {
  for (const options of [{ url: url + '?other=1' }, { url: url.replace('auspost.com.au', 'example.invalid') },
    { capture: { captureResponses: [api, api] } }, { carrierRequest: false }]) {
    const f = fixture(); assert.equal((await f.run(options)).generic, true); assert.equal(f.state.helpers, 0);
  }
});


test('cached tier dispatch has its own certificate policy and no fresh-tier lexical dependency', async () => {
  const f = fixture(false); const result = await f.run({ ignoreCertificateErrors: true });
  assert.equal(result.helper, true); assert.equal(f.state.opens.length, 1);
  assert.equal(f.state.opens[0].options.ignoreHttpsErrors, false);
  assert.equal(f.state.opens[0].options.proxy, proxy);
});
