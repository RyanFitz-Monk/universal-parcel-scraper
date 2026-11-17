import { readFileSync } from 'node:fs';
import { load } from 'cheerio';
import { describe, expect, it, vi } from 'vitest';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { recognitionAskedCarriers } from '../../core/catalog/recognition.js';
import { universalPlan } from '../../providers/plan.js';
import { parseTrackingInput } from '../../index.js';
import { deliveryHandoff, hasDirectHandoffAdapter } from '../../core/catalog/handoff.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { adapter, FtdNzTracker } from './adapter.js';
import { normalizeFtdNzNumber, parseFtdNz } from './parser.js';

const NUMBER = 'QXZ974682', PARTNER = '73974682510368';
const fixture = (name = 'tracking') => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');

describe('FTD New Zealand guest record', () => {
  it('binds the whole result, keeps five own scans and a named but unconfirmed ZTO handoff', () => {
    const result = parseFtdNz(fixture(), NUMBER);
    expect(result).toMatchObject({ status: 'in_transit', current_stage: 'in_transit', last_update: null,
      last_update_local: '2026-11-06T05:20:00', expected_delivery: null, history_truncated: true,
      delivery_carrier: 'zto', delivery_tracking_number: PARTNER });
    expect(result.events).toHaveLength(5);
    expect(result.events!.map(event => event.stage)).toEqual(['in_transit', 'in_transit', 'in_transit', 'in_transit', 'accepted']);
    expect(result.events![0]).toMatchObject({ location: 'China', description: '已抵达 货物抵达中国。 Arrive in China',
      original_description: '【中国】已抵达 货物抵达中国。 Arrive in China', stage_source: 'carrier_map' });
    expect(result.events!.at(-1)).toMatchObject({ location: 'Auckland, New Zealand', local_time: '2026-11-01T10:20:00' });
    expect(result.events!.every(event => event.local_time && !event.time)).toBe(true);
    expect(result).not.toHaveProperty('delivered_at'); expect(result).not.toHaveProperty('destination_country');
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|由于快递公司网络原因|www\.zto/);
    expect(deliveryHandoff('ftd-nz', NUMBER, result)).toEqual({ carrier: 'zto', number: PARTNER, basis: 'partner' });
  });

  it('keeps the generic empty-query absence template inconclusive, including an input echo', () => {
    for (const html of [fixture('empty-form'), fixture('empty-form').replace('name="code"', `name="code" value="${NUMBER}"`)]) {
      expect(() => parseFtdNz(html, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    }
  });

  it('rejects every inconsistent whole identity and an ambiguous or duplicated result', () => {
    for (const mutate of [
      (s: string) => s.replace(`id="sn-${NUMBER}-`, `id="sn-${NUMBER}1-`),
      (s: string) => s.replace(`FTD 单号 ${NUMBER} 的查询结果：`, `FTD 单号 ${NUMBER.slice(0, -1)} 的查询结果：`),
      (s: string) => s.replace(`data-sn="sn-${NUMBER}-${PARTNER}"`, `data-sn="sn-${NUMBER}1-${PARTNER}"`),
      (s: string) => s.replace('</body>', `<div id="sn-${NUMBER}-${PARTNER}"></div></body>`),
      (s: string) => s + s,
      (s: string) => s.replace('name="code"', 'name="code" value="ABC123456"'),
    ]) expect(() => parseFtdNz(mutate(fixture()), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('requires the named partner and both number copies to agree with the ID suffix and official links', () => {
    for (const mutate of [
      (s: string) => s.replace(`单号为 ${PARTNER}`, '单号为 73974682510369'),
      (s: string) => s.replace(`<b>${PARTNER}</b>`, '<b>73974682510369</b>'),
      (s: string) => s.replaceAll('中通快递', 'Another Carrier'),
      (s: string) => s.replaceAll('http://www.zto.cn', 'https://www.zto.cn.evil.example/'),
      (s: string) => s.replace('http://www.zto.cn', 'javascript:alert(1)'),
      (s: string) => s.replace('由于快递公司网络原因', 'An unrelated undated message'),
    ]) expect(() => parseFtdNz(mutate(fixture()), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('rejects missing structure, missing clocks and impossible calendar or clock values', () => {
    for (const mutate of [
      (s: string) => s.replace('id="query-form"', 'id="another-form"'),
      (s: string) => s.replace('class="query-content"', 'class="another-content"'),
      (s: string) => s.replace('class="timeline-body"', 'class="other-body"'),
      (s: string) => s.replace('class="time"', 'class="other-time"'),
      (s: string) => s.replace('2026-11-01 10:20:00', '2026-02-30 10:20:00'),
      (s: string) => s.replace('2026-11-01 10:20:00', '2026-11-01 24:20:00'),
    ]) expect(() => parseFtdNz(mutate(fixture()), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    const $ = load(fixture()); $('ul.timeline > li').filter((_, li) => $(li).find('.time').length > 0).remove();
    expect(() => parseFtdNz($.html(), NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate', reason: 'listed',
      deliveryCarrier: 'zto', deliveryTrackingNumber: PARTNER }));
  });

  it('preserves carrier progression when the China wall clock is earlier than the preceding NZ clock', () => {
    const html = fixture().replace('2026-11-03 03:10:00', '2026-11-06 08:20:00').replace('2026-11-06 05:20:00', '2026-11-06 03:20:00');
    const result = parseFtdNz(html, NUMBER);
    expect(result.last_update_local).toBe('2026-11-06T03:20:00');
    expect(result.events![0]).toMatchObject({ location: 'China', local_time: '2026-11-06T03:20:00' });
    expect(result.events![1]).toMatchObject({ location: 'Auckland, New Zealand', local_time: '2026-11-06T08:20:00' });
  });

  it('keeps an unknown newest activity visible rather than borrowing an older transit stage', () => {
    const $ = load(fixture()), row = $('ul.timeline > li').filter((_, li) => $(li).find('.time').length > 0).last().clone();
    row.find('.time').text('2026-11-07 01:10:00'); row.find('.timeline-header').text('【中国】新的活动');
    row.find('.timeline-body').text('Unclassified logistics update'); $('ul.timeline > li').last().before(row);
    const result = parseFtdNz($.html(), NUMBER);
    expect(result.status).toBe('unknown'); expect(result).not.toHaveProperty('current_stage');
    expect(result.events![0]).toMatchObject({ location: 'China', description: '新的活动 Unclassified logistics update' });
    expect(result.events![0]).not.toHaveProperty('stage');
  });

  it('removes exact duplicates without erasing separate same-clock activities and validates beyond the projection cap', () => {
    const $ = load(fixture()), first = $('ul.timeline > li').filter((_, li) => $(li).find('.time').length > 0).first();
    first.after(first.clone()); expect(parseFtdNz($.html(), NUMBER).events).toHaveLength(5);
    const separate = first.clone(); separate.find('.timeline-body').text('A separate scan at the same local clock'); first.after(separate);
    expect(parseFtdNz($.html(), NUMBER).events).toHaveLength(6);
    expect(parseFtdNz($.html(), NUMBER).events!.filter(event => event.local_time === '2026-11-01T10:20:00')).toHaveLength(2);
    const p = load(fixture()), template = p('ul.timeline > li').filter((_, li) => p(li).find('.time').length > 0).first();
    for (let i = 0; i < 101; i++) { const row = template.clone(); row.find('.timeline-body').text(`Distinct scan ${i}`); p('ul.timeline > li').last().before(row); }
    expect(parseFtdNz(p.html(), NUMBER).events).toHaveLength(100);
    p('ul.timeline > li').eq(102).find('.time').text('invalid');
    expect(() => parseFtdNz(p.html(), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('separates explicit maintenance, HTML verification and a malformed page', () => {
    expect(() => parseFtdNz('<title>Maintenance</title><h1>Under maintenance</h1>', NUMBER)).toThrow(expect.objectContaining({ kind: 'maintenance' }));
    expect(() => parseFtdNz('<title>Just a moment</title>', NUMBER)).toThrow(expect.objectContaining({ kind: 'challenge' }));
    expect(() => parseFtdNz('<title>Other site</title>', NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });
});

describe('FTD New Zealand transport', () => {
  it('uses the supplied fetcher, exact canonical whole-query URL and manual redirects', async () => {
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe(`https://www.ftd.nz/query/?code=${NUMBER}`);
      expect(init?.redirect).toBe('manual'); expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get('referer')).toBe('https://www.ftd.nz/query/');
      expect(new Headers(init?.headers).get('cookie')).toBeNull(); return new Response(fixture());
    });
    const result = await new FtdNzTracker({ fetcher }).fetch(' qxz 974682 ');
    expect(result.events).toHaveLength(5); expect(fetcher).toHaveBeenCalledTimes(1);
    const instance = adapter({ fetcher, recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });
    expect(instance.steps).toEqual(['direct', 'retry']); expect(instance.recognize).toBeUndefined();
  });

  it('allows one retry only after a network failure', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(new Response(fixture()));
    expect((await new FtdNzTracker({ fetcher }).fetch(NUMBER)).events).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([[403, 'challenge'], [401, 'challenge'], [429, 'rate_limited'], [503, 'maintenance'], [302, 'transport'], [404, 'transport']])('never retries HTTP %s or calls it parcel absence', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('unavailable', { status: Number(status) }));
    await expect(new FtdNzTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry parsing, generic empty replies or an oversized response', async () => {
    for (const [body, kind] of [[fixture('empty-form'), 'indeterminate'], ['<html>maintenance without its actual view</html>', 'schema'], ['x'.repeat(1024 * 1024 + 1), 'indeterminate']]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(body));
      await expect(new FtdNzTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind });
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });

  it('validates the whole shape before I/O and honors pre-cancellation', async () => {
    const fetcher = vi.fn<typeof fetch>(), tracker = new FtdNzTracker({ fetcher });
    for (const value of ['974682', 'QXZ97468', 'QXZ9746821', 'QXZ974682,ABC123456']) await expect(tracker.fetch(value)).rejects.toMatchObject({ kind: 'invalid_input' });
    const controller = new AbortController(); controller.abort();
    await expect(tracker.fetch(NUMBER, { signal: controller.signal })).rejects.toBeDefined();
    expect(fetcher).not.toHaveBeenCalled(); expect(normalizeFtdNzNumber(' qxz 974682 ')).toBe(NUMBER);
  });

  it('shares the lookup deadline across both network attempts and does not retry caller cancellation', async () => {
    const slow = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      if (init?.signal?.aborted) reject(init.signal.reason);
      else init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    const start = performance.now();
    await expect(new FtdNzTracker({ fetcher: slow }).fetch(NUMBER, { budgetMs: 100 })).rejects.toBeDefined();
    expect(performance.now() - start).toBeLessThan(1000); expect(slow.mock.calls.length).toBeLessThanOrEqual(2);
    slow.mockClear(); const controller = new AbortController(), operation = new FtdNzTracker({ fetcher: slow }).fetch(NUMBER, { signal: controller.signal, budgetMs: 1000 });
    setTimeout(() => controller.abort(), 10);
    await expect(operation).rejects.toBeDefined(); expect(slow).toHaveBeenCalledTimes(1);
  });
});

describe('FTD New Zealand eligibility', () => {
  it('recognizes its explicit link without assigning a short reference to its issuer', () => {
    expect(parseTrackingInput(`https://www.ftd.nz/query/?code=${NUMBER}`)).toMatchObject({ carrier: 'ftd-nz', trackingNumber: NUMBER });
    expect(detectCarrierMatch(NUMBER).candidates).not.toContain('ftd-nz');
    expect(recognitionAskedCarriers(NUMBER, { countryHint: 'NZ' })).not.toContain('ftd-nz');
    expect(hasDirectHandoffAdapter('ftd-nz', NUMBER)).toBe(true);
    expect(hasDirectHandoffAdapter('ftd-nz', PARTNER)).toBe(false);
    expect(universalPlan({ carriers: ['ftd-nz'], trackingNumber: NUMBER }).sources).toEqual(expect.arrayContaining(['ParcelsApp', 'Ship24', '17TRACK']));
  });
});
