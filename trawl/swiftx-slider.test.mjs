import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { attachSwiftxSlider, locateSwiftxSlider, swiftxSliderDrag, swiftxIconClicks, swiftxSkipPhonePrompt, swiftxPhoneDigits,
  swiftxDropPhoneFragment, swiftxEnterPhoneDigits } from './swiftx-slider.mjs';

const API = 'https://swiftx-express.com/api/graphql';
const NUMBER = 'SWX000000000000000001';
const digest = createHash('sha256').update(NUMBER).digest('hex');
const tick = () => new Promise(resolve => setImmediate(resolve));
const challenge = (id = 'SYNTHETIC_A', type = 'SLIDER') => ({ success: true, captchaId: id, type,
  backgroundImage: 'data:image/png;base64,AA==', templateImage: 'data:image/png;base64,AQ==',
  backgroundImageWidth: 600, backgroundImageHeight: 360, templateImageWidth: 110, templateImageHeight: 360 });
const imageQuery = { query: 'query { getOfficialTrackingSliderCaptcha { success } }' };
const verifyQuery = (id = 'SYNTHETIC_A', bindingDigest = digest) => ({ query: 'mutation { verifyOfficialTrackingSlider(input: $input) { success } }',
  variables: { input: { captchaId: id, bindingDigest } } });

function fixture(options = {}) {
  const page = new EventEmitter();
  let refreshes = 0, moves = 0, downs = 0, ups = 0;
  const clicks = [];
  const geometry = { x: 30, y: 100, scale: 320 / 600, maxKnob: 276, maxImage: 261 };
  page.evaluate = async (fn, arg) => fn === swiftxSkipPhonePrompt ? (options.skipPhone?.() ?? false)
    : fn === swiftxEnterPhoneDigits ? (options.enterPhone?.(arg) ?? false) : (options.geometry ?? geometry);
  page.getByRole = () => ({ locator: () => ({ first: () => ({ evaluate: async () => { refreshes++; await options.refresh?.(); } }) }) });
  page.mouse = { move: async () => { moves++; await options.move?.(); }, down: async () => { downs++; }, up: async () => { ups++; await options.up?.(); } };
  page.mouse.click = async (x, y) => { clicks.push({ x, y }); await options.click?.(clicks.length); };
  const controller = attachSwiftxSlider(page, NUMBER, { solve: async () => null, onVerification: () => {}, ...options });
  const respond = async (payload, request = imageQuery, { status = 200, headers = {}, read, url = API } = {}) => {
    page.emit('response', { url: () => url, status: () => status, headers: () => ({ 'content-type': 'application/json', ...headers }),
      request: () => ({ method: () => 'POST', postDataJSON: () => request }), body: read ?? (async () => Buffer.from(JSON.stringify({ data: payload }))) });
    await tick();
  };
  return { page, controller, respond, clicks, stats: () => ({ refreshes, moves, downs, ups }) };
}

test('only skips an empty optional phone prompt for the same whole number', () => {
  for (const invalid of [null, 'number', 'page', 'query', 'filled', 'disabled', 'hidden', 'duplicate', 'label']) {
    let clicks = 0;
    const button = { textContent: invalid === 'label' ? 'Continue' : 'Skip, show parcel status', disabled: invalid === 'disabled',
      getBoundingClientRect: () => ({ width: invalid === 'hidden' ? 0 : 100 }), click: () => { clicks++; } };
    const document = { body: { innerText: 'Enter the last four digits of the recipient phone number' },
      querySelectorAll: selector => selector === 'textarea' ? [{ value: invalid === 'number' ? 'SWX000000000000000002' : NUMBER }]
        : selector === 'input[maxlength="4"]' ? [{ value: invalid === 'filled' ? '1234' : '', disabled: false,
          getBoundingClientRect: () => ({ width: 100 }) }] : invalid === 'duplicate' ? [button, button] : [button] };
    const href = `https://${invalid === 'page' ? 'other.test' : 'swiftx-express.com'}/track?trackingNumber=${NUMBER}${invalid === 'query' ? '&other=1' : ''}`;
    const result = runInNewContext(`(${swiftxSkipPhonePrompt})({number})`, { URL, location: { href }, document, number: NUMBER });
    assert.equal(result, invalid === null, invalid);
    assert.equal(clicks, invalid === null ? 1 : 0, invalid);
  }
});

