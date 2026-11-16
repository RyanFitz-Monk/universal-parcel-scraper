import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { TrawlClient } from '../../core/transport/trawl.js';
import { YalidineTracker } from './adapter.js';
import { parseYalidineMobile, YALIDINE_MOBILE } from './mobile.js';
const NUMBER = 'YALZQ8H7J';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/mobile.json', import.meta.url), 'utf8'));
const response = (p: unknown, status = 200) => new Response(typeof p === 'string' ? p : JSON.stringify(p), { status });
describe('Yalidine mobile guest history', () => {
  it('retains full facility dates, all scans, statuses and locations', () => {
    const result = parseYalidineMobile(fixture(), NUMBER);
    expect(result).toMatchObject({ status: 'delivered', last_update: null, last_update_local: '2025-12-10T13:39:39' });
    expect(result.events).toHaveLength(12);
    expect(result.events![0]).toMatchObject({ local_time: '2025-12-10T13:39:39', description: 'Livré', stage: 'delivered', stage_source: 'carrier_map', location: 'Agence de Akbou [Yalidine], Akbou, Béjaïa' });
    expect(result.events!.every(x => !x.time && !x.time_zone && x.local_time)).toBe(true);
  });
  it('requires a unique whole root and every scan identity; does not turn [] into absence', () => {
    for (const value of [[], {}, { 'yal-OTHER1': [] }, { ...fixture(), 'yal-OTHER1': [] }, { 'yal-ZQ8H7J': [] }]) {
      expect(() => parseYalidineMobile(value, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    }
    const p = fixture(); p['yal-ZQ8H7J'][0].tracking = 'yal-OTHER1';
    expect(() => parseYalidineMobile(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
  });
  it('rejects invalid dates and fields while keeping unknown wording unclassified', () => {
    for (const [field, value] of [['datetime', '2025-02-30 13:00:00'], ['datetime', '2025-12-10T13:00:00Z'], ['status', ''], ['centre', {}]] as const) {
      const p = fixture(); p['yal-ZQ8H7J'][0][field] = value;
      expect(() => parseYalidineMobile(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    const p = fixture(); p['yal-ZQ8H7J'][0].status = 'Nouveau texte inconnu';
    expect(parseYalidineMobile(p, NUMBER).events![0]).not.toHaveProperty('stage');
  });
  it('bounds history and identifies truncation', () => {
    const p = fixture(); p['yal-ZQ8H7J'] = Array(101).fill(p['yal-ZQ8H7J'][0]);
    expect(parseYalidineMobile(p, NUMBER)).toMatchObject({ history_truncated: true, events: expect.any(Array) });
    expect(parseYalidineMobile(p, NUMBER).events).toHaveLength(100);
    p['yal-ZQ8H7J'] = Array(501).fill(p['yal-ZQ8H7J'][0]);
    expect(() => parseYalidineMobile(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });
  it('uses the supplied transport with public app headers and needs no browser or account', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const result = await new YalidineTracker({ fetcher }).fetch(NUMBER);
    expect(result.events).toHaveLength(12); expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]![0]).toBe(YALIDINE_MOBILE + '?tracking=yal-ZQ8H7J');
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ headers: { 'User-Agent': 'Yalidine-App-Android', Accept: 'application/json' }, signal: expect.any(AbortSignal) });
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).has('authorization')).toBe(false);
  });
  it.each([[[], 200, 'indeterminate'], ['<html>Verify</html>', 200, 'challenge'], ['bad-json', 200, 'schema'], [{}, 403, 'challenge'], [{}, 429, 'rate_limited'], [{}, 503, 'maintenance']] as const)('preserves failed guest reads %#', async (body, status, kind) => {
    await expect(new YalidineTracker({ fetcher: vi.fn<typeof fetch>().mockResolvedValue(response(body, status)) }).fetch(NUMBER)).rejects.toMatchObject({ kind });
  });
  it('does not spend browser requests after a mobile rate limit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, 429));
    await expect(new YalidineTracker({ fetcher, trawl: new TrawlClient('https://trawl.invalid') }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('cancels before traffic and during a hanging mobile read', async () => {
    const c = new AbortController(); c.abort(new Error('cancelled'));
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true })));
    await expect(new YalidineTracker({ fetcher }).fetch(NUMBER, { signal: c.signal })).rejects.toThrow('cancelled'); expect(fetcher).not.toHaveBeenCalled();
    const active = new AbortController(); const pending = new YalidineTracker({ fetcher }).fetch(NUMBER, { signal: active.signal });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce()); active.abort(); await expect(pending).rejects.toBeDefined();
  });
});
