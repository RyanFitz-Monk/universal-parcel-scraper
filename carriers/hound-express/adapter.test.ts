import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { recognitionCandidates } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { languageStageStatus, STAGES } from '../../core/status/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { HoundExpressTracker } from './adapter.js';
import { normalizeHoundNumber, parseHound, parseHoundReply } from './parser.js';
import { houndStage, statusMap } from './status.js';

const NUMBER = '0000000001700017';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/tracking.json', import.meta.url), 'utf8'));
const changed = (edit: (guide: ReturnType<typeof fixture>[0]) => void) => { const data = fixture(); edit(data[0]); return data; };
const response = (data: unknown, status = 200, headers: HeadersInit = {}) => new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
const statuses = JSON.parse(readFileSync(new URL('./statuses.json', import.meta.url), 'utf8')) as { entries: { code?: string; wording?: string; stage: string }[] };
const UNKNOWN = [{ isReturn: false, isExportacion: false, resultDetails: [], wsWarnings: [{ code: 'GONULL', description: 'We don\'t have any information about the guide: 0000000001700017' }] }];
// One more scan on top of the fixture's, an hour after its newest.
const then = (id: number, english = `SYNTHETIC ${id}`, spanish = `SINTETICO ${id}`) => changed(guide => {
  guide.resultDetails.push({ dateTime: '2026-01-06 10:30:00', location: 'Monterrey', statusObj: { id, code: 'SYN', description: spanish, description_en: english } });
});