test('uses the optional Skip after bound verification and never repeats it', async () => {
  let f, skips = 0;
  f = fixture({ solve: async () => ({ x: 200 }), skipPhone: () => { skips++; return true; },
    up: () => f.respond({ verifyOfficialTrackingSlider: { success: true, sliderToken: 'PRIVATE_TOKEN' } }, verifyQuery()) });
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  await f.controller.prepare(6000);
  await f.controller.prepare(6000);
  f.controller.dispose();
  assert.equal(skips, 1);
  const unprepared = fixture({ skipPhone: () => { throw new Error('must not skip before preparation'); } });
  await unprepared.controller.prepare(0);
  unprepared.controller.dispose();
});

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Synthetic digits.
const DIGITS = '0042';

test('reads four phone digits from the address\'s fragment only', () => {
  const url = hash => new URL(`https://swiftx-express.com/track?trackingNumber=${NUMBER}${hash}`);
  assert.equal(swiftxPhoneDigits(url('')), null);
  assert.equal(swiftxPhoneDigits(url(`#trawl-phone-digits=${DIGITS}`)), DIGITS);
  for (const hash of ['#test', '#trawl-phone-digits=042', '#trawl-phone-digits=00042', '#trawl-phone-digits=004a',
    `#trawl-phone-digits=${DIGITS}&x=1`, `#trawl-postcode=${DIGITS}`]) assert.equal(swiftxPhoneDigits(url(hash)), undefined, hash);
});

test('drops the digits from SwiftX\'s address before its scripts run, and nothing else', () => {
  for (const [origin, hash, dropped] of [['https://swiftx-express.com', `#trawl-phone-digits=${DIGITS}`, true],
    ['https://other.test', `#trawl-phone-digits=${DIGITS}`, false], ['https://swiftx-express.com', '#other', false]]) {
    const calls = [];
    const location = { origin, hash, pathname: '/track', search: `?trackingNumber=${NUMBER}` };
    const history = { state: { page: 1 }, replaceState: (...args) => calls.push(args) };
    runInNewContext(`(${swiftxDropPhoneFragment})()`, { location, history });
    assert.deepEqual(calls, dropped ? [[{ page: 1 }, '', `/track?trackingNumber=${NUMBER}`]] : [], `${origin}${hash}`);
  }
});

/** The summary card the page shows with its phone field, as plain objects. */
function phoneCard(invalid, typed = '') {
  let clicks = 0;
  const events = [];
  const visible = width => ({ getBoundingClientRect: () => ({ width }) });
  const textarea = { value: invalid === 'number' ? 'SWX000000000000000002' : NUMBER };
  const card = { querySelectorAll: () => [{ textContent: invalid === 'card' ? 'SWX000000000000000002' : NUMBER }],
    contains: element => invalid === 'root' && element === textarea, parentElement: null };
  const button = { ...visible(invalid === 'hiddenButton' ? 0 : 100), textContent: invalid === 'verifying' ? 'Verifying...' : ' View full tracking ',
    disabled: invalid === 'buttonDisabled', click: () => { clicks++; } };
  const holder = { querySelectorAll: selector => selector === 'button' ? (invalid === 'buttons' ? [button, button] : [button]) : [],
    parentElement: card };
  let stored = invalid === 'filled' ? '9999' : typed;
  const prototype = { get value() { return stored; }, set value(next) { stored = String(next); } };
  const input = Object.assign(Object.create(prototype), visible(invalid === 'hidden' ? 0 : 100), { disabled: invalid === 'disabled',
    labels: [{ textContent: invalid === 'label' ? 'Enter a code' : 'Enter the last 4 digits of the recipient\'s phone number to view full tracking' }],
    parentElement: holder, dispatchEvent: event => events.push(event) });
  const document = { querySelectorAll: selector => selector === 'textarea' ? [textarea]
    : selector === 'input[maxlength="4"]' ? (invalid === 'inputs' ? [input, input] : [input]) : [] };
  class Event { constructor(type, init) { this.type = type; this.bubbles = init?.bubbles; } }
  const href = `https://${invalid === 'page' ? 'other.test' : 'swiftx-express.com'}/track?trackingNumber=${NUMBER}${invalid === 'query' ? '&other=1' : ''}${invalid === 'hash' ? '#trawl-phone-digits=9999' : ''}`;
  const run = (digits, submit) => runInNewContext(`(${swiftxEnterPhoneDigits})({ number, digits, submit })`,
    { URL, location: { href }, document, Event, number: NUMBER, digits, submit });
  return { run, value: () => stored, events, clicks: () => clicks };
}

