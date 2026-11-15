import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { recognitionCandidates } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { languageStageStatus, STAGES } from '../../core/status/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { SwissconnectTracker } from './adapter.js';
import { hyphenatedSwissconnectNumber, normalizeSwissconnectNumber, parseSwissconnect, SWISSCONNECT_ENDPOINT, swissconnectJson } from './parser.js';
import { statusMap, SWISSCONNECT_STEPS, swissconnectState } from './status.js';

const NUMBER = '0000S00001';
const WRITTEN = '000-0S00001';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/shipment.json', import.meta.url), 'utf8'));
const changed = (edit: (data: ReturnType<typeof fixture>) => void) => { const data = fixture(); edit(data); return data; };
const response = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
const statuses = JSON.parse(readFileSync(new URL('./statuses.json', import.meta.url), 'utf8')) as { entries: { code: string; wording: string; stage: string }[] };
const zurich = (wall: string) => ({ date: `${wall}.000000`, timezone_type: 3, timezone: 'Europe/Zurich' });
const missing = { success: false, error: 'tracking.error.noresult' };
const delivered = () => changed(d => {
  d.result.state = 'delivered'; d.result.visierName = 'PRIVATE SIGNATORY'; d.result.deliveryTime = zurich('2026-03-02 14:12:00');
  d.list.delivered = true;
});

