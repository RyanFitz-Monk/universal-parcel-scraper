import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {
  PAXEL_MAX_BYTES, PAXEL_PAGE, boundPaxelRequest, paxelBrowserNumber, runPaxelBrowser,
} from './paxel-browser.mjs';

const NUMBER = 'TSPX-12345678901';
const URL = `${PAXEL_PAGE}?awb_req=${NUMBER}`;
const CAPTURE = { captureResponses: [PAXEL_PAGE] };
const SECRET = 'fixture-private-value';
const defer = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const settle = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'fixture did not reach the expected phase');
    await settle();
  }
}

/** Pure fake browser: fallback is a local response emitter, never a transport. */
function fixture(config = {}) {
  const frame = {};
  const otherFrame = {};
  const listeners = new Map();
  const state = {
    order: [], closes: 0, replacements: [], aborted: [], wireRequests: [],
    bodyReads: 0, nativeSubmits: 0, policies: 0, factoryCalls: 0, pages: 0,
  };
  let handler;
  const request = ({
    method = 'POST', number = NUMBER, endpoint = PAXEL_PAGE, mainFrame = true,
    navigation = true, contentType = 'application/x-www-form-urlencoded; charset=UTF-8',
    body = new URLSearchParams({ _token: SECRET, auto_open_awb: '', shipment_code: number }).toString(),
  } = {}) => ({
    method: () => method, url: () => endpoint, frame: () => mainFrame ? frame : otherFrame,
    isNavigationRequest: () => navigation, headers: () => ({ 'content-type': contentType }),
    postData: () => body,
  });
  const response = (req, status, responseConfig = {}) => ({
    request: () => req, status: () => status,
    headers: () => {
      if (responseConfig.headersError) throw responseConfig.headersError;
      return { 'content-type': 'text/html; charset=UTF-8', ...responseConfig.headers };
    },
    body: async () => {
      state.bodyReads++;
      if (req.method() !== 'POST') throw new Error('GET body must not be retained');
      if (responseConfig.bodyError) throw responseConfig.bodyError;
      if (responseConfig.bodyPromise) return responseConfig.bodyPromise;
      return responseConfig.bytes ?? Buffer.from(responseConfig.body ?? '<html>synthetic history</html>');
    },
  });
  const emit = (req, status = 200, responseConfig = {}) => {
    listeners.get('response')?.(response(req, status, responseConfig));
  };
  const dispatch = async (req, responseConfig = config) => {
    assert.equal(typeof handler, 'function', 'guard must exist before any request');
    await handler({
      request: () => {
        if (responseConfig.requestError) throw responseConfig.requestError;
        return req;
      },
      abort: async reason => { state.aborted.push({ req, reason }); },
      fallback: async () => {
        assert.equal(state.policies, 1, 'outbound policy must precede the carrier route');
        if (responseConfig.dispatchError) throw responseConfig.dispatchError;
        state.wireRequests.push(req);
        if (!responseConfig.noReply) emit(req, responseConfig.status ?? 200, responseConfig);
      },
    });
  };
  const page = {
    mainFrame: () => frame,
    route: async (pattern, route) => {
      state.order.push('route');
      assert.equal(pattern, `${PAXEL_PAGE}*`);
      if (config.routeError) throw config.routeError;
      handler = route;
    },
    on: (event, listener) => {
      state.order.push('observe');
      if (config.observerError) throw config.observerError;
      listeners.set(event, listener);
    },
    off: event => { state.order.push('off'); listeners.delete(event); },
    goto: async (target, options) => {
      state.order.push('navigation');
      assert.equal(target, PAXEL_PAGE, 'navigation must not auto-submit awb_req');
      assert.equal(options.waitUntil, 'domcontentloaded');
      assert.ok(options.timeout > 0);
      for (const status of config.getStatuses ?? [403, 200]) {
        emit(request({ method: 'GET', body: '' }), status);
      }
      if (config.navigationError) throw config.navigationError;
      if (config.navigationPromise) await config.navigationPromise;
      return { status: () => 200 };
    },
    locator: selector => {
      assert.equal(selector, 'textarea#awb-text-area[name="shipment_code"]');
      return {
        waitFor: async options => {
          state.order.push('readiness');
          assert.equal(options.state, 'visible');
          if (config.readinessError) throw config.readinessError;
          if (config.readinessPromise) await config.readinessPromise;
        },
        fill: async value => {
          state.order.push('fill');
          if (config.fillError) throw config.fillError;
          state.value = value;
        },
      };
    },
    evaluate: async (fn, expected) => {
      state.order.push('submit');
      if (config.evaluateError) throw config.evaluateError;
      if (config.evaluatePromise) await config.evaluatePromise;
      for (const options of config.beforePosts ?? []) await dispatch(request(options));
      let pending;
      const form = {
        method: config.formMethod ?? 'POST', action: config.formAction ?? PAXEL_PAGE,
        querySelector: selector => {
          assert.match(selector, /^input\[type="hidden"\]\[name="(?:_token|auto_open_awb)"\]$/);
          return config.missingHidden === selector.match(/name="([^"]+)"/)[1] ? null : {};
        },
      };
      const field = { value: config.formValue ?? state.value, form: config.missingForm ? null : form };
      const submitted = vm.runInNewContext(`(${fn.toString()})(expected)`, {
        expected,
        document: { querySelector: selector => {
          assert.equal(selector, 'textarea#awb-text-area[name="shipment_code"]');
          return config.missingField ? null : field;
        } },
        HTMLFormElement: { prototype: { submit() {
          assert.equal(this, form);
          state.nativeSubmits++;
          pending = dispatch(request({ number: state.value }));
        } } },
      });
      await pending;
      for (const options of config.afterPosts ?? []) await dispatch(request(options));
      return submitted;
    },
  };
  const context = {
    newPage: async () => {
      state.pages++;
      if (config.pageError) throw config.pageError;
      if (config.pagePromise) await config.pagePromise;
      return page;
    },
    close: async () => {
      state.closes++;
      if (config.closeError) throw config.closeError;
      if (config.closePromise) await config.closePromise;
    },
  };
  const handle = {
    browser: { newContext() { throw new Error('Use only the injected factory'); } },
    requestBrowserReplacement: reason => { state.replacements.push(reason); },
  };
  const options = {
    url: URL, capture: CAPTURE, tier: 3, maxTimeout: 800, handle,
    createContext: async supplied => {
      assert.equal(supplied, handle);
      state.factoryCalls++;
      if (config.factoryError) throw config.factoryError;
      if (config.factoryPromise) return config.factoryPromise;
      return context;
    },
    installPolicy: async supplied => {
      assert.equal(supplied, page);
      state.order.push('policy');
      if (config.policyError) throw config.policyError;
      state.policies++;
    },
    waitCloudflare: async (supplied, timeout, target) => {
      assert.equal(supplied, page);
      assert.equal(target, PAXEL_PAGE);
      assert.ok(timeout > 0);
      state.order.push('verification');
      if (config.clearanceError) throw config.clearanceError;
      return config.clearance ?? 'ok';
    },
  };
  return { options, state, request, page, context, dispatch, emit, listeners };
}