test('types the digits only into the empty phone field on the same number\'s summary, then presses its own button', () => {
  for (const invalid of ['page', 'query', 'hash', 'number', 'card', 'root', 'filled', 'disabled', 'hidden', 'inputs', 'label', 'verifying',
    'buttonDisabled', 'hiddenButton', 'buttons']) {
    const card = phoneCard(invalid);
    assert.equal(card.run(DIGITS, false), false, invalid);
    assert.equal(card.value(), invalid === 'filled' ? '9999' : '', invalid);
    assert.equal(card.events.length + card.clicks(), 0, invalid);
  }
  for (const digits of ['042', '00042', '004a', 42]) assert.equal(phoneCard(null).run(digits, false), false, String(digits));
  const card = phoneCard(null);
  assert.equal(card.run(DIGITS, false), true);
  assert.equal(card.value(), DIGITS);
  assert.deepEqual(card.events.map(event => [event.type, event.bubbles]), [['input', true]]);
  assert.equal(card.clicks(), 0);
  assert.equal(card.run(DIGITS, true), true);
  assert.equal(card.clicks(), 1);
  // The page reset the field, or it holds other digits: nothing is pressed.
  assert.equal(phoneCard(null).run(DIGITS, true), false);
  assert.equal(phoneCard('filled').run(DIGITS, true), false);
  assert.equal(phoneCard('verifying', DIGITS).run(DIGITS, true), false);
});

test('submits the phone digits once, after typing them, and calls beforeSubmit just before the press', async () => {
  const calls = [];
  let typingAsks = 0;
  const f = fixture({ enterPhone: ({ number, digits, submit }) => {
    calls.push([submit ? 'press' : 'type', number, digits]);
    return submit || ++typingAsks >= 3;
  } });
  assert.equal(await f.controller.submitPhoneDigits(DIGITS, 2000, () => calls.push(['before'])), true);
  assert.deepEqual(calls, [['type', NUMBER, DIGITS], ['type', NUMBER, DIGITS], ['type', NUMBER, DIGITS], ['before'], ['press', NUMBER, DIGITS]]);
  assert.equal(await f.controller.submitPhoneDigits(DIGITS, 2000, () => calls.push(['again'])), false);
  assert.equal(calls.length, 5);
  f.controller.dispose();
  let pressed = false;
  const absent = fixture({ enterPhone: ({ submit }) => { pressed ||= submit; return false; } });
  const started = Date.now();
  assert.equal(await absent.controller.submitPhoneDigits(DIGITS, 300, () => { throw new Error('must not submit'); }), false);
  assert.ok(Date.now() - started < 1000);
  assert.equal(pressed, false);
  absent.controller.dispose();
  const failing = fixture({ enterPhone: () => { throw new Error('navigating'); } });
  assert.equal(await failing.controller.submitPhoneDigits(DIGITS, 200), false);
  failing.controller.dispose();
  const disposed = fixture({ enterPhone: () => { throw new Error('must not type'); } });
  disposed.controller.dispose();
  assert.equal(await disposed.controller.submitPhoneDigits(DIGITS, 2000), false);
  const invalid = fixture({ enterPhone: () => { throw new Error('must not type'); } });
  assert.equal(await invalid.controller.submitPhoneDigits('42', 2000), false);
  invalid.controller.dispose();
});

test('skips a phone prompt the page shows before any puzzle, without delaying preparation, once', async () => {
  let asks = 0, shown;
  const skipped = new Promise(resolve => { shown = resolve; });
  const f = fixture({ skipPhone: () => { asks++; if (asks < 3) return false; shown(); return true; } });
  assert.equal(await f.controller.prepare(6000), undefined);
  assert.ok(asks <= 1);
  await skipped;
  await wait(700);
  assert.equal(asks, 3);
  assert.equal(f.stats().moves + f.clicks.length, 0);
  f.controller.dispose();
});

