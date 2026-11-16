import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { carrierDefinition, carrierRequirements, requirementSatisfied } from '../../core/catalog/index.js';
import { statusMapAnswer } from '../../core/catalog/statusMaps.js';
import { detectCarrierMatch, parseTrackingInput } from '../../core/detection/index.js';
import { InputRequiredError, InvalidInputError } from '../../core/errors/index.js';
import { normalizeCarrierResult, type CarrierEvent } from '../../core/result/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { adapter, GLS_NL_API, GlsNlTracker, glsNlDetailsUrl } from './adapter.js';
import { normalizeGlsNlNumber, normalizeGlsNlPostcode, parseGlsNl } from './parser.js';
import { statusMap } from './status.js';
import statuses from './statuses.json' with { type: 'json' };

type Reply = Record<string, unknown> & { parcelNo: string; gpNo: string | null; uniqueNo: string };
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as Reply;
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body),
  { status: 200, ...init, headers: { 'Content-Type': 'application/json; charset=utf-8', ...init.headers } });
const carrier = (fetcher: typeof fetch) => adapter({ fetcher, recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });
const failure = (pending: Promise<unknown>) => pending.then(() => undefined, (error: unknown) => error as Record<string, unknown>);
const rows = (events: readonly CarrierEvent[]) => events.map((event) => [event.local_time, event.provider_code, event.stage ?? null]);
const parsed = (name: string, number?: string) => {
  const reply = fixture(name);
  return normalizeCarrierResult(parseGlsNl(reply, number ?? reply.parcelNo));
};
// A postcode made up for the requests; GLS's replies are matched by number.
const POSTCODE = '1012 ab';

describe('GLS Netherlands HTTP adapter', () => {
  it('asks the tracking API once with the whole number and the postcode, through the supplied transport', async () => {
    const reply = fixture('delivered');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(reply));
    const recorder = { ...NOOP_RECORDER, step: vi.fn(), lookup: vi.fn() };
    const spaced = reply.parcelNo.replace(/(\d{4})/g, '$1 ');
    await expect(new GlsNlTracker({ fetcher, recorder, userAgent: 'SyntheticHost/1.0' })
      .fetch(` ${spaced} `, ` ${POSTCODE} `, { budgetMs: 1000.5 })).resolves.toMatchObject({ current_stage: 'delivered' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(`${GLS_NL_API}/${reply.parcelNo}/postalcode/1012AB/details/en-GB`);
    expect(init).toMatchObject({ method: 'GET', signal: expect.any(AbortSignal),
      headers: { Accept: 'application/json', 'User-Agent': 'SyntheticHost/1.0' } });
    expect(init!.body).toBeUndefined();
    expect(new Headers(init!.headers).has('cookie')).toBe(false);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'gls-nl', step: 'direct', outcome: 'ok' }));
  });

  it('sends a Dutch postcode without its space and any other as typed, and asks nothing without one', async () => {
    expect(normalizeGlsNlPostcode(' 1012 ab ')).toBe('1012AB');
    expect(normalizeGlsNlPostcode('1012AB')).toBe('1012AB');
    expect(normalizeGlsNlPostcode('d-10115')).toBe('D-10115');
    expect(normalizeGlsNlPostcode('2000')).toBe('2000');
    expect(glsNlDetailsUrl('zz00zz00', 'ec1a 1bb')).toBe(`${GLS_NL_API}/ZZ00ZZ00/postalcode/EC1A%201BB/details/en-GB`);
    const fetcher = vi.fn<typeof fetch>();
    for (const postcode of [undefined, null, '', '   ']) {
      await expect(carrier(fetcher).track({ number: '00000000000000', postcode })).rejects.toBeInstanceOf(InputRequiredError);
    }
    await expect(carrier(fetcher).track({ number: '00000000000000', postcode: '#?' })).rejects.toBeInstanceOf(InvalidInputError);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('takes the 14-digit number, the 11- or 12-digit GLS number and the 8-character track ID, and nothing else', () => {
    for (const [raw, number] of [['0012 3456 7890 12', '00123456789012'], ['123456789012', '123456789012'],
      ['12345678901', '12345678901'], [' zz00zz00 ', 'ZZ00ZZ00'], ['ZZZZZZZZ', 'ZZZZZZZZ']]) {
      expect(normalizeGlsNlNumber(raw!), raw).toBe(number);
    }
    for (const raw of ['1234567890', '1234567890123', '123456789012345', '00000000', 'ZZ00ZZ0', 'ZZ00ZZ000']) {
      expect(() => normalizeGlsNlNumber(raw), raw).toThrow(InvalidInputError);
    }
  });

  it("reads GLS's empty reply as inconclusive, since a wrong postcode and an expired parcel both get it", async () => {
    for (const response of [new Response(null, { status: 204 }), new Response('', { status: 200 })]) {
      const error = await failure(carrier(vi.fn<typeof fetch>().mockResolvedValue(response)).track({ number: '00000000000000', postcode: POSTCODE }));
      expect(error).toMatchObject({ kind: 'indeterminate', reason: 'portal_not_found' });
    }
  });

  it("keeps the postcode out of a failure's details, and an unreadable reply is no missing parcel", async () => {
    const lookup = (response: Response) => failure(carrier(vi.fn<typeof fetch>().mockResolvedValue(response))
      .track({ number: '00000000000000', postcode: POSTCODE }));
    for (const [status, kind] of [[403, 'challenge'], [429, 'rate_limited'], [500, 'indeterminate']] as const) {
      const error = await lookup(new Response('<html>blocked</html>', { status }));
      expect(error, String(status)).toMatchObject({ kind, status });
      expect(JSON.stringify({ ...error, message: error?.message }), String(status)).not.toMatch(/1012/);
    }
    const page = await lookup(new Response('<html>Request Rejected</html>', { status: 200 }));
    expect(page).toBeInstanceOf(TypeError);
    expect(page).toMatchObject({ message: 'GLS Netherlands returned an invalid tracking response' });
    expect(await lookup(json({ message: 'synthetic' }))).toMatchObject({ kind: 'schema' });
  });

  it('refuses a reply filed under another number', async () => {
    const reply = fixture('delivered');
    const error = await failure(carrier(vi.fn<typeof fetch>().mockResolvedValue(json(reply))).track({ number: '00000000000000', postcode: POSTCODE }));
    expect(error).toMatchObject({ kind: 'indeterminate' });
    expect(error).not.toHaveProperty('reason', 'portal_not_found');
  });
});

