import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { AaaCooperTracker, AAA_COOPER_ENDPOINT } from './adapter.js';
import { aaaCooperForm, aaaCooperPost } from './form.js';
import { parseAaaCooper } from './parser.js';
import { aaaCooperConsensus } from './ocr-consensus.mjs';

const worker = vi.hoisted(() => ({
  calls: 0, constructed: 0, closed: 0, active: 0, maxActive: 0, failClose: false, images: [] as Uint8Array[],
  solve: async (_bytes: Uint8Array, signal: AbortSignal) => { signal.throwIfAborted(); return '123456'; },
}));
vi.mock('./ocr.js', () => ({ AaaCooperOcr: class {
  private active = false;
  constructor() { worker.constructed++; }
  async solve(bytes: Uint8Array, signal: AbortSignal) {
    if (!this.active) { this.active = true; worker.active++; worker.maxActive = Math.max(worker.maxActive, worker.active); }
    worker.calls++; worker.images.push(bytes); return worker.solve(bytes, signal);
  }
  close() { worker.closed++; if (this.active) worker.active--; return worker.failClose ? Promise.reject(new Error('synthetic close failure')) : Promise.resolve(); }
} }));

const page = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
const delivered = page('delivered'), captcha = page('captcha'), absent = page('not-found'), pending = page('pending');
const NUMBER = load(delivered)('[id$="_lblProNumber"]').text().trim();
const QUERY_URL = `${AAA_COOPER_ENDPOINT}?${new URLSearchParams({ ProNum: NUMBER })}`;
const ID = 'AAACooperMasterPage_bodyContent_', TSM = 'AAACooperMasterPage_ACTScriptManager_TSM';
const SCRIPT = "var hf = window.__TsmHiddenField; hf.value += 'synthetic-resource-list';";
let clock = 0;
function form(puzzle = 'first', options: { rejected?: boolean; hidden?: boolean; action?: string; scriptState?: string } = {}) {
  const $ = load(captcha), f = $('form'); f.attr('action', options.action ?? QUERY_URL);
  $(`#${ID}trTimedButton`).attr('style', options.hidden ? 'display:none' : 'display:block');
  $(`img#${ID}RadCaptcha1_CaptchaImageUP`).attr('src', '/pwb/Telerik.Web.UI.WebResource.axd?'+new URLSearchParams({ type: 'rca', isc: 'false', guid: `synthetic-${puzzle}` }).toString());
  f.prepend('<input type="hidden" name="__VIEWSTATEFIELDCOUNT" value="3"><input type="hidden" name="__VIEWSTATE" value="state-first"><input type="hidden" name="__VIEWSTATE1" value="state-second"><input type="hidden" name="__VIEWSTATE2" value="state-third"><input type="hidden" name="__VIEWSTATEGENERATOR" value="ABCDEF12"><input type="hidden" name="__EVENTVALIDATION" value="validation">');
  f.prepend($('<input>').attr({ type: 'hidden', name: TSM, value: options.scriptState ?? '' }));
  f.append($('<script>').attr('src', '/pwb/Telerik.Web.UI.WebResource.axd?'+new URLSearchParams({ _TSM_HiddenField_: TSM, _TSM_CombinedScripts_: 'synthetic-bundle' }).toString()));
  if (options.rejected) { $(`#${ID}RadCaptcha1`).addClass('rcInvalid'); $(`#${ID}ErrorPanel`).append('<span>The code you entered is not valid</span>'); }
  return $.html();
}
const reply = (body: string | Uint8Array<ArrayBuffer>, status = 200, headers: Record<string, string> = {}) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
interface RouteOptions {
  entry?: string; fresh?: string; final?: string; imageAgeMs?: number;
  post?: (body: URLSearchParams, index: number, init: RequestInit) => Response | Promise<Response>;
  image?: (init: RequestInit) => Response | Promise<Response>;
  script?: string;
}
function route(options: RouteOptions = {}) {
  const state = { gets: 0, images: 0, scripts: 0, posts: [] as URLSearchParams[], cookies: [] as string[], methods: [] as string[] };
  const fetcher = vi.fn<typeof fetch>(async (input, init = {}) => {
    const u = new globalThis.URL(String(input)); state.methods.push(init.method ?? 'GET');
    let r: Response;
    if (u.pathname.endsWith('Telerik.Web.UI.WebResource.axd')) {
      if (u.searchParams.get('type') === 'rca') {
        state.images++; clock += options.imageAgeMs ?? 4500;
        r = await (options.image?.(init) ?? reply(new Uint8Array([255, 216, 255, 217]), 200, { 'content-type': 'image/jpeg' }));
      } else { state.scripts++; r = reply(options.script ?? SCRIPT, 200, { 'content-type': 'application/javascript' }); }
    } else {
      expect(String(input) === QUERY_URL).toBe(true);
      if (init.method === 'POST') {
        const body = new URLSearchParams(String(init.body)); state.posts.push(body); state.cookies.push(new Headers(init.headers).get('cookie') ?? '');
        r = await (options.post?.(body, state.posts.length, init) ?? reply('', 302, { location: QUERY_URL }));
      } else {
        state.gets++; state.cookies.push(new Headers(init.headers).get('cookie') ?? '');
        r = reply(state.gets === 1 ? options.entry ?? form() : options.fresh ?? options.final ?? delivered, 200, { 'set-cookie': 'ASP.NET_SessionId=synthetic-session; Path=/; HttpOnly' });
      }
    }
    Object.defineProperty(r, 'url', { value: String(input) }); return r;
  });
  return { state, fetcher };
}
const track = (fetcher: typeof fetch, budgetMs = 60000, signal?: AbortSignal) => new AaaCooperTracker({ fetcher }).fetch(NUMBER, { budgetMs, signal });