test('stops watching for the phone prompt once the page asks for the number or offers a puzzle', async () => {
  let requested = false, asks = 0;
  const asked = fixture({ skipPhone: () => { asks++; return false; } });
  await asked.controller.prepare(6000, () => requested);
  await wait(400);
  const before = asks;
  requested = true;
  await wait(700);
  assert.ok(before >= 1 && asks <= before + 1);
  asked.controller.dispose();
  let puzzleAsks = 0;
  const puzzle = fixture({ solve: () => new Promise(() => {}), skipPhone: () => { puzzleAsks++; return false; } });
  await puzzle.controller.prepare(6000);
  await puzzle.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  await wait(400);
  const atPuzzle = puzzleAsks;
  await wait(700);
  assert.equal(puzzleAsks, atPuzzle);
  puzzle.controller.dispose();
});

test('maps each icon through the rendered image and refuses incomplete or repeated answers', () => {
  const geometry = { x: 20, y: 50, width: 300, height: 180, scaleX: .5, scaleY: .5 };
  const plan = { points: [{ x: 80, y: 200 }, { x: 440, y: 60 }] };
  assert.deepEqual(swiftxIconClicks(geometry, plan, 2), [{ x: 60, y: 150 }, { x: 240, y: 80 }]);
  for (const points of [[], [plan.points[0]], [plan.points[0], plan.points[0]], [{ x: 600, y: 50 }, plan.points[1]],
    [{ x: 80, y: NaN }, plan.points[1]]]) assert.equal(swiftxIconClicks(geometry, { points }, 2), null);
});

test('reports bound image verification once without its number, digest, images or token', async () => {
  const reports = []; let f, requested = false;
  f = fixture({ onVerification: row => reports.push(row), solve: async () => ({ x: 200 }),
    up: () => f.respond({ verifyOfficialTrackingSlider: { success: true, sliderToken: 'PRIVATE_TOKEN' } }, verifyQuery()) });
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  await f.controller.prepare(6000, () => requested);
  requested = true;
  f.controller.dispose(); f.controller.dispose();
  assert.equal(reports.length, 1);
  const { durationMs, ...row } = reports[0];
  assert.ok(Number.isInteger(durationMs) && durationMs >= 0);
  assert.deepEqual(row, { host: 'swiftx-express.com', puzzleType: 'SLIDER', outcome: 'verified', analysisOutcome: 'unreported', prepared: true,
    attempts: 1, generations: 1, verified: true, trackingRequested: true, pendingReads: 0,
    cancelled: false, timedOut: false });
  for (const value of [NUMBER, digest, 'PRIVATE_TOKEN', 'SYNTHETIC_A', 'data:image']) assert.equal(JSON.stringify(reports).includes(value), false);
});

test('distinguishes unresolved analysis, missing geometry and an unsupported puzzle without logging its data', async () => {
  for (const mode of ['analysis', 'geometry', 'unsupported']) {
    const reports = []; let f;
    f = fixture({ onVerification: row => reports.push(row),
      solve: async () => mode === 'geometry' ? { x: 200 } : null,
      refresh: () => f.respond({ getOfficialTrackingSliderCaptcha: challenge('SYNTHETIC_B', 'ROTATE') }) });
    if (mode === 'geometry') f.page.evaluate = async () => null;
    await f.respond({ getOfficialTrackingSliderCaptcha: challenge('PRIVATE_CAPTCHA', mode === 'unsupported' ? 'PRIVATE_TYPE' : 'SLIDER') });
    await f.controller.prepare(mode === 'unsupported' ? 0 : 8000);
    f.controller.dispose();
    assert.equal(reports.length, 1);
    assert.equal(reports[0].outcome, { analysis: 'analysis_unresolved', geometry: 'geometry_unavailable', unsupported: 'invalid_challenge' }[mode]);
    assert.equal(reports[0].puzzleType, mode === 'unsupported' ? 'other' : 'ROTATE');
    assert.equal(reports[0].attempts, mode === 'unsupported' ? 0 : 2);
    assert.equal(reports[0].verified, false);
    assert.equal(JSON.stringify(reports).includes('PRIVATE'), false);
  }
});