describe('GLS Netherlands replies', () => {
  it("reads a parcel from abroad by its 00 form, its GLS number or its track ID, on GLS's clocks in the Netherlands", () => {
    const reply = fixture('delivered-abroad');
    expect(reply.parcelNo.startsWith('00') && reply.gpNo!.length === 12 && reply.parcelNo.at(-1) !== reply.gpNo!.at(-1)).toBe(true);
    const result = parsed('delivered-abroad');
    for (const number of [reply.gpNo!, reply.uniqueNo.toLowerCase()]) expect(parsed('delivered-abroad', number)).toEqual(result);
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', current_stage_source: 'carrier_map',
      last_status_text: 'The parcel has been delivered.', last_update: '2026-10-20T14:13:42+02:00',
      delivered_at: '2026-10-20T14:13:42+02:00', expected_delivery: null, weight_kg: 4.95, destination_country: 'NL', timezone: 'Europe/Amsterdam' });
    expect(result).not.toHaveProperty('pickup_point');
    expect(result.events![0]).toEqual({ time: '2026-10-20T14:13:42+02:00', local_time: '2026-10-20T14:13:42', time_zone: 'Europe/Amsterdam',
      time_zone_basis: 'carrier', description: 'The parcel has been delivered.', location: 'Amsterdam, NL', provider_code: '3/0',
      stage: 'delivered', stage_source: 'carrier_map' });
    expect(result.events!.map((event) => [event.local_time, event.location, event.stage ?? null])).toEqual([
      ['2026-10-20T14:13:42', 'Amsterdam, NL', 'delivered'],
      ['2026-10-20T05:56:50', 'Amsterdam, NL', 'out_for_delivery'],
      ['2026-10-20T00:20:11', 'Amsterdam, NL', 'in_transit'],
      ['2026-10-19T15:40:55', 'Hub Utrecht, NL', 'in_transit'],
      ['2026-10-19T15:38:22', 'Hub Utrecht, NL', 'in_transit'],
      ['2026-10-16T10:53:56', 'Regional HUB Gluchowo, PL', 'in_transit'],
      // The check scan and the handover share a clock; GLS lists the handover first.
      ['2026-10-15T16:08:30', 'Warszawa, PL', 'in_transit'],
      ['2026-10-15T16:08:30', 'Warszawa, PL', 'accepted'],
      ['2026-10-15T06:16:43', 'Warszawa, PL', 'registered'],
    ]);
  });

  it("gives today's window while the parcel is out, and drops it once delivered", () => {
    const out = fixture('out-for-delivery');
    const delivered = fixture('delivered');
    expect(out.parcelNo).toBe(delivered.parcelNo);
    expect(parsed('out-for-delivery')).toMatchObject({ status: 'out_for_delivery', current_stage: 'out_for_delivery',
      last_status_text: 'The parcel is expected to be delivered during the day.',
      expected_delivery_from: '2026-10-28T13:08:00+01:00', expected_delivery: '2026-10-28T15:41:00+01:00' });
    const result = parsed('delivered');
    expect(result).toMatchObject({ status: 'delivered', delivered_at: '2026-10-28T15:55:51+01:00', expected_delivery: null });
    expect(result).not.toHaveProperty('expected_delivery_from');
    expect(result.events!.map((event) => event.location)).toEqual(['Rotterdam, NL', 'Rotterdam, NL', 'Rotterdam, NL',
      'RUP Essen, DE', 'RUP Essen, DE', 'Nürnberg, DE']);
  });

  it('reads a window without offsets as the day and its hours, and leaves a planned delivery without a stage', () => {
    const result = parsed('planned');
    expect(result).toMatchObject({ status: 'out_for_delivery', expected_delivery: '2025-07-10 08:00–21:30' });
    expect(rows(result.events!)).toEqual([
      ['2025-07-10T07:40:54', '11/0', 'out_for_delivery'],
      ['2025-07-09T15:19:49', '2/0', 'in_transit'],
      ['2025-07-09T09:07:09', '12/80', null],
      ['2025-07-08T17:32:46', '2/0', 'in_transit'],
      ['2025-07-08T17:22:46', '0/0', 'accepted'],
      ['2025-07-08T15:54:37', '81/0', 'accepted'],
      ['2025-07-08T15:18:29', '0/100', 'registered'],
    ]);
  });

  it('keeps a parcel only announced to GLS as registered', () => {
    expect(parsed('registered')).toMatchObject({ status: 'pending', current_stage: 'registered', expected_delivery: null,
      events: [expect.objectContaining({ provider_code: '0/100', location: 'NL' })] });
  });

  it("reads the sender's ParcelShop drop-off as GLS's acceptance, and a payment as no scan", () => {
    const result = parsed('shop-drop-off');
    expect(result).toMatchObject({ status: 'in_transit', current_stage: 'accepted', last_status_text: 'The parcel was handed over to GLS.' });
    expect(rows(result.events!).reverse()).toEqual([
      ['2025-12-03T10:46:53', '0/100', 'registered'],
      ['2025-12-03T10:46:55', '73/300', null],
      ['2025-12-03T12:26:38', '2/124', 'accepted'],
      ['2025-12-03T19:45:01', '0/1480', 'registered'],
      ['2025-12-04T11:22:10', '81/0', 'accepted'],
      ['2025-12-04T11:23:06', '1/124', 'accepted'],
      ['2025-12-04T11:23:14', '17/0', 'accepted'],
      ['2025-12-04T17:00:38', '0/29', 'in_transit'],
      ['2025-12-04T17:01:00', '46/183', 'in_transit'],
      ['2025-12-04T17:01:00', '0/0', 'accepted'],
    ]);
  });

  it('reads a failed attempt and the return to the depot after it', () => {
    const result = parsed('not-home');
    expect(result).toMatchObject({ current_stage: 'failed_attempt', status: 'exception', expected_delivery: null });
    expect(rows(result.events!.slice(0, 3))).toEqual([
      ['2026-08-13T16:27:13', '35/40', 'failed_attempt'],
      ['2026-08-13T15:28:45', '4/40', 'failed_attempt'],
      ['2026-08-13T08:42:22', '11/0', 'out_for_delivery'],
    ]);
  });

  it('reads a parcel left at a ParcelShop as ready for pickup there, with the shop, after attempts and instructions', () => {
    const result = parsed('parcelshop');
    expect(result).toMatchObject({ status: 'out_for_delivery', current_stage: 'ready_for_pickup', expected_delivery: null,
      pickup_point: expect.stringMatching(/^[^\n]+\n[^\n]+ \d+\n\d{4}[A-Z]{2} [^\n]+$/) });
    expect(result).not.toHaveProperty('delivered_at');
    expect(rows(result.events!).reverse()).toEqual([
      ['2025-09-09T10:54:31', '0/100', 'registered'],
      ['2025-09-09T16:24:45', '2/1241', 'accepted'],
      ['2025-09-10T16:19:50', '81/0', 'accepted'],
      ['2025-09-10T20:56:06', '0/0', 'accepted'],
      ['2025-09-11T06:02:30', '2/0', 'in_transit'],
      ['2025-09-11T08:56:20', '11/0', 'out_for_delivery'],
      ['2025-09-11T12:57:48', '4/1', 'failed_attempt'],
      ['2025-09-11T14:07:40', '35/1', 'failed_attempt'],
      ['2025-09-16T15:08:12', '33/930', null],
      ['2025-09-17T07:03:51', '2/0', 'in_transit'],
      ['2025-09-17T10:54:47', '12/80', null],
      ['2025-09-17T10:58:51', '12/37', null],
      ['2025-09-18T08:56:24', '11/0', 'out_for_delivery'],
      ['2025-09-18T12:16:26', '3/124', 'ready_for_pickup'],
      ['2025-09-18T12:18:31', '2/124', 'ready_for_pickup'],
    ]);
  });

  it('reads a locker delivery by its track ID, delivered once the recipient takes the parcel out', () => {
    const reply = fixture('parcel-locker');
    expect(reply.uniqueNo).toMatch(/^[A-Z0-9]{8}$/);
    const result = parsed('parcel-locker', reply.uniqueNo.toLowerCase());
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', delivered_at: '2026-09-04T13:22:53+02:00',
      pickup_point: expect.stringMatching(/^Pakketautomaat\n/) });
    expect(rows(result.events!.slice(0, 4))).toEqual([
      ['2026-09-04T13:22:53', '3/8960', 'delivered'],
      ['2026-09-04T11:52:37', '85/1062', null],
      ['2026-09-04T11:52:29', '3/872', 'ready_for_pickup'],
      ['2026-09-04T11:52:15', '3/896', 'ready_for_pickup'],
    ]);
    expect(result.events!.filter((event) => event.provider_code?.startsWith('77/')).map((event) => event.stage ?? null)).toEqual([null, null]);
  });
});

