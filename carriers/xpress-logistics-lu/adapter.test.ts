import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { recognitionCandidates } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { languageStageStatus, STAGES } from '../../core/status/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { XpressLogisticsTracker } from './adapter.js';
import { normalizeXpressNumber, parseXpress, parseXpressReply, xpressLogisticsUrl } from './parser.js';
import { statusMap, xpressStatus } from './status.js';

const NUMBER = '000000001';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/tracking.json', import.meta.url), 'utf8'));
const changed = (edit: (data: ReturnType<typeof fixture>) => void) => { const data = fixture(); edit(data); return data; };
const response = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(data === null ? null : typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
const statuses = JSON.parse(readFileSync(new URL('./statuses.json', import.meta.url), 'utf8')) as { entries: { code: string; wording: string; stage: string; language: string }[] };
// One more status after the fixture's, an hour past its newest.
const then = (status: string) => changed(d => { d.status.push({ status, created_at: '2026-03-04T08:30:00.000000Z' }); });

describe('Xpress Logistics guest adapter', () => {
  it('asks for the whole number once, with the supplied transport and budget', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const recorder = { ...NOOP_RECORDER, step: vi.fn() };
    const result = await new XpressLogisticsTracker({ fetcher, recorder, userAgent: 'SyntheticHost/1' }).fetch(` ${NUMBER} `, { budgetMs: 4000 });
    expect(result.events).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(`https://xpresslogistics.conselio.com/search/${NUMBER}`);
    expect(init).toMatchObject({ redirect: 'manual', signal: expect.any(AbortSignal), headers: { Accept: 'application/json', 'User-Agent': 'SyntheticHost/1' } });
    expect(init!.method).toBeUndefined();
    expect(init!.body).toBeUndefined();
    expect(new Headers(init!.headers).has('cookie')).toBe(false);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'xpress-logistics-lu', step: 'direct', outcome: 'ok' }));
    expect(xpressLogisticsUrl(NUMBER)).toBe('https://xpresslogistics.conselio.com/search/000000001');
  });

  it('reads the statuses newest first with the page\'s wording, and never the sender', () => {
    const result = parseXpress(fixture(), NUMBER);
    expect(result).toEqual({ status: languageStageStatus('out_for_delivery'), current_stage: 'out_for_delivery', current_stage_source: 'carrier_map',
      last_status_text: 'En cours de livraison', last_update: '2026-03-04T07:30:00Z', expected_delivery: null,
      events: [
        { time: '2026-03-04T07:30:00Z', description: 'En cours de livraison', provider_code: 'delivering', stage: 'out_for_delivery', stage_source: 'carrier_map' },
        { time: '2026-03-03T17:40:00Z', description: "A l'entrepôt Xpress Logistics", provider_code: 'warehouse', stage: 'in_transit', stage_source: 'carrier_map' },
        { time: '2026-03-03T08:10:00Z', description: 'Expédition', provider_code: 'picked up', stage: 'accepted', stage_source: 'carrier_map' },
        { time: '2026-03-02T15:05:00Z', description: 'Colis déclaré et prêt pour expédition', provider_code: 'waiting', stage: 'registered', stage_source: 'carrier_map' },
      ] });
    const private_ = parseXpress(changed(d => { Object.assign(d, { shipper: 'PRIVATE SENDER', consignee: 'PRIVATE NAME', address: 'PRIVATE STREET' }); d.status[0].note = 'PRIVATE NOTE'; }), NUMBER);
    expect(JSON.stringify(private_)).not.toContain('PRIVATE');
    expect(parseXpress(changed(d => { delete d.shipper; }), NUMBER).events).toHaveLength(4);
    // A clock keeps the offset the service states.
    expect(parseXpress(changed(d => { d.status[3].created_at = '2026-03-04T08:30:00+01:00'; }), NUMBER).last_update).toBe('2026-03-04T08:30:00+01:00');
  });

  it('orders the statuses by their clocks, and the later of two on one clock first, as the page does', () => {
    const shuffled = parseXpress(changed(d => { d.status.reverse(); }), NUMBER);
    expect(shuffled.events!.map(event => event.provider_code)).toEqual(['delivering', 'warehouse', 'picked up', 'waiting']);
    const tied = parseXpress(changed(d => { d.status[2].created_at = d.status[3].created_at; }), NUMBER);
    expect(tied.events!.slice(0, 2).map(event => event.provider_code)).toEqual(['delivering', 'warehouse']);
  });

  it('dates a delivery by its status and reads a failed attempt and a cancellation', () => {
    const delivered = parseXpress(then('delivered'), NUMBER);
    expect(delivered).toMatchObject({ status: languageStageStatus('delivered'), current_stage: 'delivered', last_status_text: 'Livré',
      last_update: '2026-03-04T08:30:00Z', delivered_at: '2026-03-04T08:30:00Z' });
    expect(delivered.events).toHaveLength(5);
    const absent = parseXpress(then('attempt delivery'), NUMBER);
    expect(absent).toMatchObject({ status: languageStageStatus('failed_attempt'), current_stage: 'failed_attempt', last_status_text: 'Destinataire absent ou destination non trouvée' });
    expect(absent.delivered_at).toBeUndefined();
    expect(parseXpress(then('canceled'), NUMBER)).toMatchObject({ status: languageStageStatus('exception'), current_stage: 'exception', last_status_text: 'Livraison annulée' });
    // A parcel out again after a delivery is no longer delivered.
    const again = parseXpress(changed(d => { d.status.push({ status: 'delivered', created_at: '2026-03-04T08:30:00.000000Z' }, { status: 'delivering', created_at: '2026-03-05T07:30:00.000000Z' }); }), NUMBER);
    expect(again.current_stage).toBe('out_for_delivery');
    expect(again.delivered_at).toBeUndefined();
  });

  it('keeps a status the page does not name, without a stage', () => {
    const result = parseXpress(then('synthetic new step'), NUMBER);
    expect(result.events![0]).toEqual({ time: '2026-03-04T08:30:00Z', description: 'Synthetic new step', provider_code: 'synthetic new step' });
    expect(result).toMatchObject({ status: languageStageStatus('out_for_delivery'), current_stage: 'out_for_delivery', last_status_text: 'Synthetic new step' });
    const alone = parseXpress({ status: [{ status: 'synthetic new step', created_at: '2026-03-04T08:30:00Z' }] }, NUMBER);
    expect(alone).toMatchObject({ status: 'unknown', last_status_text: 'Synthetic new step', events: expect.objectContaining({ length: 1 }) });
    expect(alone.current_stage).toBeUndefined();
    // A delivery under a newer status the page does not name may have been undone, so the parcel takes no stage from it.
    const undone = parseXpress(changed(d => { d.status.push({ status: 'delivered', created_at: '2026-03-04T08:30:00.000000Z' }, { status: 'synthetic new step', created_at: '2026-03-05T07:30:00.000000Z' }); }), NUMBER);
    expect(undone).toMatchObject({ status: 'unknown', last_status_text: 'Synthetic new step' });
    expect(undone.current_stage).toBeUndefined();
    expect(undone.delivered_at).toBeUndefined();
    const long = changed(d => { d.status = Array.from({ length: 120 }, (_, index) => ({ status: 'warehouse', created_at: `2026-03-02T${String(index % 24).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z` })); });
    expect(parseXpress(long, NUMBER)).toMatchObject({ history_truncated: true, events: expect.objectContaining({ length: 100 }) });
  });

  it('rejects a status without a name or a clock with an offset, and a reply without statuses', () => {
    for (const data of [changed(d => { d.status[0].created_at = '2026-03-02 15:05:00'; }), changed(d => { d.status[0].created_at = '2026-03-02T15:05:00'; }),
      changed(d => { d.status[0].created_at = '2026-02-31T15:05:00Z'; }), changed(d => { d.status[0].created_at = 1772463900; }), changed(d => { delete d.status[0].created_at; }),
      changed(d => { delete d.status[0].status; }), changed(d => { d.status[0].status = ''; }), changed(d => { d.status[0].status = 4; }), changed(d => { d.status[0].status = 'Delivered'; }),
      changed(d => { d.status[0].status = 'step-2'; }), changed(d => { d.status[0].status = 'a'.repeat(41); }), changed(d => { d.status[1] = null; }), changed(d => { d.status[1] = 'delivered'; }),
      changed(d => { d.status = []; }), changed(d => { d.status = 'delivered'; }), changed(d => { d.status = {}; }), changed(d => { delete d.status; }), changed(d => { d.status = null; }),
      changed(d => { d.status = Array(501).fill(d.status[0]); }), null, [], [fixture()], 'parcel', {}, { data: fixture() }]) {
      expect(() => parseXpress(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('tells a missing parcel from a moved service, a refusal and a page', () => {
    expect(() => parseXpressReply(204, '', NUMBER)).toThrowError(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseXpressReply(200, '', NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseXpressReply(200, '{}', NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseXpressReply(200, '{"status":false}', NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseXpressReply(404, '{"message":"Not Found"}', NUMBER)).toThrowError(expect.objectContaining({ kind: 'transport' }));
    expect(() => parseXpressReply(404, '<!doctype html><title>Not Found</title>', NUMBER)).toThrowError(expect.objectContaining({ kind: 'transport' }));
    expect(() => parseXpressReply(200, '<!doctype html><html><head><title>Xpress Logistics</title></head><body></body></html>', NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseXpressReply(200, '<html><head><title>Just a moment...</title></head></html>', NUMBER)).toThrowError(expect.objectContaining({ kind: 'challenge' }));
    expect(parseXpressReply(200, JSON.stringify(fixture()), NUMBER).last_status_text).toBe('En cours de livraison');
  });

  it('maps every status of the page to its stage', () => {
    expect(statuses.entries).toHaveLength(7);
    for (const entry of statuses.entries) {
      const known = xpressStatus(entry.code)!;
      expect(known.fr).toBe(entry.wording);
      expect(known.stage).toBe(entry.stage);
      expect(entry.language).toBe('fr');
      expect(statusMap.stage(entry.code, entry.wording)).toBe(entry.stage);
      expect(STAGES).toContain(entry.stage);
    }
    expect(xpressStatus('Delivered')).toBeUndefined();
    expect(statusMap.stage(null, 'Livré')).toBeUndefined();
    expect(statusMap.stage('synthetic new', 'Livré')).toBeUndefined();
  });

  it.each([[403, 'challenge'], [429, 'rate_limited'], [500, 'indeterminate']] as const)('preserves HTTP %i without another request', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({}, status, { 'retry-after': '60' }));
    await expect(new XpressLogisticsTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind, ...(status === 429 ? { retryAfterMs: 60_000 } : {}) });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reports the service\'s empty answer as not found, and a page as a changed service', async () => {
    const missing = vi.fn<typeof fetch>().mockResolvedValue(response(null, 204));
    await expect(new XpressLogisticsTracker({ fetcher: missing }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'not_found' });
    expect(missing).toHaveBeenCalledOnce();
    const moved = vi.fn<typeof fetch>().mockResolvedValue(response({ message: 'Not Found' }, 404));
    await expect(new XpressLogisticsTracker({ fetcher: moved }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'transport' });
    const page = vi.fn<typeof fetch>().mockResolvedValue(response('<!doctype html><title>Xpress Logistics</title>', 200, { 'content-type': 'text/html' }));
    await expect(new XpressLogisticsTracker({ fetcher: page }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'schema' });
  });

  it('honors cancellation before I/O and in a pending request', async () => {
    const before = new AbortController(); before.abort(); const never = vi.fn();
    expect(() => new XpressLogisticsTracker({ fetcher: never }).fetch(NUMBER, { signal: before.signal })).toThrow();
    expect(never).not.toHaveBeenCalled();
    const during = new AbortController();
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); during.abort(new Error('synthetic cancellation'));
    });
    await expect(new XpressLogisticsTracker({ fetcher }).fetch(NUMBER, { signal: during.signal })).rejects.toThrow('synthetic cancellation');
  });

  it('routes an explicit selection, takes nine digits only and offers no number rule', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(fixture()));
    const tracker = createTracker({ fetcher, env: {}, providers: [] });
    const result = await tracker.track({ carrier: 'xpress-logistics-lu', number: NUMBER });
    expect(result.source).toBe('xpress-logistics-lu');
    expect(result.result.events).toHaveLength(4);
    expect((await tracker.track({ carrier: 'xpress-logistics-lu', number: NUMBER, language: 'en' })).result.last_status_text).toBe('En cours de livraison');
    expect(detectCarrierMatch(NUMBER).candidates ?? []).not.toContain('xpress-logistics-lu');
    expect(recognitionCandidates(NUMBER).map(candidate => candidate.carrier)).not.toContain('xpress-logistics-lu');
    for (const number of ['', '12345678', '1234567890', 'A23456789', '12345678A', '1234 5678', '123-456-789', '123456789/1']) expect(() => normalizeXpressNumber(number)).toThrow();
    expect(normalizeXpressNumber(' 123456789 ')).toBe('123456789');
  });
});
