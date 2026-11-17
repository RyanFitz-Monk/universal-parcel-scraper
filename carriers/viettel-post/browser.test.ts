import { describe, expect, it, vi } from 'vitest';
import type { TrawlClient } from '../../core/transport/trawl.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { ViettelPostTracker } from './adapter.js';
import { fetchViettelPostHistory, VIETTEL_POST_HISTORY_API, viettelPostHistoryUrl } from './browser.js';
import { HISTORY_NUMBER, historyFixture } from './fixtures/history.js';

function service(rows: Record<string, unknown>[]) {
  const scrape = vi.fn().mockResolvedValue({ url: viettelPostHistoryUrl(HISTORY_NUMBER), statusCode: 200, tier: 2, capturedResponses: rows });
  return { scrape } as unknown as TrawlClient;
}
const row = (body: unknown, extra = {}) => ({ url: VIETTEL_POST_HISTORY_API, status: 200,
  trackingNumberSubmitted: HISTORY_NUMBER, headers: {}, body: JSON.stringify(body), error: null,
  truncated: false, base64Encoded: false, ...extra });
const read = (trawl: TrawlClient) => fetchViettelPostHistory(HISTORY_NUMBER, {
  trawl, signal: new AbortController().signal, remainingMs: 95000, legacyReserveMs: 20000 });

describe('Viettel Post verified browser transport', () => {
  it('prefers dated history to the legacy record, binds the capture and routes the whole browser through the configured proxy', async () => {
    const trawl = service([row(historyFixture())]), fetcher = vi.fn<typeof fetch>();
    const result = await new ViettelPostTracker({ trawl, fetcher, browserProxy: 'http://user:private@proxy.invalid:8080' }).fetch(HISTORY_NUMBER);
    expect(result.current_stage).toBe('delivered'); expect(result.events).toHaveLength(8); expect(fetcher).not.toHaveBeenCalled();
    expect(trawl.scrape).toHaveBeenCalledWith(expect.objectContaining({ url: viettelPostHistoryUrl(HISTORY_NUMBER),
      proxy: 'http://user:private@proxy.invalid:8080', skipHttp: true, maxTimeout: expect.any(Number), captureResponses: [VIETTEL_POST_HISTORY_API] }),
    expect.objectContaining({ requireSolved: false, signal: expect.any(AbortSignal) }));
    const [request] = vi.mocked(trawl.scrape).mock.calls[0]!;
    expect(request.maxTimeout).toBeLessThanOrEqual(60000); expect(request.maxTimeout).toBeGreaterThan(59000);
  });

  it('retains a refused reply before a successful automatic verification retry', async () => {
    const trawl = service([row({ status: 201, error: true, message: 'captcha rejected' }), row(historyFixture())]);
    await expect(read(trawl)).resolves.toMatchObject({ current_stage: 'delivered' });
    const lastRefused = service([row(historyFixture()), row({ status: 201, error: true, message: 'captcha rejected' })]);
    await expect(read(lastRefused)).rejects.toMatchObject({ kind: 'challenge' });
  });

  it('does not turn hidden echoes, truncated captures, block pages or changed schemas into missing parcels', async () => {
    const hidden = historyFixture(); hidden.data[0]!.SHOW_ORDER = false;
    for (const [entry, kind] of [[row(hidden), 'indeterminate'], [row(historyFixture(), { truncated: true }), 'transport'],
      [row(null, { error: 'challenge-html' }), 'challenge'], [row({ changed: true }), 'schema'],
      [row(historyFixture(), { trackingNumberSubmitted: 'WRONG' }), 'schema']] as const) {
      await expect(read(service([entry]))).rejects.toMatchObject({ kind });
    }
    await expect(read(service([row(null, { status: 429, headers: { 'retry-after': '120' } })])))
      .rejects.toMatchObject({ kind: 'rate_limited', retryAfterMs: 120000 });
  });

  it('says when the form went out and its reply never came back', async () => {
    const helper = (reason: string) => ({ scrape: vi.fn().mockResolvedValue({ url: viettelPostHistoryUrl(HISTORY_NUMBER), statusCode: 200,
      tier: 2, capturedResponses: [], raw: { timings: [{ reason }] } }) } as unknown as TrawlClient);
    await expect(read(helper('viettel-post-capture_missing'))).rejects.toMatchObject({ kind: 'transport', reason: 'capture_missing' });
    const broken: unknown = await read(helper('viettel-post-runtime')).catch((error: unknown) => error);
    expect(broken).toMatchObject({ kind: 'transport' });
    expect(broken).not.toHaveProperty('reason', 'capture_missing');
  });

  it('falls back to the partial legacy record after verification failure, preserving the runner provenance', async () => {
    const trawl = service([row(null, { status: 403 })]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ status: 200, error: false, data: {
      id: '00000000-0000-4000-8000-000000000001', captcha: 'data:image/png;base64,QUJD' } }))
      .mockResolvedValueOnce(Response.json({ status: 200, error: false, data: [{ MA_KIEN: HISTORY_NUMBER, MA_TRANGTHAI: 2,
        TIME_TRANGTHAI: '06/04/2026 08:31', GHI_CHU: 'Nhập phiếu gửi', DICH_VU: 'Synthetic' }] }));
    const recorder = { ...NOOP_RECORDER, step: vi.fn() };
    await expect(new ViettelPostTracker({ trawl, fetcher, recorder, solveCaptcha: async () => 'aB12' }).fetch(HISTORY_NUMBER))
      .resolves.toMatchObject({ summary_only: true });
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ step: 'direct', fallbackFrom: 'trawl', fallbackReason: 'challenge' }));
  });

  it('does not start a browser for a short caller budget or an already cancelled lookup', async () => {
    const trawl = service([]), cancelled = new AbortController(); cancelled.abort(new Error('Stopped'));
    await expect(new ViettelPostTracker({ trawl }).fetch(HISTORY_NUMBER, { signal: cancelled.signal })).rejects.toThrow('Stopped');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ changed: true }));
    await expect(new ViettelPostTracker({ trawl, fetcher }).fetch(HISTORY_NUMBER, { budgetMs: 1000 })).rejects.toMatchObject({ kind: 'challenge' });
    expect(trawl.scrape).not.toHaveBeenCalled();
  });
});