test('eligibility accepts only the printed TSPX and existing EM layouts', () => {
  assert.equal(paxelBrowserNumber(URL, CAPTURE), NUMBER);
  const printed = 'EM.ABCD123456-20261118-1-ABC123';
  assert.equal(paxelBrowserNumber(`${PAXEL_PAGE}?awb_req=${printed}`, CAPTURE), printed);
  for (const number of ['TSPX12345678901', 'TSPX-1234567890', 'TSPX-123456789012',
    'tspx-12345678901', 'EM.ABCD123456-20261118-1-ABC12', `${NUMBER}%0A`, `${NUMBER}%0D`,
    `${NUMBER}%09`, `${NUMBER}%20`, `${NUMBER}%00`, `${NUMBER}\n`]) {
    assert.equal(paxelBrowserNumber(`${PAXEL_PAGE}?awb_req=${number}`, CAPTURE), null, number);
  }
});

test('eligibility rejects wrong endpoints, duplicate queries, fragments and capture scope', () => {
  for (const url of [URL + '&x=1', URL + `&awb_req=${NUMBER}`, URL + '#fragment', URL + '#',
    URL.replace('https:', 'http:'), URL.replace('paxel.co', 'wrong.invalid'),
    URL.replace('paxel.co', 'user:password@paxel.co'), URL.replace('/id/', '/en/'),
    URL.replace('?awb_req=', '/?awb_req=')]) assert.equal(paxelBrowserNumber(url, CAPTURE), null, url);
  for (const capture of [{}, { captureResponses: [] }, { captureResponses: [PAXEL_PAGE, PAXEL_PAGE] },
    { captureResponses: [`${PAXEL_PAGE}?x=1`] }, { captureResponses: { 0: PAXEL_PAGE, length: 1 } }]) {
    assert.equal(paxelBrowserNumber(URL, capture), null);
  }
});

