import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hasDirectHandoffAdapter } from '../../core/catalog/handoff.js';
import { recognitionCandidates } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { createTracker } from '../../facade/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { TciFreightTracker } from './adapter.js';
import { normalizeTciFreightNumber, parseTciFreight, TCI_FREIGHT_ENDPOINT, tciFreightJson } from './parser.js';
import { statusMap } from './status.js';

const NUMBER = '246813579';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/history.json', import.meta.url), 'utf8'));
const changed = (edit: (data: ReturnType<typeof fixture>) => void) => { const data = fixture(); edit(data); return data; };
const response = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(data), { status, headers });

describe('TCI Freight guest adapter', () => {
  it('uses only the Freight division, whole reference, supplied transport and caller budget', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const recorder = { ...NOOP_RECORDER, step: vi.fn() };
    const result = await new TciFreightTracker({ fetcher, recorder, userAgent: 'SyntheticHost/1' }).fetch(` ${NUMBER} `, { budgetMs: 4000 });
    expect(result.events).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(TCI_FREIGHT_ENDPOINT);
    expect(JSON.parse(String(init!.body))).toEqual({ CnsNo: NUMBER, DivisionCode: '1' });
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', signal: expect.any(AbortSignal), headers: {
      Authorization: 'Bearer null', 'User-Agent': 'SyntheticHost/1', Origin: 'https://aerp.tcifreight.in',
    } });
    expect(new Headers(init!.headers).has('cookie')).toBe(false);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'tci-freight', step: 'direct', outcome: 'ok' }));
  });

  it('preserves displayed days, source ordering within a day and excludes sort clocks and private fields', () => {
    const data = fixture(); data.shipmentTrackingS4_DATAs.push(data.shipmentTrackingS4_DATAs[0]);
    const result = parseTciFreight(data, NUMBER);
    expect(result).toMatchObject({ current_stage: 'in_transit', last_update: null, last_update_local: '2026-01-04' });
    expect(result.events).toHaveLength(3);
    expect(result.events!.map(event => event.local_time)).toEqual(['2026-01-04', '2026-01-02', '2026-01-01']);
    expect(result.events!.map(event => event.stage)).toEqual(['in_transit', 'in_transit', 'accepted']);
    expect(result.events!.every(event => !event.time && event.stage_source === 'carrier_map')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|13:14:15|POD|CSH_NUMBER|LORRY/);
  });

  it('rejects missing, mixed or mismatched summary and dispatch identities', () => {
    for (const data of [changed(d => { d.shipmentTrackingS1_DATAs[0].CNS_NO = '135792468'; }),
      changed(d => { d.shipmentTrackingS1_DATAs.push(d.shipmentTrackingS1_DATAs[0]); }),
      changed(d => { d.disInfo2[0].cns_cns_no = '135792468'; }), changed(d => { d.disInfo2 = [null]; }),
      changed(d => { delete d.shipmentTrackingS1_DATAs[0].CNS_NO; })]) {
      expect(() => parseTciFreight(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('keeps invalid, empty and undated results inconclusive', () => {
    for (const data of [{ Error: { Status_Message: 'Invalid cns !' } },
      { Error: null, shipmentTrackingS1_DATAs: [], shipmentTrackingS4_DATAs: [], disInfo2: [] },
      changed(d => { d.shipmentTrackingS4_DATAs = []; })]) {
      expect(() => parseTciFreight(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'indeterminate' }));
    }
  });

  it('rejects impossible days, malformed scans and oversized row sets', () => {
    for (const data of [changed(d => { d.shipmentTrackingS4_DATAs[0].STATUS_DATE = '31-FEB-2026'; }),
      changed(d => { d.shipmentTrackingS4_DATAs[0].CITY = {}; }),
      changed(d => { d.shipmentTrackingS4_DATAs = Array(2001).fill(d.shipmentTrackingS4_DATAs[0]); })]) {
      expect(() => parseTciFreight(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
    expect(() => tciFreightJson('not JSON')).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => tciFreightJson('<html>Access denied captcha</html>')).toThrowError(expect.objectContaining({ kind: 'challenge' }));
  });

  it('does not infer delivery or read unrelated status codes', () => {
    const data = changed(d => { d.shipmentTrackingS4_DATAs[0].STATUS = 'Unclassified synthetic wording'; });
    expect(parseTciFreight(data, NUMBER).events![0]!.stage).toBeUndefined();
    expect(statusMap.stage('999', 'Consignment Booked for SYNTHETIC')).toBeUndefined();
    expect(statusMap.stage(null, 'Consignment Booked for SYNTHETIC')).toBe('accepted');
  });

  it.each([[403, 'challenge'], [404, 'transport'], [429, 'rate_limited']] as const)('preserves HTTP %i without another request', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, status, { 'retry-after': '60' }));
    await expect(new TciFreightTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind, ...(status === 429 ? { retryAfterMs: 60_000 } : {}) });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('honors cancellation before I/O and in a pending request', async () => {
    const before = new AbortController(); before.abort(); const never = vi.fn();
    expect(() => new TciFreightTracker({ fetcher: never }).fetch(NUMBER, { signal: before.signal })).toThrow();
    expect(never).not.toHaveBeenCalled();
    const during = new AbortController();
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); during.abort(new Error('synthetic cancellation'));
    });
    await expect(new TciFreightTracker({ fetcher }).fetch(NUMBER, { signal: during.signal })).rejects.toThrow('synthetic cancellation');
  });

  it('routes explicit selections and named handoffs without broad number recognition', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const result = await createTracker({ fetcher, env: {}, providers: [] }).track({ carrier: 'tci-freight', number: NUMBER });
    expect(result.source).toBe('tci-freight');
    expect(result.result.events).toHaveLength(3);
    expect(hasDirectHandoffAdapter('tci-freight', NUMBER)).toBe(true);
    expect(hasDirectHandoffAdapter('tci-freight', 'RR000000005IN')).toBe(false);
    expect(hasDirectHandoffAdapter('tci-freight', '2468135791')).toBe(false);
    expect(detectCarrierMatch(NUMBER).candidates ?? []).not.toContain('tci-freight');
    expect(recognitionCandidates(NUMBER).map(candidate => candidate.carrier)).not.toContain('tci-freight');
    for (const number of ['2468 13579', '12345678', '1234567890', 'ABC123456']) expect(() => normalizeTciFreightNumber(number)).toThrow();
  });
});