describe('Hound Express guest adapter', () => {
  it('asks for the whole guide once, with the page\'s key and the supplied transport and budget', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(fixture()));
    const recorder = { ...NOOP_RECORDER, step: vi.fn() };
    const result = await new HoundExpressTracker({ fetcher, recorder, userAgent: 'SyntheticHost/1' }).fetch(` ${NUMBER} `, { budgetMs: 4000 });
    expect(result.events).toHaveLength(4);
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://ws_pods.hound-express.com/Sabueso/ws/deliveryServices/trackOrder');
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', signal: expect.any(AbortSignal),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'SyntheticHost/1' } });
    expect(JSON.parse(String(init!.body))).toEqual([{ guideNumber: NUMBER }]);
    const headers = new Headers(init!.headers);
    expect(headers.get('partnerKey')).toMatch(/^[\w%]{40,}$/);
    expect(headers.has('cookie')).toBe(false);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'hound-express', step: 'direct', outcome: 'ok' }));
  });

  it('reads the scans newest first in the reader\'s language, without the reference, the notes or the coordinates', () => {
    expect(parseHound(fixture(), NUMBER)).toEqual({ status: languageStageStatus('in_transit'), current_stage: 'in_transit', current_stage_source: 'carrier_map',
      last_status_text: 'SYNTHETIC ON ROUTE', last_update: '2026-01-06T09:30:00-06:00', expected_delivery: null,
      events: [
        { time: '2026-01-06T09:30:00-06:00', description: 'SYNTHETIC ON ROUTE', provider_code: '3', location: 'Monterrey', stage: 'in_transit', stage_source: 'carrier_map' },
        { time: '2026-01-06T07:05:00-06:00', description: 'SYNTHETIC AT DESTINATION BRANCH', provider_code: '39', location: 'Monterrey', stage: 'in_transit', stage_source: 'carrier_map' },
        { time: '2026-01-05T18:40:00-06:00', description: 'SYNTHETIC COLLECTED', provider_code: '43', location: 'Ciudad de Mexico', stage: 'accepted', stage_source: 'carrier_map' },
        { time: '2026-01-05T09:15:00-06:00', description: 'SYNTHETIC DOCUMENTED', provider_code: '1', location: 'Ciudad de Mexico', stage: 'registered', stage_source: 'carrier_map' },
      ] });
    const spanish = parseHound(fixture(), NUMBER, 'es');
    expect(spanish.events!.map(event => event.description)).toEqual(['EN RUTA SINTETICA', 'EN SUCURSAL DESTINO SINTETICA', 'RECOLECTADO SINTETICO', 'DOCUMENTADO SINTETICO']);
    const text = JSON.stringify(parseHound(fixture(), NUMBER));
    for (const kept of ['RECEIVER', 'REF', 'note', 'long description', '19.43', '-99.13']) expect(text).not.toContain(kept);
    // A status without its English wording keeps the Spanish one.
    expect(parseHound(changed(guide => { delete guide.resultDetails[3].statusObj.description_en; }), NUMBER).last_status_text).toBe('EN RUTA SINTETICA');
    // A status id may come as digits.
    expect(parseHound(changed(guide => { guide.resultDetails[3].statusObj.id = '3'; }), NUMBER).events![0]!).toMatchObject({ provider_code: '3', stage: 'in_transit' });
    expect(parseHound(changed(guide => { delete guide.resultDetails[3].location; }), NUMBER).events![0]!.location).toBeUndefined();
  });

  it('reads the offset the service states, and a bare clock on central Mexico\'s UTC−06:00', () => {
    const stated = parseHound(changed(guide => { guide.resultDetails[3].dateTimeISO = '2026-01-06T10:30:00-05:00'; }), NUMBER);
    expect(stated.events![0]!.time).toBe('2026-01-06T10:30:00-05:00');
    const bare = parseHound(changed(guide => { delete guide.resultDetails[3].dateTimeISO; }), NUMBER);
    expect(bare.events![0]!.time).toBe('2026-01-06T09:30:00-06:00');
    // A summer scan stays on UTC−06:00: central Mexico has kept no daylight saving time since 2022.
    expect(parseHound(changed(guide => { guide.resultDetails[0].dateTime = '2026-07-05 09:15:00'; for (const row of guide.resultDetails.slice(1)) row.dateTime = '2026-07-06 09:15:00'; delete guide.resultDetails[3].dateTimeISO; }), NUMBER)
      .events!.at(-1)!.time).toBe('2026-07-05T09:15:00-06:00');
  });

  it('orders the scans by their clocks, and equal clocks as the service lists them', () => {
    const shuffled = parseHound(changed(guide => { guide.resultDetails.reverse(); }), NUMBER);
    expect(shuffled.events!.map(event => event.provider_code)).toEqual(['3', '39', '43', '1']);
    const tied = parseHound(changed(guide => { guide.resultDetails[2].dateTime = '2026-01-06 09:30:00'; }), NUMBER);
    expect(tied.events!.slice(0, 2).map(event => event.provider_code)).toEqual(['3', '39']);
  });

  it('dates a delivery by its scan and names a failed attempt', () => {
    const delivered = parseHound(then(2, 'DELIVERED POD IN SYSTEM', 'ENTREGADO POD EN SISTEMA'), NUMBER, 'es');
    expect(delivered).toMatchObject({ status: languageStageStatus('delivered'), current_stage: 'delivered', last_status_text: 'ENTREGADO POD EN SISTEMA',
      last_update: '2026-01-06T10:30:00-06:00', delivered_at: '2026-01-06T10:30:00-06:00' });
    expect(delivered.events).toHaveLength(5);
    // Who took the parcel, named with the delivery only.
    expect(delivered.signed_by).toBe('SYNTHETIC RECEIVER');
    expect(parseHound(then(2), NUMBER, 'es').signed_by).toBe('SYNTHETIC RECEIVER');
    expect(parseHound(changed(guide => { delete guide.realReceiverPerson; guide.resultDetails.push({ dateTime: '2026-01-06 10:30:00', statusObj: { id: 2, description: 'ENTREGADO' } }); }), NUMBER).signed_by).toBeUndefined();
    for (const id of [31, 63, 1012, 1014]) expect(parseHound(then(id), NUMBER)).toMatchObject({ current_stage: 'delivered', delivered_at: '2026-01-06T10:30:00-06:00' });
    const missed = parseHound(then(46, 'NO ONE TO RECEIVE'), NUMBER);
    expect(missed).toMatchObject({ status: languageStageStatus('failed_attempt'), current_stage: 'failed_attempt', last_status_text: 'NO ONE TO RECEIVE' });
    expect(missed.delivered_at).toBeUndefined();
    expect(missed.signed_by).toBeUndefined();
  });

  it('keeps a problem or a status the script does not list with its wording and no stage', () => {
    for (const id of [55, 61, 32, 53, 17, 20, 7, 999]) {
      const result = parseHound(then(id), NUMBER);
      expect(result.events![0]).toEqual({ time: '2026-01-06T10:30:00-06:00', description: `SYNTHETIC ${id}`, provider_code: String(id), location: 'Monterrey' });
      expect(result).toMatchObject({ current_stage: 'in_transit', last_status_text: `SYNTHETIC ${id}` });
    }
    // A delivery under a newer unstaged status may have been undone, so the guide takes no stage from it.
    const undone = changed(guide => {
      guide.resultDetails.push({ dateTime: '2026-01-06 10:30:00', statusObj: { id: 2, description: 'ENTREGADO' } }, { dateTime: '2026-01-06 11:30:00', statusObj: { id: 7, description: 'SINTETICO' } });
    });
    expect(parseHound(undone, NUMBER)).toMatchObject({ status: 'unknown', last_status_text: 'SINTETICO' });
    expect(parseHound(undone, NUMBER).delivered_at).toBeUndefined();
    const long = changed(guide => { guide.resultDetails = Array.from({ length: 120 }, (_, index) => ({ dateTime: `2026-01-0${1 + (index % 9)} 10:${String(index % 60).padStart(2, '0')}:00`, statusObj: { id: 3, description: 'EN RUTA' } })); });
    expect(parseHound(long, NUMBER)).toMatchObject({ history_truncated: true, events: expect.objectContaining({ length: 100 }) });
  });

  it('rejects a reply that names another guide', () => {
    for (const own of ['0000000001700018', `${NUMBER}1`, `1${NUMBER}`, '', null, undefined, 17, {}, [NUMBER]]) {
      expect(() => parseHound(changed(guide => { guide.guideNumber = own; }), NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
    for (const own of [NUMBER, ` ${NUMBER} `, '0000-0000-0170-0017']) expect(parseHound(changed(guide => { guide.guideNumber = own; }), NUMBER).events).toHaveLength(4);
    expect(parseHound(changed(guide => { guide.guideNumber = 'hp0000000001700017'; }), 'HP0000000001700017').events).toHaveLength(4);
  });

  it('rejects a scan without a status or a readable clock, and a malformed reply', () => {
    for (const data of [changed(guide => { guide.resultDetails[0].dateTime = '2026-01-05T09:15:00'; }), changed(guide => { guide.resultDetails[0].dateTime = '05/01/2026 09:15'; }),
      changed(guide => { guide.resultDetails[0].dateTime = '2026-02-31 09:15:00'; }), changed(guide => { delete guide.resultDetails[0].dateTime; }),
      changed(guide => { guide.resultDetails[3].dateTimeISO = '2026-01-06T09:30:00'; delete guide.resultDetails[3].dateTime; }),
      changed(guide => { delete guide.resultDetails[0].statusObj; }), changed(guide => { guide.resultDetails[0].statusObj.id = 1.5; }), changed(guide => { guide.resultDetails[0].statusObj.id = 'DOC'; }),
      changed(guide => { guide.resultDetails[0].statusObj.id = -1; }), changed(guide => { delete guide.resultDetails[0].statusObj.id; }),
      changed(guide => { guide.resultDetails[0].statusObj.description = ''; guide.resultDetails[0].statusObj.description_en = ''; }),
      changed(guide => { guide.resultDetails[0] = null; }), changed(guide => { guide.resultDetails = {}; }), changed(guide => { guide.resultDetails = Array(501).fill(guide.resultDetails[0]); }),
      changed(guide => { guide.resultDetails = []; }), [...fixture(), ...fixture()], null, [], {}, 'guide', fixture()[0]]) {
      expect(() => parseHound(data, NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('tells an unknown guide from a failed read, a page and a verification page', () => {
    expect(() => parseHoundReply(JSON.stringify(UNKNOWN), NUMBER)).toThrowError(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseHound([{ ...UNKNOWN[0], resultDetails: undefined }], NUMBER)).toThrowError(expect.objectContaining({ kind: 'not_found' }));
    // The page's "not operated in our system".
    expect(() => parseHound(changed(guide => { guide.flag = 100; }), NUMBER)).toThrowError(expect.objectContaining({ kind: 'not_found' }));
    // A warning about the guide asked is not enough while the reply names a guide without its history.
    expect(() => parseHound([{ ...UNKNOWN[0], guideNumber: NUMBER }], NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseHound([{ ...UNKNOWN[0], wsWarnings: [{ code: 'SYNTHETIC' }] }], NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    for (const code of ['MAXTRKEX', 'ERROR']) {
      expect(() => parseHound([{ ...UNKNOWN[0], wsErrors: [{ code }] }], NUMBER)).toThrowError(expect.objectContaining({ kind: 'transport' }));
    }
    expect(() => parseHoundReply('<!doctype html><html><head><title>Hound Express</title></head><body></body></html>', NUMBER)).toThrowError(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseHoundReply('<html><head><title>Just a moment...</title></head></html>', NUMBER)).toThrowError(expect.objectContaining({ kind: 'challenge' }));
    expect(parseHoundReply(JSON.stringify(fixture()), NUMBER, 'es').last_status_text).toBe('EN RUTA SINTETICA');
  });

  it('stages each of the script\'s steps and the documented codes', () => {
    expect(statuses.entries).toHaveLength(48);
    for (const entry of statuses.entries) {
      expect(STAGES).toContain(entry.stage);
      expect(statusMap.stage(entry.code ?? null, entry.wording ?? '')).toBe(entry.stage);
      if (entry.code) expect(houndStage(entry.code)).toBe(entry.stage);
    }
    expect(houndStage('DLV')).toBeUndefined();
    expect(statusMap.stage(null, 'ENTREGADO')).toBeUndefined();
    // The FAQ's problems stage by their wording under any id the script leaves unstaged, and give way to a staged id.
    expect(parseHound(then(17, 'Held at customs', 'Detenido en aduana'), NUMBER)).toMatchObject({ current_stage: 'customs', last_status_text: 'Held at customs' });
    expect(parseHound(then(9, 'SYNTHETIC', ' IMPORTACIÓN  prohibida '), NUMBER).events![0]!.stage).toBe('exception');
    expect(houndStage('2', 'Held at customs')).toBe('delivered');
    expect(houndStage('17', 'Held at customs today')).toBeUndefined();
  });

  it.each([[403, 'challenge'], [429, 'rate_limited'], [500, 'indeterminate'], [404, 'transport'], [302, 'transport']] as const)('preserves HTTP %i without another request', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(status === 302 ? '' : {}, status, { 'retry-after': '60', ...(status === 302 ? { location: 'https://example.test/' } : {}) }));
    await expect(new HoundExpressTracker({ fetcher }).fetch(NUMBER)).rejects.toMatchObject({ kind, ...(status === 429 ? { retryAfterMs: 60_000 } : {}) });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('reports the service\'s unknown guide as not found, and a page as a changed service', async () => {
    const missing = vi.fn<typeof fetch>().mockResolvedValue(response(UNKNOWN));
    await expect(new HoundExpressTracker({ fetcher: missing }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'not_found' });
    expect(missing).toHaveBeenCalledOnce();
    const page = vi.fn<typeof fetch>().mockResolvedValue(response('<!doctype html><title>Hound Express</title>', 200, { 'content-type': 'text/html' }));
    await expect(new HoundExpressTracker({ fetcher: page }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'schema' });
  });

  it('honors cancellation before I/O and in a pending request', async () => {
    const before = new AbortController(); before.abort(); const never = vi.fn();
    expect(() => new HoundExpressTracker({ fetcher: never }).fetch(NUMBER, { signal: before.signal })).toThrow();
    expect(never).not.toHaveBeenCalled();
    const during = new AbortController();
    const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }); during.abort(new Error('synthetic cancellation'));
    });
    await expect(new HoundExpressTracker({ fetcher }).fetch(NUMBER, { signal: during.signal })).rejects.toThrow('synthetic cancellation');
  });

  it('routes an explicit selection in the reader\'s language and offers no number rule', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response(fixture()));
    const tracker = createTracker({ fetcher, env: {}, providers: [] });
    const result = await tracker.track({ carrier: 'hound-express', number: NUMBER });
    expect(result.source).toBe('hound-express');
    expect(result.result.events).toHaveLength(4);
    expect((await tracker.track({ carrier: 'hound-express', number: NUMBER, language: 'es-MX' })).result.last_status_text).toBe('EN RUTA SINTETICA');
    expect((await tracker.track({ carrier: 'hound-express', number: NUMBER, language: 'fr' })).result.last_status_text).toBe('SYNTHETIC ON ROUTE');
    expect(detectCarrierMatch(NUMBER).candidates ?? []).not.toContain('hound-express');
    expect(recognitionCandidates(NUMBER).map(candidate => candidate.carrier)).not.toContain('hound-express');
    for (const number of ['', '000000017', '0000 0000 0000 0017', '0000-0000001700017', 'HP000000000170001/', '0'.repeat(31)]) expect(() => normalizeHoundNumber(number)).toThrow();
    for (const number of [NUMBER, 'HP0000000001700017', '0000000001700000000017']) expect(normalizeHoundNumber(` ${number} `)).toBe(number);
    expect(normalizeHoundNumber('hp0000000001700017')).toBe('HP0000000001700017');
  });
});