test('stateful cookie/session and extra waiting requests retain their generic path', async () => {
  for (const stateful of [{ cookies: [{ name: 'session', value: SECRET }] }, { sessionStorage: new Map([['key', SECRET]]) },
    { sessionPage: PAXEL_PAGE }, { sessionContext: {} }, { contentWaitForSelector: '#other' }, { followMetaRefresh: true }]) {
    const f = fixture();
    assert.equal(await runPaxelBrowser({ ...f.options, capture: { ...CAPTURE, ...stateful } }), undefined);
    assert.equal(f.state.factoryCalls, 0);
  }
  assert.equal(paxelBrowserNumber(URL, { ...CAPTURE, cookies: [], sessionStorage: new Map() }), NUMBER);
});

test('whole-request binding requires exact navigation POST, main frame and native form encoding', () => {
  const f = fixture();
  assert.equal(boundPaxelRequest(f.request(), NUMBER, f.page), true);
  for (const options of [{ method: 'GET' }, { endpoint: PAXEL_PAGE + '?x=1' }, { number: NUMBER + '1' },
    { number: NUMBER + '\n' }, { mainFrame: false }, { navigation: false }, { contentType: 'application/json' },
    { contentType: 'application/x-www-form-urlencoded\n' }, { body: 'shipment_code=' + NUMBER },
    { body: `_token=${SECRET}&shipment_code=${NUMBER}&shipment_code=${NUMBER}` }]) {
    assert.equal(boundPaxelRequest(f.request(options), NUMBER, f.page), false, JSON.stringify(options));
  }
  assert.equal(boundPaxelRequest(f.request(), NUMBER), false);
  assert.equal(boundPaxelRequest({ headers() { throw new Error(SECRET); } }, NUMBER, f.page), false);
  assert.equal(boundPaxelRequest(f.request({ body: `_token=&shipment_code=${NUMBER}` }), NUMBER, f.page), true,
    'the guest CSRF contract checks presence, not a guessed token format or value');
});