beforeEach(() => {
  clock = 0; vi.spyOn(performance, 'now').mockImplementation(() => clock);
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('Offline suite forbids global network'); }));
  Object.assign(worker, { calls: 0, constructed: 0, closed: 0, active: 0, maxActive: 0, failClose: false, images: [], solve: async () => '123456' });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('AAA Cooper native challenge recovery', () => {
  it('keeps an ordinary positive to one supplied GET without a worker or session reuse', async () => {
    const r = route({ entry: delivered }), tracker = new AaaCooperTracker({ fetcher: r.fetcher });
    await expect(tracker.fetch(NUMBER)).resolves.toMatchObject({ status: 'delivered' });
    await expect(tracker.fetch(NUMBER)).resolves.toMatchObject({ status: 'delivered' });
    expect(r.fetcher).toHaveBeenCalledTimes(2); expect(r.state.posts).toHaveLength(0); expect(worker.constructed).toBe(0);
    expect(r.state.cookies.every(cookie => !cookie)).toBe(true);
  });
  it('retains the direct connection retry before recovery and never retries an HTTP refusal', async () => {
    const r = route({ entry: delivered }), flaky = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed')).mockImplementation(r.fetcher);
    await expect(track(flaky)).resolves.toMatchObject({ status: 'delivered' }); expect(flaky).toHaveBeenCalledTimes(2);
    for (const [status, kind] of [[403, 'challenge'], [429, 'rate_limited'], [404, 'transport'], [500, 'indeterminate'], [503, 'maintenance']] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply('', status));
      await expect(track(fetcher)).rejects.toMatchObject({ kind }); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    expect(worker.constructed).toBe(0);
  });
  it('keeps hidden validators, native rejections, missing shipments and pending notices distinct', async () => {
    await expect(track(route({ entry: absent }).fetcher)).rejects.toMatchObject({ name: 'NotFoundError', kind: 'not_found' });
    await expect(track(route({ entry: pending }).fetcher)).rejects.toMatchObject({ name: 'NoHistoryError', kind: 'indeterminate', reason: 'listed' });
    const hidden = form('hidden', { hidden: true, rejected: true });
    await expect(track(route({ entry: hidden }).fetcher)).rejects.toMatchObject({ kind: 'challenge' });
    const blocked = route({ entry: '<html><title>Access Denied</title></html>' });
    await expect(track(blocked.fetcher)).rejects.toMatchObject({ kind: 'challenge' });
    expect(worker.constructed).toBe(0);
  });
  it('submits exact current form state with native cookies and follows only its whole redirect', async () => {
    const r = route(), recorder = { ...NOOP_RECORDER, step: vi.fn() };
    const result = await new AaaCooperTracker({ fetcher: r.fetcher, recorder, userAgent: 'SyntheticHost/1.0' }).fetch(NUMBER, { budgetMs: 60000 });
    expect(result.status).toBe('delivered'); expect(result.events).toHaveLength(10);
    expect(r.state.posts).toHaveLength(1); expect(r.state.images).toBe(1); expect(r.state.scripts).toBe(1); expect(r.state.gets).toBe(2);
    const body = r.state.posts[0]!;
    expect(body.get('__VIEWSTATEFIELDCOUNT')).toBe('3'); expect(body.get('__VIEWSTATE2')).toBe('state-third'); expect(body.get('__EVENTVALIDATION')).toBe('validation');
    expect(body.get(TSM)).toBe('synthetic-resource-list'); expect(body.get(`${ID}RadCaptcha1_ClientState`)).toBe('');
    expect(body.getAll('AAACooperMasterPage$bodyContent$btnSubmit')).toHaveLength(1);
    expect(r.state.cookies.some(cookie => cookie.includes('ASP.NET_SessionId=synthetic-session'))).toBe(true);
    expect(worker.closed).toBe(1); expect(worker.images.every(bytes => bytes.every(value => value === 0))).toBe(true);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ step: 'captcha', outcome: 'ok', fallbackFrom: 'direct', fallbackReason: 'challenge' }));
  });
  it('guards every identity and state condition before image or model work', async () => {
    const different = new globalThis.URL(QUERY_URL); different.searchParams.set('ProNum', '00000000');
    const wrong = route({ entry: form('wrong', { action: different.href }) });
    await expect(track(wrong.fetcher)).rejects.toMatchObject({ kind: 'schema', diagnostics: { actionWholeQueryBound: false } });
    const $ = load(form()); $('[name="__VIEWSTATE1"]').remove();
    const incomplete = route({ entry: $.html() });
    await expect(track(incomplete.fetcher)).rejects.toMatchObject({ kind: 'challenge', diagnostics: { viewstateComplete: false } });
    $('[id$="_CaptchaTextBox"]').remove();
    await expect(track(route({ entry: $.html() }).fetcher)).rejects.toMatchObject({ kind: 'challenge', diagnostics: { answerCount: 0 } });
    expect(wrong.state.images + incomplete.state.images).toBe(0); expect(worker.constructed).toBe(0);
  });
  it('keeps native successful controls and excludes disabled or unclicked submits', () => {
    const $ = load(form()); $('form').append('<input name="plain" value="value"><input name="disabled" value="secret" disabled><input type="checkbox" name="off" value="no"><input type="submit" name="other" value="no"><button name="implicitSubmit">no</button>');
    const body = aaaCooperPost(aaaCooperForm($.html(), QUERY_URL), '123456', 'state');
    expect(body.get('plain')).toBe('value'); expect(body.has('disabled') || body.has('off') || body.has('other') || body.has('implicitSubmit')).toBe(false);
    $('form').append('<input name="recipientPhone" value="">');
    expect(() => aaaCooperForm($.html(), QUERY_URL)).toThrow(expect.objectContaining({ kind: 'challenge', diagnostics: expect.objectContaining({ separateAccessRequirement: true }) }));
  });
  it('does not fetch a foreign script or read an image before state is available', async () => {
    const $ = load(form()); $('script').attr('src', 'https://other.invalid/Telerik.Web.UI.WebResource.axd?_TSM_CombinedScripts_=x');
    const r = route({ entry: $.html() }); await expect(track(r.fetcher)).rejects.toMatchObject({ kind: 'challenge', diagnostics: { scriptResourceBound: false } });
    expect(r.fetcher).toHaveBeenCalledTimes(1); expect(worker.calls).toBe(0);
    await expect(track(route({ script: '<html>changed</html>' }).fetcher)).rejects.toMatchObject({ kind: 'challenge', diagnostics: { hiddenFieldBindingPresent: false } });
  });
  it('uses server-filled script-manager state without a resource request', async () => {
    const r = route({ entry: form('filled', { scriptState: 'server-filled-state' }) });
    await expect(track(r.fetcher)).resolves.toMatchObject({ status: 'delivered' }); expect(r.state.scripts).toBe(0); expect(r.state.posts[0]!.get(TSM)).toBe('server-filled-state');
  });
  it('caps fresh puzzles and native submissions at two after explicit rejections', async () => {
    const r = route({ post: (_body, i) => reply(form('rejected-'+i, { rejected: true })) });
    await expect(track(r.fetcher)).rejects.toMatchObject({ kind: 'challenge' });
    expect(r.state.images).toBe(2); expect(r.state.posts).toHaveLength(2); expect(r.state.gets).toBe(1); expect(worker.calls).toBe(2); expect(worker.closed).toBe(1);
  });
  it('does not solve a repeated puzzle even when the server repeats it after a fresh bound GET', async () => {
    const r = route({ post: () => reply(form('first', { rejected: true })), fresh: form('first') });
    await expect(track(r.fetcher)).rejects.toMatchObject({ kind: 'challenge' });
    expect(r.state.images).toBe(1); expect(r.state.posts).toHaveLength(1); expect(r.state.gets).toBe(2);
  });
  it('refreshes once after OCR abstention and submits only a fresh agreed puzzle', async () => {
    let calls = 0; worker.solve = async () => ++calls === 1 ? '' : '123456';
    const r = route({ fresh: form('second'), post: () => reply(delivered) });
    await expect(track(r.fetcher)).resolves.toMatchObject({ status: 'delivered' });
    expect(r.state.images).toBe(2); expect(r.state.posts).toHaveLength(1); expect(r.state.gets).toBe(2);
  });
  it('returns a fresh explicit missing notice after abstention as not_found', async () => {
    worker.solve = async () => ''; const r = route({ fresh: absent });
    await expect(track(r.fetcher)).rejects.toMatchObject({ kind: 'not_found' }); expect(r.state.posts).toHaveLength(0); expect(r.state.images).toBe(1);
  });
  it('retains malformed final history, missing notices and wrong redirects as their own failures', async () => {
    const wrong = load(delivered); wrong('[id$="_lblProNumber"]').text('00000000');
    await expect(track(route({ final: wrong.html() }).fetcher)).rejects.toMatchObject({ kind: 'schema' });
    await expect(track(route({ final: absent }).fetcher)).rejects.toMatchObject({ kind: 'not_found' });
    const r = route({ post: () => reply('', 302, { location: '/pwb/Default.aspx' }) });
    await expect(track(r.fetcher)).rejects.toMatchObject({ kind: 'schema' }); expect(r.state.gets).toBe(1); expect(r.state.posts).toHaveLength(1);
  });
  it('never retries a failed POST and omits its state from network error diagnostics', async () => {
    const r = route({ post: () => { throw new TypeError('synthetic network failure'); } });
    let error: unknown; try { await track(r.fetcher); } catch (e) { error = e; }
    expect(error).toMatchObject({ kind: 'transport' }); expect(r.state.posts).toHaveLength(1); expect(worker.closed).toBe(1);
    expect(JSON.stringify(error).includes('__VIEWSTATE')).toBe(false);
  });
  it('retains rate limits and their retry window after a submission', async () => {
    const r = route({ post: () => reply('', 429, { 'retry-after': '7' }) });
    await expect(track(r.fetcher)).rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 7000 }); expect(r.state.posts).toHaveLength(1);
  });
  it('rejects oversized or HTML images before model work', async () => {
    for (const [response, kind] of [[reply(new Uint8Array(65537), 200, { 'content-type': 'image/jpeg' }), 'indeterminate'], [reply('<html>blocked</html>'), 'challenge']] as const) {
      const r = route({ image: () => response }); await expect(track(r.fetcher)).rejects.toMatchObject({ kind }); expect(r.state.posts).toHaveLength(0);
    }
    expect(worker.calls).toBe(0);
  });
  it('does not start OCR when the cleanup reserve leaves too little time', async () => {
    const r = route({ imageAgeMs: 9000 });
    await expect(track(r.fetcher, 10000)).rejects.toMatchObject({ kind: 'budget' }); expect(worker.constructed).toBe(0); expect(r.state.posts).toHaveLength(0);
  });
  it('does not submit before the form-age guard can fit in the remaining budget', async () => {
    const r = route({ imageAgeMs: 0 }); await expect(track(r.fetcher, 3000)).rejects.toMatchObject({ kind: 'budget' });
    expect(r.state.posts).toHaveLength(0); expect(worker.closed).toBe(1);
  });
  it('preserves caller cancellation during OCR and always zeroes bytes and closes its worker', async () => {
    const controller = new AbortController(), reason = new Error('synthetic cancellation');
    worker.solve = async (_bytes, signal) => { queueMicrotask(() => controller.abort(reason)); return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); };
    const r = route(); await expect(track(r.fetcher, 60000, controller.signal)).rejects.toBe(reason);
    expect(r.state.posts).toHaveLength(0); expect(worker.closed).toBe(1); expect(worker.images.every(bytes => bytes.every(value => value === 0))).toBe(true);
  });
  it('leaves an explicit rejection as challenge even when a missing notice appears beside it', () => {
    const $ = load(form('invalid', { rejected: true })); $(`#${ID}ErrorPanel .ErrorText`).text('PRO NOT FOUND IN SYSTEM');
    expect(() => parseAaaCooper($.html(), NUMBER)).toThrow(expect.objectContaining({ kind: 'challenge' }));
    expect(() => parseAaaCooper(absent, NUMBER)).toThrow(expect.objectContaining({ kind: 'not_found' }));
  });
  it('allows concurrent direct reads but caps active OCR recovery at one per tracker', async () => {
    let entry = 0, release: (() => void) | undefined;
    worker.solve = async () => { if (worker.calls === 1) await new Promise<void>(resolve => { release = resolve; }); return '123456'; };
    const fetcher = vi.fn<typeof fetch>(async (input, init = {}) => {
      const u = new globalThis.URL(String(input)); let r: Response;
      if (u.pathname.endsWith('Telerik.Web.UI.WebResource.axd')) {
        if (u.searchParams.get('type') === 'rca') { clock += 4500; r = reply(new Uint8Array([255, 216, 255, 217]), 200, { 'content-type': 'image/jpeg' }); }
        else r = reply(SCRIPT);
      } else if (init.method === 'POST') r = reply(delivered);
      else { entry++; r = reply(form(), 200, { 'set-cookie': `ASP.NET_SessionId=synthetic-session-${entry}; Path=/; HttpOnly` }); }
      Object.defineProperty(r, 'url', { value: String(input) }); return r;
    });
    const tracker = new AaaCooperTracker({ fetcher });
    const first = tracker.fetch(NUMBER, { budgetMs: 60000 }), second = tracker.fetch(NUMBER, { budgetMs: 60000 });
    await vi.waitFor(() => expect(worker.calls).toBe(1));
    expect(entry).toBe(2); expect(worker.constructed).toBe(1); release!();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(worker.maxActive).toBe(1); expect(worker.closed).toBe(2); expect(worker.calls).toBe(2);
  });
  it('keeps a rate limit when OCR cleanup fails and reports cleanup failure after a successful reply', async () => {
    worker.failClose = true;
    await expect(track(route({ post: () => reply('', 429) }).fetcher)).rejects.toMatchObject({ kind: 'rate_limited' });
    await expect(track(route().fetcher)).rejects.toMatchObject({ kind: 'transport' });
    expect(worker.closed).toBe(2);
  });
  it('spends its OCR operation budget before the cleanup reserve and releases the worker', async () => {
    worker.solve = async (_bytes, signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    const r = route({ imageAgeMs: 0 });
    await expect(track(r.fetcher, 2000)).rejects.toMatchObject({ kind: 'budget' });
    expect(worker.calls).toBe(1); expect(worker.closed).toBe(1); expect(r.state.posts).toHaveLength(0);
    expect(worker.images.every(bytes => bytes.every(value => value === 0))).toBe(true);
  });
  it('loads the module-relative native worker and rejects synthetic wrong dimensions without inference', async () => {
    const { AaaCooperOcr } = await vi.importActual<typeof import('./ocr.js')>('./ocr.js');
    const sharp = (await import('sharp')).default;
    const bytes = await sharp({ create: { width: 179, height: 50, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const ocr = new AaaCooperOcr();
    try { await expect(ocr.solve(bytes, AbortSignal.timeout(3000))).rejects.toMatchObject({ kind: 'challenge' }); }
    finally { bytes.fill(0); await ocr.close(); }
  });
  it('accepts only six-digit agreement across the three uncropped transforms', () => {
    expect(aaaCooperConsensus(['123456', '123456', '123456'])).toBe('123456');
    for (const answers of [['123456', '123457', '123456'], ['a1b2c3', 'a1b2c3', 'a1b2c3'], ['12345', '12345', '12345'], ['123456', '123456']]) expect(aaaCooperConsensus(answers)).toBe('');
  });
});