test('reports an unobserved page check safely, leaves clear lookups quiet and closes despite reporter failure', async t => {
  const logs = []; t.mock.method(console, 'warn', value => logs.push(JSON.parse(value)));
  const page = new EventEmitter(), controller = attachSwiftxSlider(page, NUMBER);
  await controller.prepare(0); controller.dispose(); controller.dispose();
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, 'swiftx.verification');
  assert.equal(logs[0].puzzleType, 'none'); assert.equal(logs[0].outcome, 'not_seen');
  assert.equal(logs[0].attempts, 0); assert.equal(logs[0].trackingRequested, false);
  assert.equal(JSON.stringify(logs).includes(NUMBER), false);
  const reports = [], clear = fixture({ onVerification: row => reports.push(row) });
  await clear.controller.prepare(0, () => true); clear.controller.dispose();
  assert.deepEqual(reports, []);
  const unprepared = fixture({ onVerification: row => reports.push(row) });
  unprepared.controller.dispose(); assert.deepEqual(reports, []);
  const earlyImage = fixture({ onVerification: row => reports.push(row) });
  await earlyImage.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  earlyImage.controller.dispose();
  assert.equal(reports[0].prepared, false); assert.equal(reports[0].trackingRequested, null);
  const failed = fixture({ onVerification: () => { throw new Error('PRIVATE'); } });
  await failed.controller.prepare(0);
  failed.controller.dispose();
  assert.equal(failed.page.listenerCount('response'), 0); assert.equal(failed.page.listenerCount('close'), 0);
});

test('clicks the ordered icons through the official UI and requires bound verification', async () => {
  let f;
  const puzzle = { ...challenge('SYNTHETIC_A', 'ICON_CLICK'), clickCount: 2 };
  f = fixture({ geometry: { x: 20, y: 50, width: 300, height: 180, scaleX: .5, scaleY: .5 },
    solve: async () => ({ points: [{ x: 80, y: 200 }, { x: 440, y: 60 }] }),
    click: async count => { if (count === 2) await f.respond({ verifyOfficialTrackingSlider: { success: true, sliderToken: 'SYNTHETIC_TOKEN' } }, verifyQuery()); } });
  await f.respond({ getOfficialTrackingSliderCaptcha: puzzle });
  await f.controller.prepare(6000);
  assert.deepEqual(f.clicks, [{ x: 60, y: 150 }, { x: 240, y: 80 }]);
  assert.equal(f.stats().downs, 0);
  f.controller.dispose();
});

test('stops an icon sequence when the caller cancels between clicks', async () => {
  const stopped = new AbortController();
  const f = fixture({ signal: stopped.signal,
    geometry: { x: 20, y: 50, width: 300, height: 180, scaleX: .5, scaleY: .5 },
    solve: async () => ({ points: [{ x: 80, y: 200 }, { x: 440, y: 60 }] }), click: () => stopped.abort() });
  await f.respond({ getOfficialTrackingSliderCaptcha: { ...challenge('SYNTHETIC_A', 'ICON_CLICK'), clickCount: 2 } });
  await f.controller.prepare(6000);
  assert.equal(f.clicks.length, 1);
  f.controller.dispose();
});

test('maps native puzzle displacement through the page’s scaled slider geometry', () => {
  const drag = swiftxSliderDrag({ x: 30, y: 100, scale: .5, maxKnob: 256, maxImage: 245 }, { x: 245 });
  assert.deepEqual(drag, { x: 30, y: 100, distance: 128 });
  for (const geometry of [null, {}, { x: 0, y: 0, scale: 1, maxKnob: 100, maxImage: 0 }]) assert.equal(swiftxSliderDrag(geometry, { x: 100 }), null);
  assert.equal(swiftxSliderDrag({ x: 0, y: 0, scale: 1, maxKnob: 100, maxImage: 100 }, { x: 1000 }), null);
});

test('does not start image analysis after cancellation', async () => {
  const stopped = new AbortController(); stopped.abort();
  const reports = [];
  assert.equal(await locateSwiftxSlider(challenge(), stopped.signal, 4000, value => reports.push(value)), null);
  assert.deepEqual(reports, ['cancelled']);
  assert.equal(await locateSwiftxSlider(challenge(), new AbortController().signal, 0, value => reports.push(value)), null);
  assert.deepEqual(reports, ['cancelled', 'budget']);
  assert.equal(await locateSwiftxSlider(challenge(), stopped.signal, 4000, () => { throw new Error('PRIVATE'); }), null);
});