test('policy, guard and observer precede blank navigation; GET403/200 and full POST body remain ordered', async () => {
  const body = `<html>${'<p>synthetic scan</p>'.repeat(700)}</html>`;
  const f = fixture({ body });
  const result = await runPaxelBrowser(f.options);
  assert.equal(result.status, 'success');
  assert.equal(result.reason, 'paxel-reply');
  assert.deepEqual(f.state.order.slice(0, 5), ['policy', 'route', 'observe', 'navigation', 'verification']);
  assert.deepEqual(result.capturedResponses.map(row => row.status), [403, 200, 200]);
  assert.deepEqual(result.capturedResponses.map(row => row.body), [null, null, body]);
  assert.equal(result.capturedResponses[2].trackingNumberSubmitted, NUMBER);
  assert.equal(result.statusCode, 200);
  assert.equal(result.effectiveUrl, URL);
  assert.equal(result.tier, 3);
  assert.equal(result.html, '');
  assert.equal(result.body.byteLength, 0);
  assert.deepEqual(result.cookies, []);
  assert.equal(f.state.bodyReads, 1);
  assert.equal(f.state.nativeSubmits, 1);
  assert.equal(f.state.factoryCalls, 1);
  assert.equal(f.state.closes, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(f.state.replacements.length, 0);
});

test('unbound/background/wrong-frame/duplicate POSTs are blocked before local fallback', async () => {
  const f = fixture({
    beforePosts: [{ body: '' }, { number: 'OTHER' }, { mainFrame: false }, { navigation: false }],
    afterPosts: [{}, { number: 'OTHER' }],
  });
  const result = await runPaxelBrowser(f.options);
  assert.equal(result.reason, 'paxel-reply');
  assert.equal(f.state.aborted.length, 6);
  assert.equal(f.state.wireRequests.length, 1);
  assert.equal(result.capturedResponses.filter(row => row.trackingNumberSubmitted === NUMBER).length, 1);
});

test('response cap reserves the twelfth row for the bound reply after many page replies', async () => {
  const f = fixture({ getStatuses: [403, ...Array(25).fill(200)] });
  const result = await runPaxelBrowser(f.options);
  assert.equal(result.capturedResponses.length, 12);
  assert.equal(result.capturedResponses[0].status, 403);
  assert.equal(result.capturedResponses.at(-1).trackingNumberSubmitted, NUMBER);
  assert.equal(result.capturedResponses.at(-1).body, '<html>synthetic history</html>');
});

test('unallowed POST responses, noncanonical GET and subframe GET are not shipment evidence', async () => {
  const pending = defer();
  const f = fixture({ readinessPromise: pending.promise });
  const task = runPaxelBrowser(f.options);
  await until(() => f.state.order.includes('readiness'));
  f.emit(f.request({ body: '' }), 200);
  f.emit(f.request({ method: 'GET', endpoint: PAXEL_PAGE + '?x=1' }), 200);
  f.emit(f.request({ method: 'GET', mainFrame: false }), 200);
  pending.resolve();
  const result = await task;
  assert.deepEqual(result.capturedResponses.map(row => row.status), [403, 200, 200]);
});

test('native form action, method, whole value and hidden fields are checked before submit', async () => {
  for (const config of [{ formAction: PAXEL_PAGE + '?other=1' }, { formMethod: 'GET' },
    { formValue: NUMBER + '1' }, { missingHidden: '_token' }, { missingHidden: 'auto_open_awb' },
    { missingField: true }, { missingForm: true }]) {
    const f = fixture(config);
    const result = await runPaxelBrowser(f.options);
    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'Paxel browser retrieval failed (phase=form_submission; category=form_contract)');
    assert.equal(f.state.nativeSubmits, 0);
    assert.equal(f.state.wireRequests.length, 0);
    assert.equal(f.state.closes, 1);
    assert.deepEqual(result.capturedResponses.map(row => row.status), [403, 200]);
  }
});

test('native 403/429/500 replies preserve status, Retry-After and bounded allowed headers', async () => {
  for (const status of [403, 429, 500]) {
    const f = fixture({ status, body: '<html>synthetic refused reply</html>', headers: {
      'retry-after': '60', 'set-cookie': SECRET, location: `https://${SECRET}.invalid`,
    } });
    const result = await runPaxelBrowser(f.options);
    assert.equal(result.status, 'success', 'a received HTTP refusal remains native capture evidence');
    assert.equal(result.statusCode, status);
    assert.equal(result.reason, 'paxel-reply');
    assert.deepEqual(result.capturedResponses.at(-1).headers, {
      'content-type': 'text/html; charset=UTF-8', 'retry-after': '60',
    });
    assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET));
  }
  const f = fixture({ headers: { 'retry-after': '9'.repeat(150) } });
  assert.equal((await runPaxelBrowser(f.options)).capturedResponses.at(-1).headers['retry-after'].length, 100);
});

test('UTF-8 bytes at the exact limit are retained completely, without character-count shortcuts', async () => {
  const body = 'é'.repeat(PAXEL_MAX_BYTES / 2);
  const f = fixture({ body });
  const row = (await runPaxelBrowser(f.options)).capturedResponses.at(-1);
  assert.equal(Buffer.byteLength(row.body), PAXEL_MAX_BYTES);
  assert.equal(row.body, body);
  assert.equal(row.truncated, false);
});