describe('swissconnect guest adapter', () => {
  it('posts the number once, with the supplied transport and budget', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const recorder = { ...NOOP_RECORDER, step: vi.fn() };
    const result = await new SwissconnectTracker({ fetcher, recorder, userAgent: 'SyntheticHost/1' }).fetch(` ${NUMBER} `, { budgetMs: 4000 });
    expect(result.events).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(SWISSCONNECT_ENDPOINT);
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', signal: expect.any(AbortSignal),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'SyntheticHost/1' } });
    expect(JSON.parse(init!.body as string)).toEqual({ trackingId: NUMBER });
    expect(new Headers(init!.headers).has('cookie')).toBe(false);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'swissconnect', step: 'direct', outcome: 'ok' }));
  });

  it('asks once more with the hyphen its form writes, only for a number of that layout the service did not find', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response(missing)).mockResolvedValueOnce(response(fixture()));
    const result = await new SwissconnectTracker({ fetcher }).fetch(NUMBER);
    expect(result.current_stage).toBe('out_for_delivery');
    expect(fetcher.mock.calls.map(([, init]) => JSON.parse(init!.body as string))).toEqual([{ trackingId: NUMBER }, { trackingId: WRITTEN }]);
    const twice = vi.fn<typeof fetch>().mockImplementation(async () => response(missing));
    await expect(new SwissconnectTracker({ fetcher: twice }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'not_found' });
    expect(twice).toHaveBeenCalledTimes(2);
    for (const other of ['ABC1234567', '00000S0001', WRITTEN]) {
      const once = vi.fn<typeof fetch>().mockImplementation(async () => response(missing));
      await expect(new SwissconnectTracker({ fetcher: once }).fetch(other)).rejects.toMatchObject({ kind: 'not_found' });
      expect(once).toHaveBeenCalledOnce();
    }
    const refused = vi.fn<typeof fetch>().mockImplementation(async () => response({ success: false, error: 'tracking.error.nonunique' }));
    await expect(new SwissconnectTracker({ fetcher: refused }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'indeterminate' });
    expect(refused).toHaveBeenCalledOnce();
    expect(hyphenatedSwissconnectNumber('9990k00001')).toBe('999-0K00001');
    expect(hyphenatedSwissconnectNumber('99900K0001')).toBeNull();
  });

  it('reads the reached step, the dated pickup on the stated zone and the planned delivery window', () => {
    const result = parseSwissconnect(fixture(), NUMBER);
    expect(result).toEqual({ status: languageStageStatus('out_for_delivery'), current_stage: 'out_for_delivery', current_stage_source: 'carrier_map',
      last_status_text: 'In Zustellung', provider_code: 'inDelivery', last_update: '2026-03-02T09:24:00+01:00', expected_delivery: '2026-03-02 13:00–15:00',
      events: [{ time: '2026-03-02T09:24:00+01:00', description: 'Abgeholt', provider_code: 'pickedUp', stage: 'accepted', stage_source: 'carrier_map' }] });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Synthetic/);
    const picked = parseSwissconnect(changed(d => { d.list.inDelivery = false; d.result.dropFrom = d.result.dropTo = null; }), NUMBER);
    expect(picked).toMatchObject({ current_stage: 'accepted', last_status_text: 'Abgeholt', expected_delivery: '2026-03-02 15:00' });
    expect(picked.provider_code).toBeUndefined();
  });

  it('answers a shipment without a dated step from its state alone', () => {
    const created = changed(d => { d.list = { created: true, pickedUp: false, inDelivery: false, delivered: false }; d.result.state = 'created'; d.result.pickupTime = null; });
    expect(parseSwissconnect(created, NUMBER)).toEqual({ status: languageStageStatus('registered'), current_stage: 'registered', current_stage_source: 'carrier_map',
      last_status_text: 'In Vorbereitung', provider_code: 'created', last_update: null, expected_delivery: '2026-03-02 13:00–15:00', summary_only: true, events: [] });
    // A pickup clock is the plan until the step is reached.
    const planned = changed(d => { d.list.pickedUp = d.list.inDelivery = false; });
    expect(parseSwissconnect(planned, NUMBER)).toMatchObject({ current_stage: 'registered', summary_only: true, events: [] });
    const bare = changed(d => { d.list = null; d.result.state = 'created'; d.result.endTime = null; });
    expect(parseSwissconnect(bare, NUMBER)).toMatchObject({ current_stage: 'registered', expected_delivery: null, summary_only: true });
  });

  it('dates a delivery, drops the plan and never reads the places or who took it', () => {
    const result = parseSwissconnect(delivered(), NUMBER);
    expect(result).toEqual({ status: languageStageStatus('delivered'), current_stage: 'delivered', current_stage_source: 'carrier_map',
      last_status_text: 'Persönlich zugestellt', last_update: '2026-03-02T14:12:00+01:00', expected_delivery: null, delivered_at: '2026-03-02T14:12:00+01:00',
      events: [{ time: '2026-03-02T14:12:00+01:00', description: 'Persönlich zugestellt', provider_code: 'delivered', stage: 'delivered', stage_source: 'carrier_map' },
        { time: '2026-03-02T09:24:00+01:00', description: 'Abgeholt', provider_code: 'pickedUp', stage: 'accepted', stage_source: 'carrier_map' }] });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|Synthetic/);
  });

  it('reads a cancelled shipment as an exception without its dates', () => {
    const result = parseSwissconnect(changed(d => { d.result.state = 'annullated'; d.result.visierName = 'PRIVATE NOTE'; }), NUMBER);
    expect(result).toEqual({ status: languageStageStatus('exception'), current_stage: 'exception', current_stage_source: 'carrier_map',
      last_status_text: 'Annulliert', provider_code: 'annullated', last_update: null, expected_delivery: null, summary_only: true, events: [] });
  });

  it('dates an event only on the zone or offset the service states, and plans from the wall clock alone', () => {
    for (const clock of [{ date: '2026-03-02 09:24:00.000000' }, { date: '2026-03-02 09:24:00.000000', timezone_type: 2, timezone: 'CET' },
      { date: '2026-03-02 09:24:00', timezone_type: 3, timezone: 'Synthetic/Zone' },
      { date: '2026-03-29 02:30:00.000000', timezone_type: 3, timezone: 'Europe/Zurich' }, { date: '2026-10-25 02:30:00.000000', timezone_type: 3, timezone: 'Europe/Zurich' }]) {
      expect(() => parseSwissconnect(changed(d => { d.result.pickupTime = clock; }), NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
    for (const clock of [{ date: '2026-03-02 09:24:00.000000', timezone_type: 1, timezone: '+01:00' }, { date: '2026-03-02T09:24:00+01:00' }, { date: '2026-03-02T09:24:00.000+01:00' }]) {
      expect(parseSwissconnect(changed(d => { d.result.pickupTime = clock; }), NUMBER).events![0]!.time).toBe('2026-03-02T09:24:00+01:00');
    }
    const late = delivered(); late.result.deliveryTime = { date: '2026-03-02 14:12:00' };
    expect(() => parseSwissconnect(late, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    const plan = changed(d => { for (const key of ['endTime', 'dropFrom', 'dropTo']) d.result[key] = { date: d.result[key].date }; });
    expect(parseSwissconnect(plan, NUMBER).expected_delivery).toBe('2026-03-02 13:00–15:00');
    expect(JSON.stringify(parseSwissconnect(fixture(), NUMBER))).not.toContain('local_time');
  });

  it('rejects a reply that does not name the requested number', () => {
    for (const data of [changed(d => { d.result.fbNumber = '000-0S00002'; }), changed(d => { delete d.result.fbNumber; }),
      changed(d => { d.result.fbNumber = `${WRITTEN}1`; }), changed(d => { d.result.fbNumber = null; })]) {
      expect(() => parseSwissconnect(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
    for (const own of [NUMBER, WRITTEN.toLowerCase(), ' 000 0s00001 ']) expect(parseSwissconnect(changed(d => { d.result.fbNumber = own; }), NUMBER).events).toHaveLength(1);
    expect(parseSwissconnect(fixture(), WRITTEN).events).toHaveLength(1);
  });

  it('rejects an unreadable clock, an unknown state and a malformed reply', () => {
    for (const data of [changed(d => { d.result.pickupTime = '2026-03-02 09:24:00'; }), changed(d => { d.result.pickupTime = { date: '02.03.2026 09:24' }; }),
      changed(d => { d.result.pickupTime = { date: '2026-02-31 09:24:00' }; }), changed(d => { d.result.pickupTime = {}; }),
      changed(d => { d.result.endTime = { date: 'soon' }; }), changed(d => { d.result.pickupTime = { date: '2026-03-02T25:24:00+01:00' }; }),
      changed(d => { d.list = { created: false, pickedUp: false, inDelivery: false, delivered: false }; }),
      changed(d => { d.list = null; d.result.state = 'synthetic'; }), changed(d => { d.list = []; }), changed(d => { d.list = 'created'; }),
      changed(d => { d.result = null; }), changed(d => { delete d.result; }), changed(d => { d.success = 'true'; }), changed(d => { delete d.success; }),
      null, [], 'shipment']) {
      expect(() => parseSwissconnect(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('tells a missing shipment from a shared number, a refusal and a page', () => {
    expect(() => parseSwissconnect(missing, NUMBER)).toThrowError(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseSwissconnect({ success: false, error: 'tracking.error.nonunique' }, NUMBER)).toThrowError(expect.objectContaining({ kind: 'indeterminate' }));
    expect(() => parseSwissconnect({ success: false, error: 'tracking.error.synthetic' }, NUMBER)).toThrowError(expect.objectContaining({ kind: 'indeterminate' }));
    expect(() => parseSwissconnect({ success: false }, NUMBER)).toThrowError(expect.objectContaining({ kind: 'indeterminate' }));
    expect(() => swissconnectJson('<!doctype html><html><head><title>swissconnect</title></head><body></body></html>')).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => swissconnectJson('<html><head><title>Just a moment...</title></head></html>')).toThrowError(expect.objectContaining({ kind: 'challenge' }));
  });

  it('maps every state of the script to its stage, in the bar\'s order', () => {
    expect(statuses.entries.map(entry => entry.code)).toEqual([...SWISSCONNECT_STEPS, 'annullated']);
    for (const entry of statuses.entries) {
      expect(swissconnectState(entry.code)).toEqual({ wording: entry.wording, stage: entry.stage });
      expect(statusMap.stage(entry.code, entry.wording)).toBe(entry.stage);
      expect(STAGES).toContain(entry.stage);
    }
    expect(statusMap.stage(null, 'Abgeholt')).toBeUndefined();
    expect(statusMap.stage('synthetic', 'Abgeholt')).toBeUndefined();
  });

  it.each([[403, 'challenge'], [429, 'rate_limited'], [500, 'indeterminate'], [404, 'transport']] as const)('preserves HTTP %i without another request', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(missing, status, { 'retry-after': '60' }));
    await expect(new SwissconnectTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind, ...(status === 429 ? { retryAfterMs: 60_000 } : {}) });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reports a page in place of the JSON as a changed service', async () => {
    const page = vi.fn<typeof fetch>().mockResolvedValue(response('<!doctype html><title>swissconnect</title>', 200, { 'content-type': 'text/html' }));
    await expect(new SwissconnectTracker({ fetcher: page }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'schema' });
    expect(page).toHaveBeenCalledOnce();
  });

  it('honors cancellation before I/O and in a pending request', async () => {
    const before = new AbortController(); before.abort(); const never = vi.fn();
    expect(() => new SwissconnectTracker({ fetcher: never }).fetch(NUMBER, { signal: before.signal })).toThrow();
    expect(never).not.toHaveBeenCalled();
    const during = new AbortController();
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); during.abort(new Error('synthetic cancellation'));
    });
    await expect(new SwissconnectTracker({ fetcher }).fetch(NUMBER, { signal: during.signal })).rejects.toThrow('synthetic cancellation');
  });

  it('routes an explicit selection and offers no number rule', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const result = await createTracker({ fetcher, env: {}, providers: [] }).track({ carrier: 'swissconnect', number: WRITTEN });
    expect(result.source).toBe('swissconnect');
    expect(result.result.events).toHaveLength(1);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ trackingId: NUMBER });
    expect(detectCarrierMatch(NUMBER).candidates ?? []).not.toContain('swissconnect');
    expect(recognitionCandidates(NUMBER).map(candidate => candidate.carrier)).not.toContain('swissconnect');
    for (const number of ['', 'ABCD', 'AB CD 1234', 'ABC/12345', '-ABC12345', 'A'.repeat(31)]) expect(() => normalizeSwissconnectNumber(number)).toThrow();
    for (const number of ['ABC12345', WRITTEN, '1234567890']) expect(normalizeSwissconnectNumber(` ${number} `)).toBe(number);
  });
});
