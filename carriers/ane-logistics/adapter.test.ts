import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hasDirectHandoffAdapter } from '../../core/catalog/handoff.js';
import { recognitionCandidates } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { createTracker } from '../../facade/index.js';
import { AneLogisticsTracker } from './adapter.js';
import { ANE_ENDPOINT, aneJson, normalizeAneNumber, parseAne } from './parser.js';
import { statusMap } from './status.js';

const NUMBER = '246813579123';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/history.json', import.meta.url), 'utf8'));
const changed = (edit: (data: ReturnType<typeof fixture>) => void) => { const data = fixture(); edit(data); return data; };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('ANE Logistics guest adapter', () => {
  it('posts one whole waybill without ticket, cookie, bootstrap or account', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const result = await new AneLogisticsTracker({ fetcher, userAgent: 'SyntheticHost/1' }).fetch(` ${NUMBER} `, { budgetMs: 5000 });
    expect(result.events).toHaveLength(3); expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!; expect(url).toBe(ANE_ENDPOINT);
    expect(Object.fromEntries(new URLSearchParams(String(init!.body)))).toEqual({ billNo: NUMBER });
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', signal: expect.any(AbortSignal), headers: {
      Referer: 'https://www.ane56.com/self-detail.html', 'User-Agent': 'SyntheticHost/1',
    } });
    expect(new Headers(init!.headers).has('cookie')).toBe(false);
  });

  it('keeps local clocks, scan codes and partial provenance without staff/contact fields', () => {
    const data = fixture(); data.data[0].scanList.push(data.data[0].scanList[0]);
    const result = parseAne(data, NUMBER);
    expect(result).toMatchObject({ current_stage: 'in_transit', last_update: null, last_update_local: '2026-01-04T11:12:13', history_truncated: true });
    expect(result.events).toHaveLength(3);
    expect(result.events!.map(event => event.local_time)).toEqual(['2026-01-04T11:12:13', '2026-01-03T10:12:13', '2026-01-02T09:03:04']);
    expect(result.events!.map(event => event.provider_code)).toEqual(['UNLOAD_IN', 'DEPARTURE_S', 'GOT']);
    expect(result.events!.every(event => !event.time && event.stage_source === 'carrier_map')).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|2026-11-14|createTime|contact/);
  });

  it('preserves adjacent actions with the same category through the public facade', async () => {
    const data = fixture(); data.data[0].scanList.push({ operateTime: '2026-01-04 11:12:20', scanType: 'DEPARTURE_C', city: 'SYNTHETIC HUB' });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(data));
    const result = await createTracker({ fetcher, env: {}, providers: [] }).track({ carrier: 'ane-logistics', number: NUMBER });
    expect(result.result.events).toHaveLength(4);
    expect(result.result.events.slice(0, 2).map(event => event.provider_code)).toEqual(['DEPARTURE_C', 'UNLOAD_IN']);
  });

  it('requires both whole identities and one unique record', () => {
    for (const data of [changed(d => { d.data[0].billno = '135792468123'; }),
      changed(d => { d.data[0].wayBillInfo.ewbNo = '135792468123'; }),
      changed(d => { d.data.push(d.data[0]); }), changed(d => { delete d.data[0].wayBillInfo.ewbNo; })]) {
      expect(() => parseAne(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('does not mix the separate PDD service into the ordinary scan contract', () => {
    for (const data of [changed(d => { d.data[0].wayBillInfo.ecId = 398; }),
      changed(d => { d.data[0].scanListPDD = [{ operationTime: '2026-01-04 00:00:00' }]; })]) {
      expect(() => parseAne(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'indeterminate', reason: 'unsupported_service' }));
    }
  });

  it('keeps empty or unsuccessful replies inconclusive and verification distinct', () => {
    for (const data of [{ success: true, errorCode: 200, data: [] },
      { success: true, errorCode: 200, data: [{ billno: NUMBER, wayBillInfo: null, scanList: null }] },
      changed(d => { d.data[0].scanList = []; }), { success: false, errorCode: 500 }]) {
      expect(() => parseAne(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'indeterminate' }));
    }
    expect(() => parseAne({ success: false, errorCode: 400, message: '验证码错误' }, NUMBER)).toThrowError(expect.objectContaining({ kind: 'challenge' }));
    expect(() => aneJson('<html>verification</html>')).toThrowError(expect.objectContaining({ kind: 'challenge' }));
    expect(() => aneJson('not JSON')).toThrowError(expect.objectContaining({ kind: 'schema' }));
  });

  it('rejects impossible dates and malformed histories', () => {
    for (const data of [changed(d => { d.data[0].scanList[0].operateTime = '2026-02-30 00:00:00'; }),
      changed(d => { d.data[0].scanList[0].city = {}; }),
      changed(d => { d.data[0].scanList = Array(2001).fill(d.data[0].scanList[0]); })]) {
      expect(() => parseAne(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('leaves signed and unfamiliar scans unmapped without inferring recipient semantics', () => {
    const result = parseAne(changed(d => { d.data[0].scanList[2].scanType = 'SIGN'; }), NUMBER);
    expect(result.events![0]).toMatchObject({ description: 'SIGN', provider_code: 'SIGN' });
    expect(result.events![0]!.stage).toBeUndefined(); expect(result.current_stage).toBeUndefined();
    expect(statusMap.stage('SIGN', 'Delivered')).toBeUndefined(); expect(statusMap.stage('GOT', '')).toBe('accepted');
  });

  it.each([[403, 'challenge'], [404, 'transport'], [429, 'rate_limited']] as const)('preserves HTTP %i without retrying the challenge', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, status));
    await expect(new AneLogisticsTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('honors caller cancellation before any request', () => {
    const controller = new AbortController(); controller.abort(); const never = vi.fn();
    expect(() => new AneLogisticsTracker({ fetcher: never }).fetch(NUMBER, { signal: controller.signal })).toThrow();
    expect(never).not.toHaveBeenCalled();
  });

  it('makes explicit selections usable without claiming all twelve-digit issuers', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const result = await createTracker({ fetcher, env: {}, providers: [] }).track({ carrier: 'ane-logistics', number: NUMBER });
    expect(result.source).toBe('ane-logistics');
    expect(result.result.events).toHaveLength(3);
    expect(hasDirectHandoffAdapter('ane-logistics', NUMBER)).toBe(true);
    expect(hasDirectHandoffAdapter('ane-logistics', 'RR000000005CN')).toBe(false);
    expect(hasDirectHandoffAdapter('ane-logistics', '024681357912')).toBe(false);
    expect(detectCarrierMatch(NUMBER).candidates ?? []).not.toContain('ane-logistics');
    expect(recognitionCandidates(NUMBER).map(candidate => candidate.carrier)).not.toContain('ane-logistics');
    for (const number of ['2468 13579123', '24681357912', '2468135791234', 'ANE246813579']) expect(() => normalizeAneNumber(number)).toThrow();
  });
});