test('oversized declared and actual bodies stay distinct from unreadable replies', async () => {
  const declared = fixture({ headers: { 'content-length': String(PAXEL_MAX_BYTES + 1) } });
  const declaredRow = (await runPaxelBrowser(declared.options)).capturedResponses.at(-1);
  assert.equal(declaredRow.truncated, true);
  assert.equal(declaredRow.body, null);
  assert.equal(declaredRow.error, null);
  assert.equal(declared.state.bodyReads, 0);
  const actual = fixture({ body: 'é'.repeat(PAXEL_MAX_BYTES / 2 + 1) });
  const actualRow = (await runPaxelBrowser(actual.options)).capturedResponses.at(-1);
  assert.equal(actualRow.truncated, true);
  assert.equal(actualRow.body, null);
  const unreadable = fixture({ bodyError: new Error(`body https://${SECRET}.invalid?token=${SECRET}`) });
  const unreadableRow = (await runPaxelBrowser(unreadable.options)).capturedResponses.at(-1);
  assert.equal(unreadableRow.error, 'body_unreadable');
  assert.equal(unreadableRow.truncated, false);
  assert.equal(unreadableRow.body, null);
});

test('invalid UTF-8 cannot silently become a replacement-character HTML fixture', async () => {
  const f = fixture({ bytes: Uint8Array.of(0xc3, 0x28) });
  const row = (await runPaxelBrowser(f.options)).capturedResponses.at(-1);
  assert.equal(row.error, 'body_unreadable');
  assert.equal(row.body, null);
});

test('a UTF-8 BOM and the complete successful HTML are preserved', async () => {
  const body = '\uFEFF<!doctype html><title>synthetic reply</title>';
  const f = fixture({ body });
  const row = (await runPaxelBrowser(f.options)).capturedResponses.at(-1);
  assert.equal(row.body, body);
  assert.equal(row.error, null);
});

test('request-inspection failures abort before fallback and retain a safe binding reason', async () => {
  const f = fixture({ requestError: new Error(`https://${SECRET}.invalid?token=${SECRET}`) });
  const result = await runPaxelBrowser(f.options);
  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'Paxel browser retrieval failed (phase=request_binding; category=unknown)');
  assert.equal(f.state.wireRequests.length, 0);
  assert.equal(f.state.aborted.length, 1);
  assert.equal(f.state.closes, 1);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET));
});

test('body timeout retains its bound row and native status', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture({ bodyPromise: new Promise(() => {}) });
  const task = runPaxelBrowser({ ...f.options, maxTimeout: 5000 });
  await until(() => f.state.bodyReads === 1 && f.state.order.includes('submit'));
  t.mock.timers.tick(3001);
  const result = await task;
  assert.equal(result.status, 'success');
  assert.equal(result.capturedResponses.at(-1).error, 'body_timeout');
  assert.equal(result.statusCode, 200);
  assert.equal(f.state.closes, 1);
});

test('unresolved normal Cloudflare result preserves page evidence and makes no POST', async () => {
  const f = fixture({ clearance: 'blocked', getStatuses: [403] });
  const result = await runPaxelBrowser(f.options);
  assert.equal(result.status, 'success');
  assert.equal(result.reason, 'paxel-verification_unfinished');
  assert.deepEqual(result.diagnostic, { phase: 'verification', category: 'verification_unresolved' });
  assert.equal(result.statusCode, 403);
  assert.equal(f.state.nativeSubmits, 0);
  assert.equal(f.state.wireRequests.length, 0);
});

test('missing factory/policy/verification helpers fail before allocation instead of using another pool', async () => {
  for (const field of ['handle', 'createContext', 'installPolicy', 'waitCloudflare']) {
    const f = fixture();
    const result = await runPaxelBrowser({ ...f.options, [field]: undefined });
    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'Paxel browser retrieval failed (phase=validation; category=service_contract)');
    assert.equal(result.statusCode, 0);
    assert.equal(f.state.factoryCalls, 0);
  }
});

