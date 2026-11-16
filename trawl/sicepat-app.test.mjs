import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSicepatApp, sicepatAppRequest, SICEPAT_VERIFICATION } from './sicepat-app.mjs';
const url = 'https://www.sicepat.com/', capture = { captureResponses: [SICEPAT_VERIFICATION] };
const token = 'synthetic_fresh_token_'.repeat(8);
function fixture() {
  const state = { opened: 0, closed: 0, policy: 0, script: [], routed: false, counted: 0, removed: false, replaced: 0 };
  let route; const frame = {};
  const page = { mainFrame: () => frame, url: () => url, route: async (u, fn) => { assert.equal(u, url); route = fn; },
    goto: async u => { assert(state.policy); assert.equal(u, url); await route({ request: () => ({ isNavigationRequest: () => true, frame: () => frame }),
      fulfill: async data => { state.routed = true; assert.equal(data.status, 200); }, continue: async () => { throw Error('Unexpected homepage HTTP'); } }); },
    addScriptTag: async data => { state.script.push(data); }, waitForSelector: async () => {},
    locator: () => ({ getAttribute: async () => token, evaluate: async () => { state.removed = true; } }) };
  const context = { newPage: async () => page, close: async () => { state.closed++; } };
  const options = { url, capture, tier: 3, maxTimeout: 3000, handle: { browser: { newContext: async () => { state.opened++; return context; } },
    noteTemporaryContext: () => { state.counted++; }, requestBrowserReplacement: () => { state.replaced++; } }, installPolicy: async () => { state.policy++; } };
  return { options, page, context, state };
}

test('only the exact app-origin request and selector opt into verification', async () => {
  assert(sicepatAppRequest(url, capture));
  for (const u of [url + '?number=003179246085', url + '#x', url.replace('https:', 'http:'), 'https://user@www.sicepat.com/']) assert(!sicepatAppRequest(u, capture));
  for (const c of [{}, { captureResponses: [] }, { captureResponses: [SICEPAT_VERIFICATION, url] }]) assert(!sicepatAppRequest(url, c));
  assert.equal(await runSicepatApp({ ...fixture().options, url: url + '#x' }), undefined);
});
test('reproduces only the app inline document and returns one fresh tagged callback, no tracking captures or cookies', async () => {
  const f = fixture(), r = await runSicepatApp(f.options);
  assert.equal(r.status, 'success'); assert.deepEqual(JSON.parse(r.html), { kind: 'sicepat-app-verification', version: 1, origin: url, action: 'checkAwb', token });
  assert.deepEqual(r.capturedResponses, []); assert.deepEqual(r.cookies, []);
  assert.deepEqual(f.state.script.map(x => x.url ?? 'callback'), [SICEPAT_VERIFICATION, 'callback']);
  assert.equal((f.state.script[1].content.match(/grecaptcha.execute/g) ?? []).length, 1);
  assert(f.state.script[1].content.includes("action:'checkAwb'"));
  assert.deepEqual([f.state.opened, f.state.closed, f.state.counted, f.state.policy, f.state.removed, f.state.routed], [1, 1, 1, 1, true, true]);
});
test('rejects origin changes and invalid callback values without leaking them', async () => {
  const moved = fixture(); moved.page.url = () => 'https://other.test/';
  assert.equal((await runSicepatApp(moved.options)).status, 'error'); assert.equal(moved.state.script.length, 0);
  for (const value of ['error', 'PRIVATE', 'x'.repeat(9000), '<script>PRIVATE</script>']) {
    const f = fixture(); f.page.locator = () => ({ getAttribute: async () => value, evaluate: async () => {} });
    const r = await runSicepatApp(f.options); assert.equal(r.status, 'error'); assert(!JSON.stringify(r).includes('PRIVATE')); assert.equal(f.state.closed, 1);
  }
});
test('cancellation and deadline close the fresh context; pre-cancelled requests open none', async () => {
  const c = new AbortController(); c.abort(); const pre = fixture(); await runSicepatApp({ ...pre.options, signal: c.signal }); assert.equal(pre.state.opened, 0);
  const f = fixture(), controller = new AbortController(); f.page.waitForSelector = () => new Promise(() => {});
  const run = runSicepatApp({ ...f.options, signal: controller.signal }); await new Promise(resolve => setImmediate(resolve)); controller.abort();
  assert.equal((await run).status, 'error'); assert.equal(f.state.closed, 1);
  const timed = fixture(); timed.page.goto = () => new Promise(() => {}); const result = await runSicepatApp({ ...timed.options, maxTimeout: 1510 });
  assert.equal(result.status, 'error'); assert.equal(timed.state.closed, 1);
});
test('a context arriving after cancellation is closed and cannot return a token', async () => {
  const f = fixture(), c = new AbortController(); let created;
  f.options.handle.browser.newContext = () => new Promise(resolve => { created = resolve; });
  const pending = runSicepatApp({ ...f.options, signal: c.signal }); c.abort(); assert.equal((await pending).status, 'error');
  created(f.context); await new Promise(resolve => setImmediate(resolve)); assert.equal(f.state.closed, 1); assert.equal(f.state.script.length, 0);
});
