import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { recognitionCandidates } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { languageStageStatus, STAGES } from '../../core/status/index.js';
import { normalizeStatusWording, statusGapNote } from '../../core/status/statusMap.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { GruberLogisticsTracker } from './adapter.js';
import { normalizeGruberNumber, parseGruber, parseGruberConfig, parseGruberReply } from './parser.js';
import { gruberEventName, gruberStage, statusMap } from './status.js';

type Reply = { id_tracking: string; events: { event_type: { name: string; description: string }; datetime: string | null; expected_datetime: string | null; isExpected: boolean; timezone: string; address: { localita: string; nazione: string }; note: string }[] } & Record<string, unknown>;
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/tracking.json', import.meta.url), 'utf8')) as Reply;
// The public sample the fixture answers.
const NUMBER = fixture().id_tracking;
const changed = (edit: (reply: Reply) => void) => { const data = fixture(); edit(data); return data; };
// One more event on top of the fixture's, a day after its newest.
const then = (name: string, description = `Synthetic ${name}`) => changed(reply => {
  reply.events.push({ event_type: { name, description }, expected_datetime: null, isExpected: false, timezone: 'Europe/Paris',
    datetime: '2026-01-31T10:00:00+0100', address: { localita: 'SYNTHETIC', nazione: 'FR' }, note: '' });
});
const CONFIG = { VUE_APP_GATEWAY_BASE_URL: 'https://gw.gruber-logistics.com', VUE_APP_TRACKING_API_KEY: '00000000-0000-4000-8000-000000000000' };
const response = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
// The page's settings, then the gateway's answer.
const gateway = (answer: Response) => vi.fn<typeof fetch>().mockResolvedValueOnce(response(CONFIG)).mockResolvedValueOnce(answer);
const statuses = JSON.parse(readFileSync(new URL('./statuses.json', import.meta.url), 'utf8')) as { entries: { code?: string; wording?: string; stage: string | null; language: string }[] };

