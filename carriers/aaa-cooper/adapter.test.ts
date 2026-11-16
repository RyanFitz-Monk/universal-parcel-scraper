import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { statusMapAnswer } from '../../core/catalog/statusMaps.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { AAA_COOPER_ENDPOINT, AaaCooperTracker, adapter } from './adapter.js';
import { aaaCooperNumber, parseAaaCooper } from './parser.js';
import { aaaCooperMappedStage, statusMap } from './status.js';
import statuses from './statuses.json' with { type: 'json' };

// The public sample delivered.html answers for, and that PRO with its Luhn check digit.
const DELIVERED = '35225398';
const CHECKED = '352253983';
const MOVING = '20482097';
const ABSENT = '10293847';
const page = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
const reply = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
const environment = (fetcher: typeof fetch) => ({ fetcher, recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });
const carrier = (fetcher: typeof fetch) => adapter(environment(fetcher));
const rows = (result: ReturnType<typeof parseAaaCooper>) =>
  result.events!.map(event => [event.local_time, event.location, event.description, event.stage]);
// Who signed, the references, the service centers' phones and the payment terms the page shows.
const PRIVATE = /Warehouse|TOL81164280|BOL00000000|\(260\) 245-1036|\(504\) 831-2500|Prepaid/;
const status = (html: string, wording: string) => html.replace(/(lblDeliveryStatus" class="contentCSS">)[^<]*/, `$1${wording}`);

describe('AAA Cooper tracking adapter', () => {
  it('opens the results page once for the whole PRO number through the supplied transport and records the step', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(page('delivered')));
    const recorder = { ...NOOP_RECORDER, step: vi.fn(), lookup: vi.fn() };
    await expect(new AaaCooperTracker({ fetcher, recorder, userAgent: 'SyntheticHost/1.0' })
      .fetch(` ${DELIVERED.slice(0, 4)}-${DELIVERED.slice(4)} `, { budgetMs: 1000.5 })).resolves.toMatchObject({ status: 'delivered' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe(`https://www.aaacooper.com/pwb/Transit/ProTrackResults.aspx?ProNum=${DELIVERED}`);
    expect(init).toMatchObject({ method: 'GET', redirect: 'manual', signal: expect.any(AbortSignal), headers: { 'User-Agent': 'SyntheticHost/1.0' } });
    expect(new Headers(init!.headers).has('cookie')).toBe(false);
    expect(recorder.step).toHaveBeenCalledWith(expect.objectContaining({ carrier: 'aaa-cooper', step: 'direct', outcome: 'ok' }));
    expect(recorder.lookup).toHaveBeenCalledTimes(1);
  });

  it('asks for the eight digits of a PRO number typed with its check digit, and refuses a wrong check digit without a request', async () => {
    expect(aaaCooperNumber(CHECKED)).toEqual({ number: CHECKED, pro: DELIVERED });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(page('delivered')));
    await expect(carrier(fetcher).track({ number: CHECKED })).resolves.toMatchObject({ status: 'delivered' });
    expect(String(fetcher.mock.calls[0]![0])).toBe(`${AAA_COOPER_ENDPOINT}?ProNum=${DELIVERED}`);
    // The page drops a ninth digit without checking it, so a wrong one would show this shipment.
    await expect(carrier(fetcher).track({ number: `${DELIVERED}0` })).rejects.toMatchObject({ kind: 'invalid_input' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('reads the tracing rows newest first, as wall clocks with the place each names, without who signed or the references', () => {
    const result = parseAaaCooper(page('delivered'), DELIVERED);
    expect(result).toEqual({ status: 'delivered', current_stage: 'delivered', current_stage_source: 'carrier_map',
      last_status_text: 'Delivered', last_update: null, last_update_local: '2026-04-15T16:18:00', expected_delivery: null,
      events: expect.any(Array) });
    expect(rows(result)).toEqual([
      ['2026-04-15T16:18:00', 'HOUMA, LA', 'Delivered To Consignee In HOUMA, LA', 'delivered'],
      ['2026-04-15T06:01:00', 'NEW ORLEANS, LA', 'Shipment arrived at destination Service Center NEW ORLEANS, LA', 'in_transit'],
      ['2026-04-15T02:04:00', 'MERIDIAN', 'Shipment departed MERIDIAN Service Center', 'in_transit'],
      ['2026-04-15T01:49:00', 'MERIDIAN', 'Shipment arrived at MERIDIAN Service Center', 'in_transit'],
      ['2026-04-14T22:54:00', 'BIRMINGHAM', 'Shipment departed BIRMINGHAM Service Center', 'in_transit'],
      ['2026-04-13T15:28:00', 'BIRMINGHAM', 'Shipment arrived at BIRMINGHAM Service Center', 'in_transit'],
      ['2026-04-13T10:09:00', 'LOUISVILLE', 'Shipment departed LOUISVILLE Service Center', 'in_transit'],
      ['2026-04-11T01:43:00', 'LOUISVILLE', 'Shipment arrived at LOUISVILLE Service Center', 'in_transit'],
      ['2026-04-10T20:53:00', 'FORT WAYNE', 'Shipment departed FORT WAYNE Service Center', 'in_transit'],
      ['2026-04-10T16:10:00', 'CELINA, OH', 'Shipment Picked Up From Shipper In CELINA, OH', 'accepted'],
    ]);
    expect(result.events!.every(event => event.time === undefined && event.stage_source === 'carrier_map')).toBe(true);
    for (const [name, number] of [['delivered', DELIVERED], ['out-for-delivery', MOVING]] as const) {
      expect(JSON.stringify(parseAaaCooper(page(name), number)), name).not.toMatch(PRIVATE);
    }
    // A list the other way round is turned, and a row whose wording names no place keeps none.
    const body = page('delivered');
    const grid = /(<tr class="updatedContentCSS" align="center">[\s\S]*?<\/tr>)([\s\S]*?)(\s*<\/table>\s*<\/div>)/.exec(body)!;
    const listed = grid[2]!.split('</tr>').slice(0, -1).map(row => `${row}</tr>`);
    expect(parseAaaCooper(body.replace(grid[2]!, [...listed].reverse().join('')), DELIVERED).events).toEqual(result.events);
    const unplaced = parseAaaCooper(body.replace('Shipment departed MERIDIAN Service Center', 'Trailer closed'), DELIVERED);
    expect(unplaced.events![2]).toEqual({ local_time: '2026-04-15T02:04:00', description: 'Trailer closed' });
  });

  it('follows a shipment out for delivery and names the delivery day the page shows before the delivery', () => {
    const result = parseAaaCooper(page('out-for-delivery'), MOVING);
    expect(result).toMatchObject({ status: 'out_for_delivery', current_stage: 'out_for_delivery', current_stage_source: 'carrier_map',
      last_status_text: 'Shipment Out For Delivery To Consignee In HOUMA, LA', last_update_local: '2026-04-15T08:12:00',
      expected_delivery: null, unread_estimates: ['lblDeliveryDate'] });
    expect(rows(result)[0]).toEqual(['2026-04-15T08:12:00', 'HOUMA, LA', 'Shipment Out For Delivery To Consignee In HOUMA, LA', 'out_for_delivery']);
    expect(result).not.toHaveProperty('signed_by');
    // A delivery the status field reports before its row comes in counts; a status it does not settle waits for the rows.
    expect(parseAaaCooper(status(page('out-for-delivery'), 'Delivered'), MOVING))
      .toMatchObject({ status: 'delivered', current_stage: 'delivered', last_status_text: 'Delivered' });
    expect(parseAaaCooper(status(page('out-for-delivery'), 'In Transit'), MOVING))
      .toMatchObject({ current_stage: 'out_for_delivery', last_status_text: 'Shipment Out For Delivery To Consignee In HOUMA, LA' });
  });

  it('keeps a listed PRO number without rows, and no history when the page shows neither rows nor a status', () => {
    const bare = page('out-for-delivery').replace(/<tr class="updatedContentCSS">\s*<td>\s*<span id="[^"]*grdViewTraceInfo[\s\S]*?<\/table>/, '</table>');
    expect(parseAaaCooper(bare, MOVING)).toMatchObject({ status: 'out_for_delivery', current_stage: 'out_for_delivery',
      last_status_text: 'Out for Delivery', events: [] });
    const gridless = page('out-for-delivery').replace(/<table class="NormalTx2"[\s\S]*?<\/table>/, '');
    expect(parseAaaCooper(gridless, MOVING)).toMatchObject({ current_stage: 'out_for_delivery', events: [] });
    expect(() => parseAaaCooper(status(gridless, ''), MOVING))
      .toThrow(expect.objectContaining({ kind: 'indeterminate', name: 'NoHistoryError', reason: 'listed' }));
  });

  it('binds the page to the requested PRO number and rejects pages it cannot read', () => {
    expect(() => parseAaaCooper(page('delivered'), MOVING)).toThrow(expect.objectContaining({ kind: 'schema' }));
    for (const html of ['<html><body>Maintenance</body></html>',
      page('delivered').replace(`>${DELIVERED}</span>`, '></span>'),
      page('delivered').replace('_lblProNumber"', '_lblProNo"'),
      page('delivered').replace('_lblDeliveryStatus"', '_lblStatus"'),
      page('delivered').replace('>2026-04-15<br />', '>04/15/2026<br />'),
      page('delivered').replace('>2026-04-15<br />', '>2026-02-30<br />'),
      page('delivered').replace('>16:18<br />', '>25:18<br />'),
      page('delivered').replace('>16:18<br />', '><br />'),
      page('delivered').replace('>Delivered To Consignee In HOUMA, LA<br />', '><br />'),
      page('delivered').replace(/<span id="[^"]*ctl02_lblTime">[^<]*<br \/><\/span>/, ''),
      page('delivered').replace('</form>', `${page('not-found').match(/<div id="AAACooperMasterPage_bodyContent_ErrorPanel">[\s\S]*?<\/div>\s*<\/form>/)![0]}`)]) {
      expect(() => parseAaaCooper(html, DELIVERED), html.slice(0, 80)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    const row = /<tr class="updatedContentCSS">\s*<td>\s*<span id="[^"]*ctl02_lblDate[\s\S]*?<\/tr>/.exec(page('delivered'))![0];
    const many = page('delivered').replace(row, row.repeat(501));
    expect(() => parseAaaCooper(many, DELIVERED)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('reads the not-found notice as a missing shipment, the pending notice as a listed one, and a CAPTCHA or block page as a challenge', () => {
    expect(() => parseAaaCooper(page('not-found'), ABSENT)).toThrow(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseAaaCooper(page('pending'), ABSENT))
      .toThrow(expect.objectContaining({ kind: 'indeterminate', name: 'NoHistoryError', reason: 'listed' }));
    expect(() => parseAaaCooper(page('not-found').replace('PRO NOT FOUND IN SYSTEM', 'An error occurred.'), ABSENT))
      .toThrow(expect.objectContaining({ kind: 'schema' }));
    // The CAPTCHA the page asks for after many lookups from one address: its row shown, or its notice.
    for (const html of [page('captcha'), page('not-found').replace('trTimedButton" style="display: none"', 'trTimedButton"'),
      page('captcha').replace('trTimedButton" style="display:block;"', 'trTimedButton" style="display: none"')]) {
      expect(() => parseAaaCooper(html, DELIVERED)).toThrow(expect.objectContaining({ kind: 'challenge' }));
    }
    for (const html of ['<html><head><title>Access Denied</title></head><body>Blocked</body></html>',
      '<html><head><title>403 - Forbidden: Access is denied.</title></head><body></body></html>',
      '<html><body>The requested URL was rejected. Please consult with your administrator.</body></html>']) {
      expect(() => parseAaaCooper(html, ABSENT)).toThrow(expect.objectContaining({ kind: 'challenge' }));
    }
  });

  it('takes eight-digit PRO numbers, or nine with their check digit, and nothing else, without a request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const number of ['3522539', '352253984', '3522539830', '3522539X', 'ABCDEFGH', '1Z9999999999999999', '3'.repeat(65)]) {
      await expect(carrier(fetcher).track({ number }), number).rejects.toMatchObject({ kind: 'invalid_input' });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([[302, 'transport'], [403, 'challenge'], [429, 'rate_limited'], [404, 'transport'], [410, 'transport'],
    [500, 'indeterminate'], [503, 'maintenance']] as const)(
    'keeps HTTP %s as %s, without a retry', async (code, kind) => {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => code === 302
        ? new Response(null, { status: code, headers: { Location: '/pwb/Default.aspx' } })
        : reply(code === 500 ? '' : page('not-found'), code));
      await expect(carrier(fetcher).track({ number: ABSENT })).rejects.toMatchObject({ kind });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

  it('keeps empty pages and oversized replies apart from missing shipments', async () => {
    for (const [body, kind] of [['', 'indeterminate'], ['  ', 'indeterminate'], ['{"status":"Delivered"}', 'schema']] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply(body));
      await expect(carrier(fetcher).track({ number: ABSENT }), body.slice(0, 40)).rejects.toMatchObject({ kind });
    }
    const large = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array(1_100_000)));
    await expect(carrier(large).track({ number: DELIVERED })).rejects.toThrow('unexpectedly large');
  });

  it('tries once more after a failed connection, inside the caller’s budget', async () => {
    const flaky = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValueOnce(reply(page('delivered')));
    await expect(carrier(flaky).track({ number: DELIVERED })).resolves.toMatchObject({ status: 'delivered' });
    expect(flaky).toHaveBeenCalledTimes(2);
    const immediate = vi.fn<typeof fetch>().mockResolvedValue(reply(page('delivered')));
    await expect(carrier(immediate).track({ number: DELIVERED }, { signal: AbortSignal.abort(new Error('cancelled')) }))
      .rejects.toThrow('cancelled');
    await expect(carrier(immediate).track({ number: DELIVERED }, { budgetMs: 0 })).rejects.toMatchObject({ kind: 'budget' });
    expect(immediate).not.toHaveBeenCalled();
    const slow = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
    }));
    await expect(carrier(slow).track({ number: DELIVERED }, { budgetMs: 20.5 }))
      .rejects.toMatchObject({ kind: expect.stringMatching(/^(?:transport|budget)$/) });
    expect(slow.mock.calls.length).toBeLessThanOrEqual(2);
    expect(slow.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(true);
  });

  it('routes a PRO number filed under AAA Cooper to the adapter', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply(page('delivered')));
    const answer = await createTracker({ fetcher, providers: [], env: {} })
      .track({ number: DELIVERED, carrier: 'aaa-cooper' }, { budgetMs: 3000 });
    expect(answer).toMatchObject({ carrier: 'aaa-cooper', source: 'aaa-cooper', result: { current_stage: 'delivered' } });
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith(`${AAA_COOPER_ENDPOINT}?`))).toBe(true);
  });
});

describe('AAA Cooper status vocabulary', () => {
  it('records every wording the map knows with the stage it gives', () => {
    for (const entry of statuses.entries) {
      expect(aaaCooperMappedStage(entry.wording), entry.wording).toBe(entry.stage);
      expect(statusMap.stage(null, entry.wording.toLowerCase())).toBe(entry.stage);
    }
    expect(aaaCooperMappedStage('Shipment arrived at destination Service Center   NEW ORLEANS, LA')).toBe('in_transit');
    expect(aaaCooperMappedStage('Delivered To Consignee in EDINA, MN')).toBe('delivered');
    for (const wording of ['constructor', 'Shipment departed', 'Delivered To Consignee In', 'Shipment Picked Up']) {
      expect(aaaCooperMappedStage(wording), wording).toBeUndefined();
    }
    expect(statusMap.stage('7', 'delivered')).toBeUndefined();
    expect(statusMapAnswer({ carrier: 'aaa-cooper', description: 'Shipment departed NASHVILLE Service Center' }))
      .toEqual({ kind: 'mapped', stage: 'in_transit' });
  });
});