test('refreshes an unreadable puzzle only once', async () => {
  let f;
  f = fixture({ refresh: () => f.respond({ getOfficialTrackingSliderCaptcha: challenge('SYNTHETIC_B', 'ROTATE') }) });
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  assert.equal(await f.controller.prepare(8000), undefined);
  assert.deepEqual(f.stats(), { refreshes: 1, moves: 0, downs: 0, ups: 0 });
  f.controller.dispose();
  assert.equal(f.page.listenerCount('response'), 0);
});

test('does not drag a stale generation after image analysis', async () => {
  let f, calls = 0;
  f = fixture({ solve: async () => {
    calls++;
    if (calls === 1) { await f.respond({ getOfficialTrackingSliderCaptcha: challenge('SYNTHETIC_B') }); return { x: 200 }; }
    return null;
  } });
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  await f.controller.prepare(6000);
  assert.equal(calls, 2);
  assert.equal(f.stats().downs, 0);
  f.controller.dispose();
});

test('stops before dragging when the caller cancels during pointer placement', async () => {
  const stopped = new AbortController();
  const f = fixture({ signal: stopped.signal, solve: async () => ({ x: 200 }), move: () => stopped.abort() });
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  await f.controller.prepare(6000);
  assert.equal(f.stats().downs, 0);
  f.controller.dispose();
});

test('uses the official pointer control, then stops once its bound verification succeeds', async () => {
  let f;
  f = fixture({ solve: async () => ({ x: 200 }), up: () => f.respond({ verifyOfficialTrackingSlider: { success: true, sliderToken: 'SYNTHETIC_TOKEN' } }, verifyQuery()) });
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  assert.equal(await f.controller.prepare(6000), undefined);
  assert.deepEqual(f.stats(), { refreshes: 0, moves: 3, downs: 1, ups: 1 });
  f.controller.dispose();
});

test('ignores verification for another number or challenge generation', async () => {
  const f = fixture();
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  for (const request of [verifyQuery('SYNTHETIC_B'), verifyQuery('SYNTHETIC_A', 'OTHER_DIGEST')]) {
    await f.respond({}, request, { status: 429, read: () => { throw new Error('must not read refusal'); } });
  }
  assert.equal(await f.controller.prepare(0), undefined);
  f.controller.dispose();
});

test('preserves a bound verification refusal without reading its body or cookies', async () => {
  const f = fixture();
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  await f.respond({}, verifyQuery(), { status: 429, headers: { 'retry-after': '60', 'set-cookie': 'PRIVATE' }, read: () => { throw new Error('must not read refusal'); } });
  assert.deepEqual(await f.controller.prepare(0), { status: 429, retryAfter: '60' });
  f.controller.dispose();
});

test('preserves an explicit image-fetch rate limit and closes its observer with the page', async () => {
  const f = fixture();
  await f.respond({ getOfficialTrackingSliderCaptcha: { success: false, errorCode: 'SLIDER_FETCH_RATE_LIMITED' } });
  assert.deepEqual(await f.controller.prepare(0), { status: 429 });
  f.page.emit('close');
  assert.equal(f.page.listenerCount('response'), 0);
});

test('an image offered after preparation is solved without blocking the existing Turnstile path', async () => {
  let f, done;
  const finished = new Promise(resolve => { done = resolve; });
  f = fixture({ solve: async () => ({ x: 200 }), up: async () => {
    await f.respond({ verifyOfficialTrackingSlider: { success: true, sliderToken: 'SYNTHETIC_TOKEN' } }, verifyQuery());
    done();
  } });
  assert.equal(await f.controller.prepare(6000), undefined);
  await f.respond({ getOfficialTrackingSliderCaptcha: challenge() });
  await finished;
  assert.equal(f.stats().downs, 1);
  f.controller.dispose();
});

const python = process.env.SWIFTX_SLIDER_PYTHON ?? '/opt/zto-ocr/bin/python';
test('locates synthetic cutouts and image seams and rejects ambiguous images', { skip: !existsSync(python) }, () => {
  execFileSync(python, [fileURLToPath(new URL('./swiftx-slider.test.py', import.meta.url))], {
    timeout: 10_000, stdio: 'pipe', env: { ...process.env, OPENBLAS_NUM_THREADS: '1' },
  });
});