describe('GLS Netherlands numbers, postcode and vocabulary', () => {
  it('offers GLS Netherlands for its numbers and opens its tracking links, and takes an optional postcode', () => {
    for (const name of ['delivered', 'delivered-abroad', 'parcel-locker']) {
      const reply = fixture(name);
      for (const number of [reply.parcelNo, reply.gpNo, reply.uniqueNo].filter(Boolean)) {
        expect(detectCarrierMatch(number!).candidates, `${name}: ${number!.length}`).toContain('gls-nl');
      }
    }
    expect(parseTrackingInput('https://www.gls-info.nl/tracking/ttlink?parcelNo=00000000000000&zipCode=1012AB&lang=NL'))
      .toMatchObject({ trackingNumber: '00000000000000', carrier: 'gls-nl' });
    expect(parseTrackingInput('https://www.gls-info.nl/Tracking?parcelNo=00000000000000&zipcode=1012AB'))
      .toMatchObject({ trackingNumber: '00000000000000', carrier: 'gls-nl' });
    expect(carrierDefinition('gls-nl').tracking).not.toHaveProperty('recognition');
    const [requirement] = carrierRequirements('gls-nl', '00000000000000');
    expect(requirement).toMatchObject({ field: 'postcode', validator: 'internationalPostcode', optional: true, autoComplete: 'postal-code' });
    for (const value of ['', '1012 AB', '1012ab', '10115', '2000']) expect(requirementSatisfied(requirement!, value), value).toBe(true);
  });

  it('records every code seen with the stage the map gives it, and leaves notices and the ParcelShop arrival without one', () => {
    for (const entry of statuses.entries as { code: string; wording: string; stage?: string; unmapped?: boolean }[]) {
      const answer = statusMapAnswer({ carrier: 'gls-nl', providerCode: entry.code, description: entry.wording });
      expect(answer, entry.code).toEqual(entry.unmapped ? { kind: 'intentional_gap', note: expect.any(String) } : { kind: 'mapped', stage: entry.stage });
    }
    // A reason the map does not list takes its event's stage; an event it does not know stays open.
    expect(statusMap.stage('3/1', 'synthetic')).toBe('delivered');
    expect(statusMap.stage('99/0', 'synthetic')).toBeUndefined();
    expect(statusMap.stage(null, 'The parcel has been delivered.')).toBeUndefined();
  });
});
