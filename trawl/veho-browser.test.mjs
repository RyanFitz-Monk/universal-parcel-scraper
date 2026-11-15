import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runVehoBrowser, vehoBrowserRequest, VEHO_ATTESTATION } from './veho-browser.mjs';

const url = 'https://track.shipveho.com/';
const capture = { captureResponses: [VEHO_ATTESTATION] };
const exchange = 'https://content-firebaseappcheck.googleapis.com/v1/projects/veho-consumer-mobile/apps/1:1:web:abc:exchangeRecaptchaEnterpriseToken?key=PRIVATE';
const token = `${'a'.repeat(20)}.${'b'.repeat(40)}.${'c'.repeat(30)}`;
const granted = JSON.stringify({ token, ttl: '3600s', extra: 'PRIVATE' });
const response = (value = granted, status = 200, address = exchange, method = 'POST') => ({
  url: () => address, status: () => status, request: () => ({ method: () => method }),
  headers: () => ({ 'content-type': 'application/json', 'set-cookie': 'PRIVATE' }), body: async () => Buffer.from(value),
});
function fixture(replies = [response()]) {
  const handlers = {}, state = { closed: 0, counted: 0, replaced: 0, policy: 0, navigation: null, observedFirst: false };
  const page = { on: (name, fn) => { handlers[name] = fn; }, off: name => { delete handlers[name]; },
    goto: async target => {
      state.navigation = target; state.observedFirst = Boolean(handlers.response);
      for (const reply of replies) handlers.response?.(reply);
      return { status: () => 200 };
    } };
  const context = { newPage: async () => page, close: async () => { state.closed++; } };
  const options = { url, capture, tier: 3, maxTimeout: 500, handle: { browser: { newContext: async () => context },
    noteTemporaryContext: () => { state.counted++; }, requestBrowserReplacement: () => { state.replaced++; } },
  installPolicy: async () => { state.policy++; } };
  return { options, handlers, state, page, context };
}

test('accepts only the tracker home page and its attestation capture', async () => {
  assert.equal(vehoBrowserRequest(url, capture), true);
  for (const candidate of [`${url}#/trackingid/VH199999999980`, `${url}?trackingId=VH199999999980`, 'https://track.shipveho.com',
    'https://user@track.shipveho.com/', 'https://example.test/', 'http://track.shipveho.com/']) {
    assert.equal(vehoBrowserRequest(candidate, capture), false);
  }
  assert.equal(vehoBrowserRequest(url, { captureResponses: [VEHO_ATTESTATION, 'https://example.test'] }), false);
  assert.equal(vehoBrowserRequest(url, {}), false);
  assert.equal(await runVehoBrowser({ ...fixture().options, url: `${url}#x` }), undefined);
});

test('observes before navigation and returns only the token and its lifetime', async () => {
  const { options, handlers, state } = fixture();
  const result = await runVehoBrowser(options);
  assert.equal(result.status, 'success');
  assert.deepEqual(result.capturedResponses, [{ url: VEHO_ATTESTATION, status: 200, body: JSON.stringify({ token, ttl: '3600s' }),
    headers: { 'content-type': 'application/json' }, truncated: false, base64Encoded: false, error: null }]);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  assert.equal(result.html, '');
  assert.equal(state.navigation, url);
  assert.equal(state.observedFirst, true);
  assert.deepEqual([state.closed, state.counted, state.policy, state.replaced], [1, 1, 1, 0]);
  assert.deepEqual(handlers, {});
});

test('keeps a refusal as its status alone and does not wait for the page to retry', async () => {
  for (const status of [403, 429, 503]) {
    const { options, state } = fixture([response('PRIVATE', status), response()]);
    const result = await runVehoBrowser(options);
    assert.deepEqual(result.capturedResponses.map(row => [row.status, row.body]), [[status, null]]);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
    assert.equal(state.closed, 1);
  }
});

test('ignores other projects, hosts and methods', async () => {
  const others = [
    response(granted, 200, exchange.replace('veho-consumer-mobile', 'another-project')),
    response(granted, 200, exchange.replace('content-firebaseappcheck.googleapis.com', 'example.test')),
    response(granted, 200, exchange, 'GET'),
    response(granted, 200, exchange.replace(':exchangeRecaptchaEnterpriseToken', ':exchangeDebugToken')),
  ];
  const { options, state } = fixture(others);
  options.maxTimeout = 30;
  const result = await runVehoBrowser(options);
  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'Veho browser budget exhausted');
  assert.equal(state.closed, 1);
});

test('reports an answer that is not a token without returning it', async () => {
  for (const value of ['<html>PRIVATE</html>', JSON.stringify({ token: 'PRIVATE', ttl: '3600s' }),
    JSON.stringify({ token, ttl: 'PRIVATE' }), JSON.stringify({ token: `${token}${'d'.repeat(5000)}`, ttl: '3600s' })]) {
    const result = await runVehoBrowser(fixture([response(value)]).options);
    assert.equal(result.capturedResponses[0].body, null);
    assert.equal(result.capturedResponses[0].error, 'Veho attestation was not a token');
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  }
  const large = await runVehoBrowser(fixture([response('x'.repeat(20_000))]).options);
  assert.deepEqual([large.capturedResponses[0].body, large.capturedResponses[0].truncated], [null, true]);
  const unread = fixture([{ ...response(), body: async () => { throw new Error('gone'); } }]);
  assert.equal((await runVehoBrowser(unread.options)).capturedResponses[0].error, 'Veho attestation could not be read');
});

test('ends at the deadline, on cancellation and on a failed page, closing the context', async () => {
  const hung = fixture(); hung.options.maxTimeout = 20; hung.page.goto = () => new Promise(() => {});
  assert.deepEqual(await runVehoBrowser(hung.options).then(row => [row.status, row.reason]), ['error', 'Veho browser budget exhausted']);
  assert.equal(hung.state.closed, 1);
  const stopped = fixture(); const controller = new AbortController(); stopped.page.goto = () => new Promise(() => {});
  const pending = runVehoBrowser({ ...stopped.options, signal: controller.signal });
  controller.abort();
  assert.equal((await pending).status, 'error');
  assert.equal(stopped.state.closed, 1);
  const blocked = fixture([]); blocked.page.goto = async () => ({ status: () => 403 });
  const page = await runVehoBrowser(blocked.options);
  assert.deepEqual([page.status, page.statusCode, page.capturedResponses.length], ['success', 403, 0]);
  const stuck = fixture(); stuck.context.close = () => new Promise(() => {});
  await runVehoBrowser(stuck.options);
  assert.equal(stuck.state.replaced, 1);
});

test('through a proxy, opens the context the request supplies', async () => {
  const { options, state, context } = fixture();
  let opened = 0;
  const result = await runVehoBrowser({ ...options, handle: { ...options.handle, browser: { newContext: async () => { throw new Error('own address'); } } },
    openContext: async () => { opened++; return context; } });
  assert.equal(result.capturedResponses[0].status, 200);
  assert.deepEqual([opened, state.counted, state.closed], [1, 0, 1]);
});
