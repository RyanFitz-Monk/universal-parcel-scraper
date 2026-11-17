import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hasDirectHandoffAdapter } from '../../core/catalog/handoff.js';
import { recognitionAskedCarriers } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { adapter } from './adapter.js';
import { normalizeLhtexNumber, parseLhtex } from './parser.js';

const NUMBER = '974682510368';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/tracking.json', import.meta.url), 'utf8'));
const instance = (fetcher: typeof fetch) => adapter({ fetcher, recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });

describe('LHT Express guest history', () => {
  it('binds the whole waybill, preserves local clocks and maps the native scan types', () => {
    const result = parseLhtex(fixture(), NUMBER);
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', last_update: null,
      last_update_local: '2026-11-15T10:50:45', expected_delivery: null });
    expect(result.events).toHaveLength(8);
    expect(result.events!.map(event => event.stage)).toEqual(['delivered', 'out_for_delivery', 'in_transit', 'in_transit', 'in_transit', 'accepted', 'registered', 'registered']);
    expect(result.events![0]).toMatchObject({ location: '清远市', description: '【清远市】快件已签收', stage_source: 'carrier_map' });
    expect(result.events!.every(event => event.local_time && !event.time)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SYNTHETIC_REQUEST|signImage/);
  });

  it('keeps a successful empty reply inconclusive, separately from malformed and denied replies', () => {
    expect(() => parseLhtex({ code: 200, msg: '成功', data: [] }, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    for (const [code, kind] of [[429, 'rate_limited'], [401, 'challenge'], [403, 'challenge'], [500, 'indeterminate']] as const) {
      expect(() => parseLhtex({ code, data: [] }, NUMBER)).toThrow(expect.objectContaining({ kind }));
    }
    for (const payload of [null, { data: [] }, { code: '200', data: [] }, { code: 200, data: {} }]) {
      expect(() => parseLhtex(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    const empty = fixture(); empty.data[0].details = [];
    expect(() => parseLhtex(empty, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
  });

  it('rejects a wrong, extended, numeric or ambiguous identity and malformed history', () => {
    for (const mutate of [
      (p: ReturnType<typeof fixture>) => { p.data[0].waybillNo += '1'; },
      (p: ReturnType<typeof fixture>) => { p.data[0].waybillNo = NUMBER.slice(0, -1); },
      (p: ReturnType<typeof fixture>) => { p.data[0].waybillNo = Number(NUMBER); },
      (p: ReturnType<typeof fixture>) => { p.data.push(p.data[0]); },
      (p: ReturnType<typeof fixture>) => { p.data[0].details = {}; },
      (p: ReturnType<typeof fixture>) => { p.data[0].details[0].scanTime = '2026-02-30 10:00:00'; },
      (p: ReturnType<typeof fixture>) => { p.data[0].details[0].scanTime = '2026-11-15 24:00:00'; },
      (p: ReturnType<typeof fixture>) => { p.data[0].details[0].scanType = null; },
      (p: ReturnType<typeof fixture>) => { p.data[0].details[0].desc = '<html>Denied</html>'; },
    ]) {
      const p = fixture(); mutate(p);
      expect(() => parseLhtex(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('sorts local scans, removes exact duplicates and keeps a new unknown type unresolved', () => {
    const p = fixture(); p.data[0].details.reverse(); p.data[0].details.push(p.data[0].details[0]);
    expect(parseLhtex(p, NUMBER).events).toHaveLength(8);
    p.data[0].details.push({ scanTime: '2026-11-16 08:00:00', scanType: '新的状态', desc: '【广州市】已签收物品的后续活动' });
    const result = parseLhtex(p, NUMBER);
    expect(result.status).toBe('unknown'); expect(result).not.toHaveProperty('current_stage');
    expect(result.events![0]).not.toHaveProperty('stage');
  });

  it('validates beyond the output cap and preserves separate simultaneous activities', () => {
    const p = fixture(); p.data[0].details = Array.from({ length: 101 }, (_, i) => ({ ...p.data[0].details[0], desc: `活动 ${i}` }));
    expect(parseLhtex(p, NUMBER)).toMatchObject({ history_truncated: true });
    expect(parseLhtex(p, NUMBER).events).toHaveLength(100);
    p.data[0].details[100].scanTime = 'invalid';
    expect(() => parseLhtex(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('uses the supplied transport and exact official GET, without sessions or signature projection', async () => {
    const fetcher = vi.fn(async (url, init) => {
      expect(String(url)).toBe(`https://www.lhtex.com.cn/orderquery.php?waybillNo=${NUMBER}`);
      expect(init?.redirect).toBe('manual'); expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get('cookie')).toBeNull();
      return new Response(JSON.stringify(fixture()), { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
    });
    const result = await instance(fetcher).track({ number: NUMBER }, { budgetMs: 1000 });
    expect(result.events).toHaveLength(8); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429, 302, 503])('never retries an HTTP %s or turns it into absence', async status => {
    const fetcher = vi.fn(async () => new Response('refused', { status }));
    await expect(instance(fetcher).track({ number: NUMBER })).rejects.toMatchObject({ kind: status === 403 ? 'challenge' : status === 429 ? 'rate_limited' : status === 503 ? 'maintenance' : 'transport' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('keeps HTML challenges, malformed JSON and empty JSON distinct', async () => {
    for (const [body, kind] of [['<title>Just a moment</title>', 'challenge'], ['<html>maintenance</html>', 'schema'], ['{"code":200,"data":[]}', 'indeterminate']]) {
      const fetcher = vi.fn(async () => new Response(body));
      await expect(instance(fetcher).track({ number: NUMBER })).rejects.toMatchObject({ kind });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('retries only a network failure and honors cancellation and remaining lookup time', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(Response.json(fixture()));
    expect((await instance(fetcher).track({ number: NUMBER })).events).toHaveLength(8);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const controller = new AbortController(); controller.abort(); fetcher.mockClear();
    await expect(instance(fetcher).track({ number: NUMBER }, { signal: controller.signal })).rejects.toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
    const slow = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true });
    }));
    await expect(instance(slow).track({ number: NUMBER }, { budgetMs: 100 })).rejects.toBeDefined();
    expect(slow.mock.calls.length).toBeLessThanOrEqual(2);
  });

  it('limits explicit lookups and handoffs without widening issuer detection or recognition', async () => {
    expect(normalizeLhtexNumber(' 9746 8251 0368 ')).toBe(NUMBER);
    expect(hasDirectHandoffAdapter('lhtex', NUMBER)).toBe(true);
    for (const value of ['ABC974682510368', '97468251036', '9746825103681', NUMBER + ',123456789012']) {
      const fetcher = vi.fn<typeof fetch>();
      await expect(instance(fetcher).track({ number: value })).rejects.toMatchObject({ kind: 'invalid_input' });
      expect(fetcher).not.toHaveBeenCalled();
      expect(hasDirectHandoffAdapter('lhtex', value)).toBe(false);
    }
    expect(detectCarrierMatch(NUMBER).candidates).not.toContain('lhtex');
    expect(recognitionAskedCarriers(NUMBER, { countryHint: 'CN' })).not.toContain('lhtex');
    expect(instance(vi.fn<typeof fetch>()).recognize).toBeUndefined();
  });
});