test('local phase/category errors preserve observed responses and do not fabricate HTTP500', async () => {
  for (const [config, phase, statuses] of [
    [{ factoryError: new Error(SECRET) }, 'context_creation', []],
    [{ pageError: new Error(SECRET) }, 'page_creation', []],
    [{ policyError: new Error(SECRET) }, 'policy_installation', []],
    [{ routeError: new Error(SECRET) }, 'request_guard_installation', []],
    [{ observerError: new Error(SECRET) }, 'response_observer_installation', []],
    [{ navigationError: new Error(SECRET) }, 'navigation', [403, 200]],
    [{ clearanceError: new Error(SECRET) }, 'verification', [403, 200]],
    [{ readinessError: new Error(SECRET) }, 'form_readiness', [403, 200]],
    [{ fillError: new Error(SECRET) }, 'form_fill', [403, 200]],
    [{ evaluateError: new Error(SECRET) }, 'form_submission', [403, 200]],
    [{ dispatchError: new Error(SECRET) }, 'request_dispatch', [403, 200]],
  ]) {
    const f = fixture(config);
    const result = await runPaxelBrowser(f.options);
    assert.equal(result.status, 'error');
    assert.equal(result.reason, `Paxel browser retrieval failed (phase=${phase}; category=unknown)`);
    assert.deepEqual(result.capturedResponses.map(row => row.status), statuses);
    assert.equal(result.statusCode, statuses.at(-1) ?? 0);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET));
    assert.equal(f.state.closes, phase === 'context_creation' ? 0 : 1);
  }
});

test('allowlisted exception categories redact URL/token details and hostile getters', async () => {
  const hostile = {};
  Object.defineProperty(hostile, 'name', { get() { throw new Error(SECRET); } });
  const hostilePrototype = new Proxy({}, { getPrototypeOf() { throw new Error(SECRET); } });
  for (const [error, category] of [
    [Object.assign(new Error(`https://${SECRET}.invalid`), { name: 'TimeoutError' }), 'timeout'],
    [Object.assign(new Error(SECRET), { name: 'AbortError' }), 'aborted'],
    [new Error(`Target page, context or browser has been closed ${SECRET}`), 'context_closed'],
    [new Error(`net::ERR_PROXY_CONNECTION_FAILED https://${SECRET}.invalid`), 'proxy'],
    [Object.assign(new Error(SECRET), { code: 'ENOTFOUND' }), 'dns'],
    [Object.assign(new Error(SECRET), { code: 'ECONNRESET' }), 'connection'],
    [Object.assign(new Error(SECRET), { code: 'CERT_HAS_EXPIRED' }), 'tls'],
    [new Error(`403 token=${SECRET}`), 'unknown'], [hostile, 'unknown'], [hostilePrototype, 'unknown'],
    [SECRET, 'unknown'], [null, 'unknown'],
  ]) {
    const f = fixture({ navigationError: error });
    // Null cannot trigger the fixture's truthy error branch.
    if (error === null) f.options.waitCloudflare = async () => { throw error; };
    const result = await runPaxelBrowser(f.options);
    assert.equal(result.status, 'error');
    assert.equal(result.diagnostic.category, category);
    assert.match(result.reason, new RegExp(`category=${category}\\)$`));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET));
  }
});

test('metadata reader exceptions are safely reported without losing earlier GET rows', async () => {
  const f = fixture({ headersError: new Error(`token=${SECRET}`) });
  const result = await runPaxelBrowser(f.options);
  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'Paxel browser retrieval failed (phase=capture_metadata; category=unknown)');
  assert.deepEqual(result.capturedResponses.map(row => row.status), [403, 200]);
  assert.equal(f.state.closes, 1);
});

test('invalid and exhausted budgets allocate no context and keep the exact budget reason', async () => {
  for (const maxTimeout of [undefined, NaN, Infinity, 0, -1, 20]) {
    const f = fixture();
    const result = await runPaxelBrowser({ ...f.options, maxTimeout });
    assert.equal(result.status, 'error');
    assert.equal(result.reason, 'Paxel browser budget exhausted');
    assert.equal(f.state.factoryCalls, 0);
  }
});

test('capture deadline retains page evidence, makes one POST and closes exactly once', async () => {
  const f = fixture({ noReply: true });
  const result = await runPaxelBrowser({ ...f.options, maxTimeout: 90 });
  assert.equal(result.status, 'error');
  assert.equal(result.reason, 'Paxel browser budget exhausted');
  assert.equal(result.diagnostic.phase, 'capture_wait');
  assert.deepEqual(result.capturedResponses.map(row => row.status), [403, 200]);
  assert.equal(f.state.wireRequests.length, 1);
  assert.equal(f.state.closes, 1);
});

