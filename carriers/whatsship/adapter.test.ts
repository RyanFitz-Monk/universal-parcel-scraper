import { describe, expect, it, vi } from 'vitest';
import { hasDirectHandoffAdapter } from '../../core/catalog/handoff.js';
import { recognitionAskedCarriers } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { adapter, WhatsShipTracker, whatsShipApiUrl } from './adapter.js';

const NUMBER = 'WS' + '10293847561029384' + 'DL';
const payload = { Item: { OrderNumber: NUMBER, CountryCode: 'US', TrackingStatus: 50, OrderTrackingDetails: [
  { ProcessDate: '2026-08-01T10:00:00', ProcessTimezone: 'UTC+08:00', TrackNodeCode: 'ORDER_CREATION', ProcessContent: 'Shipment information received' },
  { ProcessDate: '2026-08-03T10:00:00', ProcessTimezone: 'UTC-07:00', TrackNodeCode: 'DELIVERED', ProcessContent: 'Delivered' },
] } };
const missing = { error: 'Tracking number not exist!', status: 422 };
function harness(body: unknown = payload, status = 200) {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  const recorder = { ...NOOP_RECORDER, step: vi.fn() };
  const environment = { fetcher, userAgent: 'WhatsShip-test/1', recorder, trawl: null, browserExecutablePath: null, env: {} };
  return { fetcher, recorder, environment, tracker: new WhatsShipTracker(environment) };
}

describe('WhatsShip guest adapter', () => {
  it('uses the supplied bounded transport and keeps the full order reference', async () => {
    const h = harness(), result = await h.tracker.fetch(NUMBER);
    expect(result.current_stage).toBe('delivered');
    expect(result.events).toHaveLength(2);
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetcher.mock.calls[0]!;
    expect(String(url)).toBe(whatsShipApiUrl(NUMBER));
    expect(new URL(String(url)).searchParams.get('tracking_number')).toBe(NUMBER);
    expect(init).toMatchObject({ cache: 'no-store', redirect: 'manual', headers: { Origin: 'https://www.whatsship.com', 'User-Agent': 'WhatsShip-test/1' } });
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(h.recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'whatsship', step: 'direct' }));
  });
  it('offers only the supported reference family to HTTP recognition and handoffs', async () => {
    expect(detectCarrierMatch(NUMBER)).toMatchObject({ carrier: 'unknown', confidence: 'low', candidates: ['whatsship'] });
    expect(recognitionAskedCarriers(NUMBER)).toEqual(['whatsship']);
    expect(hasDirectHandoffAdapter('whatsship', NUMBER)).toBe(true);
    const h = harness(), a = adapter(h.environment);
    for (const other of ['WS123DL', 'WS' + '10293847561029384' + 'US', 'GF1029384756102', 'YT1029384756102938', 'RR123456785CN']) {
      expect(hasDirectHandoffAdapter('whatsship', other)).toBe(false);
      expect(recognitionAskedCarriers(other)).not.toContain('whatsship');
      await expect(a.recognize!(other)).resolves.toEqual({ known: false });
    }
    expect(h.fetcher).not.toHaveBeenCalled();
    await expect(a.recognize!(NUMBER)).resolves.toMatchObject({ known: true, lastActivityAt: '2026-08-03T17:00:00.000Z' });
  });
  it('dispatches through the facade without an opt-in universal provider', async () => {
    const h = harness();
    const result = await createTracker({ providers: [], fetcher: h.fetcher }).track({ carrier: 'whatsship', number: NUMBER });
    expect(result).toMatchObject({ source: 'whatsship', result: { current_stage: 'delivered' } });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('recognizes the exact negative reply without retry', async () => {
    const h = harness(missing, 422);
    await expect(h.tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'not_found' });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
    await expect(adapter(harness(missing, 422).environment).recognize!(NUMBER)).resolves.toEqual({ known: false });
  });
  it.each([
    ['<title>Just a moment</title>', 200, 'challenge'], ['denied', 403, 'challenge'],
    ['denied', 401, 'challenge'], ['<html>maintenance</html>', 200, 'schema'],
    [{}, 404, 'transport'], [{}, 422, 'schema'], [payload, 422, 'schema'],
    [{ error: 'Tracking number not exist!', status: 404 }, 422, 'schema'],
    [{ error: 'Temporarily unavailable', status: 422 }, 422, 'indeterminate'],
    ['', 429, 'rate_limited'], ['', 503, 'maintenance'],
  ])('keeps failed replies distinct and makes no HTTP retry', async (body, status, kind) => {
    const h = harness(body, status);
    await expect(h.tracker.fetch(NUMBER)).rejects.toMatchObject({ kind });
    expect(h.fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries only a network failure inside the original budget', async () => {
    const h = harness();
    h.fetcher.mockRejectedValueOnce(new TypeError('connection reset'));
    await expect(h.tracker.fetch(NUMBER)).resolves.toMatchObject({ current_stage: 'delivered' });
    expect(h.fetcher).toHaveBeenCalledTimes(2);
    expect(h.recorder.step).toHaveBeenCalledWith(expect.objectContaining({ step: 'retry' }));
  });
  it('does no I/O for malformed references, spent budget or cancellation', async () => {
    const h = harness();
    await expect(h.tracker.fetch(NUMBER + '1')).rejects.toMatchObject({ kind: 'invalid_input' });
    await expect(h.tracker.fetch(NUMBER, { budgetMs: 0 })).rejects.toMatchObject({ kind: 'budget' });
    const controller = new AbortController(); controller.abort();
    await expect(h.tracker.fetch(NUMBER, { signal: controller.signal })).rejects.toThrow();
    expect(h.fetcher).not.toHaveBeenCalled();
  });
});
