import { describe, expect, it, vi } from 'vitest';
import { hasDirectHandoffAdapter } from '../../core/catalog/handoff.js';
import { recognitionAskedCarriers } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { TrawlClient } from '../../core/transport/trawl.js';
import { createTracker } from '../../facade/index.js';
import { adapter, OnlogExpressTracker, ONLOG_EXPRESS_API, onlogExpressUrl } from './adapter.js';

const NUMBER = 'AA1029384756', SERVICE = 'https://trawl.invalid';
const body = { sucesso: true, html: `<h3>${NUMBER}</h3><div class="rastreio-wrapper">
<div class="rastreio-item"><div class="texto-rastreio"><span class="position-relative">OBJETO CRIADO</span>03/04/2026 10:01</div></div>
<div class="rastreio-item"><div class="texto-rastreio"><span class="position-relative">ETIQUETA EMITIDA</span>03/04/2026 10:01</div></div>
<div class="rastreio-item active"><div class="texto-rastreio"><span class="position-relative">OBJETO ENTREGUE AO DESTINATÁRIO</span>04/04/2026 14:13</div></div></div>` };
const capture = (data: unknown = body, extra: Record<string, unknown> = {}) => ({ url: ONLOG_EXPRESS_API, status: 200,
  trackingNumberSubmitted: NUMBER, body: JSON.stringify(data), headers: {}, ...extra });
function harness(rows = [capture()], extra: Record<string, unknown> = {}) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ url: onlogExpressUrl(NUMBER),
    html: '', tier: 3, statusCode: 200, cookies: [], capturedResponses: rows, ...extra }), { headers: { 'content-type': 'application/json' } }));
  const environment = { fetcher, recorder: { ...NOOP_RECORDER, step: vi.fn() }, env: {}, browserExecutablePath: null, trawl: new TrawlClient(SERVICE) };
  return { fetcher, environment, tracker: new OnlogExpressTracker(environment) };
}
describe('Onlog guest browser adapter', () => {
  it('leaves a bounded browser attempt inside the consumer recognition budget', async () => {
    const h = harness(); await h.tracker.fetch(NUMBER, { budgetMs: 20000 });
    const requested = JSON.parse(String(h.fetcher.mock.calls[0]![1]!.body));
    expect(requested.maxTimeout).toBeGreaterThanOrEqual(15000);
    expect(requested.maxTimeout).toBeLessThanOrEqual(18000);
  });
  it('uses the supplied transport, a whole-reference URL and one bounded service request', async () => {
    const h = harness(); const r = await h.tracker.fetch(NUMBER);
    expect(r).toMatchObject({ current_stage: 'delivered', last_update: null, last_update_local: '2026-04-04T14:13' });
    expect(r.events).toHaveLength(3); expect(h.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetcher.mock.calls[0]!; expect(String(url)).toBe(`${SERVICE}/scrape`);
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init!.body))).toMatchObject({ url: onlogExpressUrl(NUMBER), skipHttp: true, maxTier: 3,
      captureResponses: [ONLOG_EXPRESS_API] });
    expect(JSON.parse(String(init!.body)).maxTimeout).toBeLessThanOrEqual(60000);
    expect(h.environment.recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'onlog-express', step: 'trawl' }));
  });
  it.each([undefined, NUMBER.slice(0, 8), NUMBER + '1'])('requires the whole submitted reference on each reply', async submitted => {
    await expect(harness([capture(body, { trackingNumberSubmitted: submitted })]).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'schema' });
  });
  it('keeps the latest refusal and respects its rate-limit window', async () => {
    await expect(harness([capture(), capture(null, { status: 429, headers: { 'Retry-After': '120' } })]).tracker.fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 120000 });
    await expect(harness([capture(), capture(null, { status: 403 })]).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'challenge' });
  });
  it('does not treat challenge, malformed, missing capture or generic errors as absent', async () => {
    await expect(harness([capture({ sucesso: false, mensagem: 'Captcha inválido. Tente novamente.' })]).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'challenge' });
    await expect(harness([capture({ sucesso: false, mensagem: 'Erro.' })]).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'indeterminate' });
    await expect(harness([capture(null)]).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'schema' });
    await expect(harness([]).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'challenge', reason: 'verification_unfinished' });
    await expect(harness([], { timings: [{ reason: 'onlog-capture_missing' }] }).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'transport' });
    await expect(harness([capture({ sucesso: false, mensagem: 'Nenhum objeto encontrado na base de dados.' })]).tracker.fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'not_found' });
  });
  it.each([
    [{ error: 'challenge-html' }, 'challenge'], [{ error: 'invalid-json' }, 'schema'], [{ error: 'body-read' }, 'transport'],
    [{ truncated: true }, 'transport'], [{ base64Encoded: true }, 'transport'], [{ status: 404 }, 'transport'],
    [{ status: 500 }, 'indeterminate'],
  ])('keeps captured failures distinct', async (extra, kind) => {
    await expect(harness([capture(body, extra)]).tracker.fetch(NUMBER)).rejects.toMatchObject({ kind });
  });
  it('does no I/O for invalid input, cancellation, inadequate budget or a missing browser', async () => {
    const h = harness(); await expect(h.tracker.fetch('AB1029384756')).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(h.tracker.fetch(NUMBER, { budgetMs: 1000 })).rejects.toMatchObject({ kind: 'budget' });
    const controller = new AbortController(); controller.abort();
    await expect(h.tracker.fetch(NUMBER, { signal: controller.signal })).rejects.toThrow();
    await expect(new OnlogExpressTracker({ ...h.environment, trawl: null }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'challenge' });
    expect(h.fetcher).not.toHaveBeenCalled();
  });
  it('offers only the literal reference family to opt-in browser recognition and named handoffs', async () => {
    expect(detectCarrierMatch(NUMBER)).toMatchObject({ carrier: 'unknown', confidence: 'low' });
    expect(detectCarrierMatch(NUMBER).candidates).toContain('onlog-express');
    expect(recognitionAskedCarriers(NUMBER, { countryHint: 'BR' })).not.toContain('onlog-express');
    expect(recognitionAskedCarriers(NUMBER, { countryHint: 'BR', phase: 'browser' })).toContain('onlog-express');
    for (const other of ['FR1029384756', 'MP1029384756', 'JD1029384756', 'RR123456785BR']) {
      expect(detectCarrierMatch(other).candidates).not.toContain('onlog-express');
      expect(hasDirectHandoffAdapter('onlog-express', other)).toBe(false);
    }
    expect(hasDirectHandoffAdapter('onlog-express', NUMBER)).toBe(true);
    const h = harness(), a = adapter(h.environment); expect(a.recognize).toBeUndefined();
    await expect(a.recognizeWithBrowser!('JD1029384756')).resolves.toMatchObject({ known: false });
    expect(h.fetcher).not.toHaveBeenCalled();
    await expect(a.recognizeWithBrowser!(NUMBER)).resolves.toMatchObject({ known: true });
    const r = await createTracker({ providers: [], trawlUrl: SERVICE, fetcher: h.fetcher }).track({ carrier: 'onlog-express', number: NUMBER });
    expect(r).toMatchObject({ source: 'onlog-express', result: { current_stage: 'delivered' } });
    expect(r.result.events).toHaveLength(3);
    expect(r.result.events.map(event => event.local_time)).toEqual(['2026-04-04T14:13', '2026-04-03T10:01', '2026-04-03T10:01']);
    expect(r.result.events.every(event => !event.time || event.time_zone && event.time_zone_basis)).toBe(true);
  });
});