test('already-cancelled input never allocates and preserves the caller cancellation reason', async () => {
  const controller = new AbortController();
  const reason = new Error('synthetic caller cancellation');
  controller.abort(reason);
  const f = fixture();
  await assert.rejects(runPaxelBrowser({ ...f.options, signal: controller.signal }), error => error === reason);
  assert.equal(f.state.factoryCalls, 0);
});

test('cancellation during pending body preserves cancellation and closes exactly once', async () => {
  const controller = new AbortController();
  const reason = new DOMException('Synthetic cancellation', 'AbortError');
  const body = defer();
  const f = fixture({ bodyPromise: body.promise });
  const task = runPaxelBrowser({ ...f.options, signal: controller.signal });
  await until(() => f.state.bodyReads === 1);
  controller.abort(reason);
  await assert.rejects(task, error => error === reason);
  assert.equal(f.state.closes, 1);
  body.resolve(Buffer.from('late synthetic HTML'));
  await settle();
  assert.equal(f.state.closes, 1);
  assert.equal(f.listeners.size, 0);
});

test('late context after deadline is closed exactly once and never used to create a page', async () => {
  const creation = defer();
  const f = fixture({ factoryPromise: creation.promise });
  const result = await runPaxelBrowser({ ...f.options, maxTimeout: 80 });
  assert.equal(result.reason, 'Paxel browser budget exhausted');
  assert.equal(f.state.closes, 0);
  creation.resolve(f.context);
  await until(() => f.state.closes === 1);
  assert.equal(f.state.pages, 0);
});

test('late context after caller cancellation is closed exactly once', async () => {
  const creation = defer();
  const controller = new AbortController();
  const f = fixture({ factoryPromise: creation.promise });
  const task = runPaxelBrowser({ ...f.options, signal: controller.signal });
  await until(() => f.state.factoryCalls === 1);
  controller.abort();
  await assert.rejects(task, { name: 'AbortError' });
  creation.resolve(f.context);
  await until(() => f.state.closes === 1);
  assert.equal(f.state.pages, 0);
});

test('late page cannot install policy, navigate or submit after its context is closed', async () => {
  const pending = defer();
  const f = fixture({ pagePromise: pending.promise });
  const result = await runPaxelBrowser({ ...f.options, maxTimeout: 80 });
  assert.equal(result.reason, 'Paxel browser budget exhausted');
  assert.equal(f.state.closes, 1);
  pending.resolve();
  await settle();
  assert.equal(f.state.policies, 0);
  assert.equal(f.state.nativeSubmits, 0);
  assert.equal(f.state.closes, 1);
});

test('cancellation while form preparation is pending prevents any later POST', async () => {
  const pending = defer();
  const controller = new AbortController();
  const f = fixture({ readinessPromise: pending.promise });
  const task = runPaxelBrowser({ ...f.options, signal: controller.signal });
  await until(() => f.state.order.includes('readiness'));
  controller.abort();
  await assert.rejects(task, { name: 'AbortError' });
  pending.resolve();
  await settle();
  assert.equal(f.state.nativeSubmits, 0);
  assert.equal(f.state.closes, 1);
});

test('route stays fail-closed if delayed page code attempts submission after timeout', async () => {
  const pending = defer();
  const f = fixture({ evaluatePromise: pending.promise });
  const result = await runPaxelBrowser({ ...f.options, maxTimeout: 80 });
  assert.equal(result.reason, 'Paxel browser budget exhausted');
  pending.resolve();
  await until(() => f.state.nativeSubmits === 1);
  await settle();
  assert.equal(f.state.wireRequests.length, 0);
  assert.equal(f.state.aborted.length, 1);
  assert.equal(f.state.closes, 1);
});

test('cleanup throw or timeout requests replacement once without masking a successful reply', async () => {
  for (const config of [{ closeError: new Error(`https://${SECRET}.invalid`) }, { closePromise: new Promise(() => {}) }]) {
    const f = fixture(config);
    const result = await runPaxelBrowser({ ...f.options, maxTimeout: 180 });
    assert.equal(result.status, 'success');
    assert.equal(result.reason, 'paxel-reply');
    assert.equal(f.state.closes, 1);
    assert.deepEqual(f.state.replacements, ['Paxel context cleanup failed']);
    assert.doesNotMatch(JSON.stringify(result), new RegExp(SECRET));
  }
});