describe('GRUBER Logistics guest adapter', () => {
  it('reads the page\'s settings, then asks the gateway for the whole number with the page\'s key', async () => {
    const fetcher = gateway(response(fixture()));
    const recorder = { ...NOOP_RECORDER, step: vi.fn() };
    const result = await new GruberLogisticsTracker({ fetcher, recorder, userAgent: 'SyntheticHost/1' }).fetch(` ${NUMBER.toLowerCase()} `, { budgetMs: 4000 });
    expect(result.events).toHaveLength(7);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [settings, settingsInit] = fetcher.mock.calls[0]!;
    expect(settings).toBe('https://glapptracking.gruber-logistics.com/config.json');
    expect(settingsInit).toMatchObject({ redirect: 'manual', signal: expect.any(AbortSignal), headers: { 'User-Agent': 'SyntheticHost/1' } });
    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe(`https://gw.gruber-logistics.com/tracking/v1/tracking/order/${NUMBER}`);
    expect(init).toMatchObject({ redirect: 'manual', signal: expect.any(AbortSignal), headers: { 'User-Agent': 'SyntheticHost/1' } });
    const headers = new Headers(init!.headers);
    expect(headers.get('x-apikey')).toBe(CONFIG.VUE_APP_TRACKING_API_KEY);
    expect(headers.get('origin')).toBe('https://glapptracking.gruber-logistics.com');
    expect(headers.has('cookie')).toBe(false);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'gruber-logistics', step: 'direct', outcome: 'ok' }));
  });

  it('reads the events newest first with the page\'s names, their stated offsets and places', () => {
    const data = fixture();
    const result = parseGruber(data, NUMBER);
    expect(result).toMatchObject({ status: languageStageStatus('delivered'), current_stage: 'delivered', current_stage_source: 'carrier_map',
      last_status_text: 'Shipment delivered', last_update: '2026-01-30T14:00:00+01:00', delivered_at: '2026-01-30T14:00:00+01:00', expected_delivery: null });
    expect(result.events!.map(event => [event.provider_code, event.stage ?? null, event.time])).toEqual([
      ['COR', 'delivered', '2026-01-30T14:00:00+01:00'],
      ['402', null, '2026-01-30T09:08:00Z'],
      ['SIT', 'in_transit', '2026-01-30T08:58:00Z'],
      ['SIT', 'in_transit', '2026-01-27T21:24:00Z'],
      ['VAD', 'in_transit', '2026-01-27T09:30:00+01:00'],
      ['VPG', 'in_transit', '2026-01-23T11:10:00+01:00'],
      ['RIE', 'accepted', '2026-01-21T14:11:00+01:00'],
    ]);
    expect(result.events!.map(event => event.description)).toEqual(['Shipment delivered', 'Shipment stock closed', 'In transit at partner depot',
      'In transit at partner depot', 'Arrival at warehouse', 'Departed from Gruber warehouse', 'Pickup completed']);
    const oldest = data.events[0]!.address;
    expect(result.events!.at(-1)!.location).toBe(`${oldest.localita}, ${oldest.nazione}`);
    // A partner's event without a place has none.
    expect(result.events![1]!.location).toBeUndefined();
    // The stops, references, goods and documents stay out.
    const text = JSON.stringify(result);
    for (const field of ['order_number', 'BARCODE', String(data.stops && (data.stops as { address: { zip: string } }[])[1]!.address.zip)]) expect(text).not.toContain(field);
  });

  it('names the events in the reader\'s language, and an event the page does not name by the gateway\'s wording', () => {
    expect(parseGruber(fixture(), NUMBER, 'it').events!.map(event => event.description).slice(0, 2)).toEqual(['Spedizione consegnata', 'Giacenza chiusa']);
    expect(parseGruber(fixture(), NUMBER, 'de').last_status_text).toBe('Sendung zugestellt');
    expect(parseGruber(then('XYZ', 'Evento sintetico'), NUMBER).events![0]).toMatchObject({ provider_code: 'XYZ', description: 'Evento sintetico' });
    expect(parseGruber(then('XYZ', ''), NUMBER).events![0]).toMatchObject({ provider_code: 'XYZ', description: 'XYZ' });
    // An unnamed code may have undone the delivery before it.
    expect(parseGruber(then('XYZ'), NUMBER)).toMatchObject({ status: 'unknown', last_status_text: 'Synthetic XYZ' });
    expect(parseGruber(then('XYZ'), NUMBER).current_stage).toBeUndefined();
  });

  it('lets a newer event undo a delivery, and keeps it under one that moves nothing', () => {
    expect(parseGruber(then('CMG'), NUMBER)).toMatchObject({ current_stage: 'failed_attempt', last_status_text: 'Delivery failed - back to stock' });
    expect(parseGruber(then('CMG'), NUMBER).delivered_at).toBeUndefined();
    expect(parseGruber(then('404'), NUMBER)).toMatchObject({ current_stage: 'delivered', delivered_at: '2026-01-30T14:00:00+01:00' });
  });

  it('skips the events still expected and reports a shipment with none yet as listed', () => {
    const planned = changed(reply => {
      reply.events.push({ ...reply.events[6]!, isExpected: true, datetime: null, expected_datetime: '2026-02-02T00:00:00+0100' });
    });
    expect(parseGruber(planned, NUMBER).events).toHaveLength(7);
    const flagged = changed(reply => { reply.events.push({ ...reply.events[6]!, isExpected: true }); });
    expect(parseGruber(flagged, NUMBER).events).toHaveLength(7);
    const waiting = changed(reply => { reply.events = reply.events.map(event => ({ ...event, isExpected: true, datetime: null })); });
    expect(() => parseGruber(waiting, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate', name: 'NoHistoryError', reason: 'listed' }));
    expect(() => parseGruber(changed(reply => { reply.events = []; }), NUMBER)).toThrow(expect.objectContaining({ reason: 'listed' }));
  });

  it('rejects a reply about another number, an event without its code or a stated offset, and a malformed reply', () => {
    expect(() => parseGruber(changed(reply => { reply.id_tracking = 'ZZ0000000000'; }), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseGruber(changed(reply => { delete (reply as Partial<Reply>).id_tracking; }), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseGruber(changed(reply => { reply.events[2]!.event_type.name = ''; }), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseGruber(changed(reply => { reply.events[2]!.datetime = '2026-01-27T09:30:00'; }), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseGruber(changed(reply => { (reply as Record<string, unknown>).events = {}; }), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseGruber([], NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    // The number is matched whole, in any case.
    expect(parseGruber(changed(reply => { reply.id_tracking = reply.id_tracking.toLowerCase(); }), NUMBER).events).toHaveLength(7);
  });

  it('tells an unknown number from a missing route, an old shipment, unreadable data, a hand-off and a verification page', () => {
    expect(() => parseGruberReply(404, JSON.stringify({ statusCode: 404, message: 'Tracking not found' }), NUMBER)).toThrow(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseGruberReply(404, '', NUMBER)).toThrow(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseGruberReply(404, JSON.stringify({ statusCode: 404, message: 'Cannot GET /tracking/order/X', error: 'Not Found' }), NUMBER))
      .toThrow(expect.objectContaining({ kind: 'transport' }));
    expect(() => parseGruberReply(404, '<!doctype html><title>Not found</title>', NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseGruberReply(406, '{}', NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate', reason: 'history_expired' }));
    expect(() => parseGruberReply(422, '{}', NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    expect(() => parseGruberReply(200, JSON.stringify({ redirectUrl: 'https://example.test/' }), NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    expect(() => parseGruberReply(200, '<html><title>Just a moment...</title></html>', NUMBER)).toThrow(expect.objectContaining({ kind: 'challenge' }));
    expect(() => parseGruberReply(200, '<html><title>GRUBER</title></html>', NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('takes the gateway only from GRUBER\'s own host over HTTPS, with a plain key', () => {
    expect(parseGruberConfig(JSON.stringify(CONFIG))).toEqual({ base: 'https://gw.gruber-logistics.com', key: CONFIG.VUE_APP_TRACKING_API_KEY });
    expect(parseGruberConfig(JSON.stringify({ ...CONFIG, VUE_APP_GATEWAY_BASE_URL: 'https://gw.gruber-logistics.com/' })).base).toBe('https://gw.gruber-logistics.com');
    for (const base of ['http://gw.gruber-logistics.com', 'https://gw.gruber-logistics.com.example.test', 'https://example.test', 'not a url', '']) {
      expect(() => parseGruberConfig(JSON.stringify({ ...CONFIG, VUE_APP_GATEWAY_BASE_URL: base }))).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    for (const key of ['', 'short', 'a key with spaces', 'x'.repeat(201)]) {
      expect(() => parseGruberConfig(JSON.stringify({ ...CONFIG, VUE_APP_TRACKING_API_KEY: key }))).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    expect(() => parseGruberConfig('<html><title>Attention Required!</title></html>')).toThrow(expect.objectContaining({ kind: 'challenge' }));
  });

  it('stages each named code or declares why it moves nothing, as statuses.json records', () => {
    const codes = statuses.entries.filter(entry => entry.code && entry.language === 'en');
    expect(codes).toHaveLength(61);
    for (const entry of codes) {
      expect(gruberEventName(entry.code!, 'en'), entry.code).toBe(entry.wording);
      expect(gruberStage(entry.code!) ?? null, entry.code).toBe(entry.stage);
      expect(statusMap.stage(entry.code!, normalizeStatusWording(entry.wording!)) ?? null).toBe(entry.stage);
      if (entry.stage === null) expect(statusGapNote(statusMap, entry.code!, normalizeStatusWording(entry.wording!)), entry.code).toBeTruthy();
      else expect(STAGES).toContain(entry.stage);
    }
    for (const entry of statuses.entries.filter(entry => entry.code && entry.language !== 'en')) {
      expect(gruberEventName(entry.code!, entry.language as 'it' | 'de'), entry.code).toBe(entry.wording);
    }
    expect(statusMap.gaps.every(gap => gap.code && gruberEventName(gap.code, 'en') && gruberStage(gap.code) === undefined)).toBe(true);
  });

  it.each([[403, 'challenge'], [429, 'rate_limited'], [500, 'indeterminate'], [401, 'challenge'], [400, 'transport'], [302, 'transport']] as const)('preserves the gateway\'s HTTP %i', async (status, kind) => {
    const fetcher = gateway(response(status === 302 ? '' : {}, status, { 'retry-after': '60', ...(status === 302 ? { location: 'https://example.test/' } : {}) }));
    await expect(new GruberLogisticsTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind, ...(status === 429 ? { retryAfterMs: 60_000 } : {}) });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops when the page\'s settings are blocked or unreadable, without asking the gateway', async () => {
    const blocked = vi.fn<typeof fetch>().mockResolvedValue(response('', 403));
    await expect(new GruberLogisticsTracker({ fetcher: blocked }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'challenge' });
    expect(blocked).toHaveBeenCalledOnce();
    const page = vi.fn<typeof fetch>().mockResolvedValue(response('<!doctype html><title>GRUBER</title>', 200, { 'content-type': 'text/html' }));
    await expect(new GruberLogisticsTracker({ fetcher: page }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'schema' });
    expect(page).toHaveBeenCalledOnce();
  });

  it('reports the gateway\'s unknown number as not found', async () => {
    const fetcher = gateway(response({ statusCode: 404, message: 'Tracking not found' }, 404));
    await expect(new GruberLogisticsTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'not_found' });
  });

  it('honors cancellation before I/O and in a pending request', async () => {
    const before = new AbortController(); before.abort(); const never = vi.fn();
    expect(() => new GruberLogisticsTracker({ fetcher: never }).fetch(NUMBER, { signal: before.signal })).toThrow();
    expect(never).not.toHaveBeenCalled();
    const during = new AbortController();
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); during.abort(new Error('synthetic cancellation'));
    });
    await expect(new GruberLogisticsTracker({ fetcher }).fetch(NUMBER, { signal: during.signal })).rejects.toThrow('synthetic cancellation');
  });

  it('routes an explicit selection in the reader\'s language and offers no number rule', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => response(String(url).endsWith('/config.json') ? CONFIG : fixture()));
    const tracker = createTracker({ fetcher, env: {}, providers: [] });
    const result = await tracker.track({ carrier: 'gruber-logistics', number: NUMBER });
    expect(result.source).toBe('gruber-logistics');
    expect(result.result.events).toHaveLength(7);
    expect((await tracker.track({ carrier: 'gruber-logistics', number: NUMBER, language: 'it-IT' })).result.last_status_text).toBe('Spedizione consegnata');
    expect((await tracker.track({ carrier: 'gruber-logistics', number: NUMBER, language: 'de-AT' })).result.last_status_text).toBe('Sendung zugestellt');
    expect((await tracker.track({ carrier: 'gruber-logistics', number: NUMBER, language: 'fr' })).result.last_status_text).toBe('Shipment delivered');
    expect(detectCarrierMatch(NUMBER).candidates ?? []).not.toContain('gruber-logistics');
    expect(recognitionCandidates(NUMBER).map(candidate => candidate.carrier)).not.toContain('gruber-logistics');
    for (const number of ['', '00000', '0000 0000 0000', '0000-00000000', '0'.repeat(31)]) expect(() => normalizeGruberNumber(number)).toThrow();
    expect(normalizeGruberNumber(` ${NUMBER.toLowerCase()} `)).toBe(NUMBER);
  });
});
