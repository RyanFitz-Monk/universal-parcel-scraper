import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { DOMParser } from 'linkedom';
import { boundOnlogRequest, installOnlogNativeBridge, onlogExpressBrowserNumber, ONLOG_EXPRESS_API,
  ONLOG_EXPRESS_CAPTURE_BYTES, projectOnlogReply, runOnlogExpressBrowser } from './onlog-express-browser.mjs';

globalThis.DOMParser = DOMParser;
const number = 'AA1029384756', url = 'https://onlog.app.br/rastreio/' + number, capture = { captureResponses: [ONLOG_EXPRESS_API] };
const frame = {};
const body = { sucesso: true, html: `<div>OBJETO PRIVATE-ALIAS</div><h3>${number}</h3><div class="recipient">PRIVATE</div>
 <div class="rastreio-wrapper"><div class="rastreio-item active"><div class="texto-rastreio"><span class="position-relative">OBJETO ENTREGUE AO DESTINATÁRIO</span><span class="text-sm">SAO PAULO - SP</span>03/04/2026 14:13</div></div></div>` };
function request(fields, extra = {}) {
  const data = fields ?? new URLSearchParams({ origem: 'form_rastreio_encomendas_sem_dados_destinatario', txtObjetos: number,
    txtR1RastreioEncomendas: '', 'cf-turnstile-response': 'PRIVATE' });
  return { url: () => ONLOG_EXPRESS_API, method: () => 'POST', frame: () => frame, postData: () => String(data), ...extra };
}
function fixture({ reply = JSON.stringify(body), status = 200, delay = 5, enabled = true, timeout = 1000 } = {}) {
  const handlers = {}, state = { closed: 0, clicks: 0, policy: 0, fallback: 0, aborted: 0, read: 0, replacements: 0 };
  let fieldValue = '';
  const response = { url: () => ONLOG_EXPRESS_API, request: () => request(), status: () => status,
    headers: () => ({ 'content-type': 'application/json', 'set-cookie': 'PRIVATE', 'retry-after': '120' }),
    body: async () => { state.read++; return Buffer.from(reply); } };
  const page = { mainFrame: () => frame, on: (event, fn) => { handlers[event] = fn; }, off: event => { delete handlers[event]; },
    addInitScript: async fn => { assert.equal(fn, installOnlogNativeBridge); }, route: async (pattern, fn) => {
      assert.ok(pattern instanceof RegExp); assert.ok(pattern.test(ONLOG_EXPRESS_API));
      assert.equal(pattern.test('https://example.test/view/jsRastreio.php'), false); state.route = fn;
    },
    goto: async () => ({ status: () => 200 }), url: () => 'https://conecta.log.br/rastreio.php',
    evaluate: async (fn, arg) => fn(arg), waitForTimeout: ms => new Promise(resolve => setTimeout(resolve, Math.min(ms, 5))),
    locator: selector => ({ count: async () => 1, fill: async value => { fieldValue = value; }, inputValue: async () => fieldValue,
      getAttribute: async () => JSON.stringify({ ready: true, widget: true, events: [] }), boundingBox: async () => null,
      isEnabled: async () => enabled, click: async () => { assert.equal(selector, '#btnConsultar'); state.clicks++;
        await state.route({ request: () => request(), fallback: async () => { state.fallback++;
          setTimeout(() => handlers.response?.(response), delay); }, abort: async () => { state.aborted++; } }); },
    }),
  };
  const context = { newPage: async () => page, close: async () => { state.closed++; } };
  const handle = { browser: { newContext: async () => context }, requestBrowserReplacement: () => { state.replacements++; } };
  return { options: { url, capture, handle, tier: 3, maxTimeout: timeout, installPolicy: async () => { state.policy++; } }, state, page, handlers, context, response };
}
test('matches only the official whole-reference link and exact capture endpoint', () => {
  assert.equal(onlogExpressBrowserNumber(url, capture), number);
  for (const u of [url + '?x=1', url + '#x', url + '/', url + '/extra', url.replace('AA', 'AB'), url.replace(number, number.slice(0, -1)),
    url.replace('https:', 'http:'), url.replace('onlog.app.br', 'example.test'), url.replace('onlog.app.br', 'user@onlog.app.br')]) {
    assert.equal(onlogExpressBrowserNumber(u, capture), null);
  }
  assert.equal(onlogExpressBrowserNumber(url, { captureResponses: [ONLOG_EXPRESS_API + '?x'] }), null);
});
test('binds one whole number, guest mode, empty identity input and present native verification', () => {
  const page = { mainFrame: () => frame }; assert.equal(boundOnlogRequest(request(), number, page), true);
  for (const fields of [
    { origem: 'form_login', txtObjetos: number, 'cf-turnstile-response': 'PRIVATE' },
    { origem: 'form_rastreio_encomendas_sem_dados_destinatario', txtObjetos: number.slice(0, 8), 'cf-turnstile-response': 'PRIVATE' },
    { origem: 'form_rastreio_encomendas_sem_dados_destinatario', txtObjetos: number, txtR1RastreioEncomendas: 'PRIVATE', 'cf-turnstile-response': 'PRIVATE' },
    { origem: 'form_rastreio_encomendas_sem_dados_destinatario', txtObjetos: number, 'cf-turnstile-response': '' },
    { origem: 'form_rastreio_encomendas_sem_dados_destinatario', txtObjetos: number, action: 'PRIVATE', 'cf-turnstile-response': 'PRIVATE' },
  ]) assert.equal(boundOnlogRequest(request(new URLSearchParams(fields)), number, page), false);
  const duplicate = new URLSearchParams(request().postData()); duplicate.append('txtObjetos', number);
  assert.equal(boundOnlogRequest(request(duplicate), number, page), false);
  assert.equal(boundOnlogRequest(request(undefined, { frame: () => ({}) }), number, page), false);
});
test('projects only native identity and scan fields without flattening wrong or multiple cards', () => {
  const projected = JSON.parse(projectOnlogReply(body)); assert.ok(projected.html.includes(number));
  assert.ok(!JSON.stringify(projected).includes('PRIVATE'));
  assert.ok(projected.html.includes('03/04/2026 14:13'));
  const wrong = structuredClone(body); wrong.html = wrong.html.replace(number, 'AA1029384757');
  assert.ok(projectOnlogReply(wrong).includes('AA1029384757'));
  const multiple = structuredClone(body); multiple.html += '<h3>AA1029384757</h3>';
  assert.equal((JSON.parse(projectOnlogReply(multiple)).html.match(/<h3>/g) ?? []).length, 2);
  for (const d of [null, { sucesso: false, mensagem: 'Nenhum objeto encontrado na base de dados.', html: 'PRIVATE' },
    { ...body, token: 'PRIVATE' }, { ...body, html: body.html + '<div class="rastreio-item">PRIVATE</div>' }]) assert.equal(projectOnlogReply(d), 'null');
});
test('waits for an asynchronous native POST after click, preserves policy and closes its context', async () => {
  const f = fixture({ delay: 20 }); const r = await runOnlogExpressBrowser(f.options);
  assert.equal(r.capturedResponses.length, 1); assert.equal(r.capturedResponses[0].trackingNumberSubmitted, number);
  assert.equal(JSON.stringify(r).includes('PRIVATE'), false); assert.equal(f.state.policy, 1); assert.equal(f.state.fallback, 1);
  assert.equal(f.state.closed, 1); assert.equal(f.state.clicks, 1); assert.deepEqual(f.handlers, {});
});
test('retains refused/rate-limited statuses and safe headers without reading their bodies', async () => {
  for (const status of [403, 429, 500]) {
    const f = fixture({ status, reply: 'PRIVATE' }); const r = await runOnlogExpressBrowser(f.options);
    assert.equal(r.capturedResponses[0].status, status); assert.equal(r.capturedResponses[0].headers['retry-after'], '120');
    assert.equal(f.state.read, 0); assert.equal(JSON.stringify(r).includes('PRIVATE'), false);
  }
});
test('keeps malformed JSON, challenge HTML and oversized replies distinct', async () => {
  for (const [reply, error, truncated] of [['PRIVATE not-json', 'invalid-json', false],
    ['<title>Just a moment</title>PRIVATE', 'challenge-html', false], ['x'.repeat(ONLOG_EXPRESS_CAPTURE_BYTES + 1), null, true]]) {
    const f = fixture({ reply }); const r = await runOnlogExpressBrowser(f.options);
    assert.equal(r.capturedResponses[0].error, error); assert.equal(r.capturedResponses[0].truncated, truncated);
    assert.equal(JSON.stringify(r).includes('PRIVATE'), false); assert.equal(f.state.closed, 1);
  }
});
test('does not finalize an unresolved widget as a missing parcel, and preserves an explicit native code', async () => {
  const f = fixture({ enabled: false, timeout: 80 }); const r = await runOnlogExpressBrowser(f.options);
  assert.deepEqual(r.capturedResponses, []); assert.equal(r.reason, 'onlog-verification_unfinished'); assert.equal(f.state.closed, 1);
  const error = fixture({ enabled: false }); const locator = error.page.locator;
  error.page.locator = s => ({ ...locator(s), getAttribute: async () => JSON.stringify({ ready: true, events: [{ event: 'fail', code: '600010' }] }) });
  assert.equal((await runOnlogExpressBrowser(error.options)).reason, 'onlog-verification_600010');
});
test('cancels before opening and after opening without retaining a context or observer', async () => {
  const before = fixture(); const stopped = new AbortController(); stopped.abort();
  await assert.rejects(runOnlogExpressBrowser({ ...before.options, signal: stopped.signal }), { name: 'AbortError' }); assert.equal(before.state.closed, 0);
  const during = fixture({ enabled: false }); const controller = new AbortController();
  const promise = runOnlogExpressBrowser({ ...during.options, signal: controller.signal }); setTimeout(() => controller.abort(), 10);
  await assert.rejects(promise, { name: 'AbortError' }); assert.equal(during.state.closed, 1); assert.deepEqual(during.handlers, {});
});
test('closes a context arriving after the deadline and requests replacement before release', async () => {
  const f = fixture({ timeout: 50 }); f.options.handle.browser.newContext = () => new Promise(resolve => setTimeout(() => resolve(f.context), 80));
  const r = await runOnlogExpressBrowser(f.options); assert.deepEqual(r.capturedResponses, []); assert.equal(f.state.replacements, 1);
  await new Promise(resolve => setTimeout(resolve, 90)); assert.equal(f.state.closed, 1);
});
test('native initialization is confined to the canonical page and leaves rendered widgets alone', () => {
  function run(height, origin = 'https://conecta.log.br') {
    const timers = [], attrs = {}; let called = 0, context;
    const root = { appendChild: script => vm.runInContext(script.textContent, context), setAttribute: (k, v) => { attrs[k] = v; } };
    const sandbox = { location: { origin, pathname: '/rastreio.php' }, document: { documentElement: root,
      createElement: () => ({ remove() {} }), querySelector: () => ({ getBoundingClientRect: () => ({ height }) }) },
      window: { addEventListener() {}, onTurnstileLoad: () => { called++; }, turnstile: { render() {} } },
      setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {} };
    context = vm.createContext(sandbox); vm.runInContext(`(${installOnlogNativeBridge.toString()})()`, context);
    if (timers.length) { timers[0](); for (let i = 0; i < 30; i++) timers[1](); }
    return { called, timers, attrs };
  }
  assert.equal(run(0).called, 1); assert.equal(run(70).called, 0); assert.equal(run(0, 'https://challenges.cloudflare.com').timers.length, 0);
});
