import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { AdapterEnvironment } from '../../core/adapter/index.js';
import type { TrawlClient } from '../../core/transport/index.js';
import { adapter, FlashCourierTracker, flashCourierApi, normalizeFlashCourierNumber, parseFlashCourier } from './adapter.js';
const N = 'SYNTHETIC123', url = 'https://www.flashcourier.com.br/rastreio/' + N;
const history = (extra = {}) => ({ kind: 'history', success: true, number: N, primaryNumber: '12345678901', customerReference: N,
  summary: 'Pedido entregue', events: [ { status: 'Aguardando Postagem', clock: '01/08/2026 08:00:00' },
    { status: 'Entrega efetuada com sucesso', clock: '07/08/2026 08:57:50' } ], ...extra });
const capture = (body = history(), extra = {}) => ({ url: flashCourierApi(N), status: 200, headers: {}, body: JSON.stringify(body), trackingNumberSubmitted: N, ...extra });
const response = (extra = {}) => ({ tier: 3, url, statusCode: 200, html: JSON.stringify({ protocol: 'flash-courier-guest-v1', requestedNumber: N, diagnostic: null }), capturedResponses: [capture()], raw: {}, ...extra });
const mock = (page = response()) => { const scrape = vi.fn().mockResolvedValue(page); return { scrape, tracker: new FlashCourierTracker({ trawl: { scrape } as unknown as TrawlClient }) }; };

describe('Flash Courier projected history', () => {
  it('binds a labelled sender reference, preserves local clocks and maps newest wording', () => {
    const r = parseFlashCourier(history(), N);
    expect(r).toMatchObject({ status: 'delivered', current_stage: 'delivered', last_update: null });
    expect(r.events?.[0]).toEqual({ local_time: '2026-08-07T08:57:50', description: 'Entrega efetuada com sucesso', stage: 'delivered', stage_source: 'carrier_map' });
    expect(r.delivered_at).toBeUndefined();
  });
  it('parses the attributed public native projection without copying personal fields', () => {
    const value = JSON.parse(readFileSync(new URL('./fixtures/tracking.json', import.meta.url), 'utf8'));
    const r = parseFlashCourier(value, value.number);
    expect(r.events).toHaveLength(10); expect(r.status).toBe('delivered');
    expect(r.events!.every(e => e.local_time && !e.time && !e.time_zone)).toBe(true);
  });
  it.each([history({ number: 'OTHER' }), history({ customerReference: 'OTHER' }), history({ success: false }), history({ primaryNumber: '../OTHER' }), history({ events: [{ status: 'Delivered', clock: '31/02/2026 08:00:00' }] }), history({ events: [{ status: 'Delivered', clock: '01/02/2026 24:00:00' }] })])('rejects mismatched identity and malformed dates', value => {
    expect(() => parseFlashCourier(value, N)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });
  it.each(['ambiguous', 'unconfirmed', 'empty_history'])('keeps %s inconclusive', kind => {
    expect(() => parseFlashCourier({ kind, number: N }, N)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
  });
  it('uses only explicit bound missing results and preserves CAPTCHA refusal', () => {
    expect(() => parseFlashCourier({ kind: 'not_found', number: N }, N)).toThrow(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseFlashCourier({ kind: 'not_found', number: 'OTHER' }, N)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseFlashCourier({ kind: 'captcha_refused' }, N)).toThrow(expect.objectContaining({ kind: 'challenge' }));
  });
  it('does not inherit an older delivery for an unknown newest scan or summary', () => {
    const r = parseFlashCourier(history({ events: [...history().events, { status: 'NOVA SITUAÇÃO', clock: '08/08/2026 08:00:00' }] }), N);
    expect(r.status).toBe('unknown'); expect(r.current_stage).toBeUndefined();
  });
  it('accepts sender references without broad issuer claims and rejects punctuation rather than altering identity', () => {
    expect(normalizeFlashCourierNumber(' synthetic123 ')).toBe(N);
    for (const s of ['', 'A'.repeat(21), 'ABC-123', 'https://example.test']) expect(() => normalizeFlashCourierNumber(s)).toThrow(expect.objectContaining({ kind: 'invalid_input' }));
  });
});

describe('Flash Courier service boundary', () => {
  it('uses the supplied transport and preserves whole scope/budget', async () => {
    const { tracker, scrape } = mock(); await tracker.fetch(N);
    expect(scrape.mock.calls[0]?.[0]).toMatchObject({ url, skipHttp: true, maxTier: 3, captureResponses: [flashCourierApi(N)] });
    expect(scrape.mock.calls[0]?.[0].maxTimeout).toBeLessThanOrEqual(40_000);
  });
  it.each([[429, 'rate_limited'], [403, 'challenge'], [500, 'indeterminate'], [404, 'transport']] as const)('preserves HTTP%s on a newer generation', async (status, kind) => {
    const meta = { protocol: 'flash-courier-guest-v1', requestedNumber: N, diagnostic: { kind: 'http', status, retryAfter: '60' } };
    await expect(mock(response({ html: JSON.stringify(meta), capturedResponses: [capture({ kind: 'captcha_refused' } as never, { status: 422 })] })).tracker.fetch(N)).rejects.toMatchObject({ kind, ...(status === 429 ? { retryAfterMs: 60000 } : { status }) });
  });
  it('takes final recovered history while retaining earlier refused capture', async () => {
    const page = response({ capturedResponses: [capture({ kind: 'captcha_refused' } as never, { status: 422 }), capture()] });
    expect((await mock(page).tracker.fetch(N)).events).toHaveLength(2);
  });
  it.each([response({ url: url + '2' }), response({ html: '{}' }), response({ capturedResponses: [capture(history(), { trackingNumberSubmitted: 'OTHER' })] }), response({ capturedResponses: [capture(history(), { url: flashCourierApi(N + '2') })] }), response({ capturedResponses: [capture(history(), { body: '{' })] })])('rejects redirect/capture/metadata/JSON drift', async page => {
    await expect(mock(page).tracker.fetch(N)).rejects.toMatchObject({ kind: 'schema' });
  });
  it('preserves cancellation and refuses insufficient budget or absent service', async () => {
    const { tracker, scrape } = mock();
    await expect(tracker.fetch(N, { signal: AbortSignal.abort() })).rejects.toBeDefined();
    await expect(tracker.fetch(N, { budgetMs: 1 })).rejects.toMatchObject({ kind: 'budget' });
    expect(scrape).not.toHaveBeenCalled();
    await expect(new FlashCourierTracker({ trawl: null }).fetch(N)).rejects.toMatchObject({ kind: 'challenge' });
  });
  it('exposes opt-in browser recognition with confirmed-history reuse, never HTTP recognition', async () => {
    const { scrape } = mock(), a = adapter({ trawl: { scrape } } as unknown as AdapterEnvironment);
    expect(a.recognize).toBeUndefined(); expect(await a.recognizeWithBrowser!(N)).toMatchObject({ known: true });
  });
});
