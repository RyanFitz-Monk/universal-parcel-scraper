import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { statusMapAnswer } from '../../core/catalog/statusMaps.js';
import { normalizeStatusWording, statusGapNote } from '../../core/status/statusMap.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { adapter, CUSTOM_COMPANIES_DETAILS, customCompaniesLookupUrl, CustomCompaniesTracker } from './adapter.js';
import { normalizeCustomCompaniesNumber, parseCustomCompanies } from './parser.js';
import { customCompaniesStage, statusMap } from './status.js';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
/** The shipment number a fixture's details page names. */
const shown = (html: string) => /Shipment Number:<\/th><td align="left">(\d+)</.exec(html)![1]!;
const DELIVERED = fixture('delivered');
const LATE = fixture('delivered-late-scans');
const NUMBER = shown(DELIVERED);
const reply = (body: BodyInit | null, init: ResponseInit = {}) => new Response(body,
  { ...init, headers: { 'Content-Type': 'text/html', ...init.headers } });
const answering = (respond: () => Response) => vi.fn<typeof fetch>().mockImplementation(async () => respond());
const rows = (result: ReturnType<typeof parseCustomCompanies>) => result.events!.map((event) =>
  [event.local_time, event.provider_code ?? null, event.description, event.location ?? null, event.stage ?? null]);
/** The page without its delivery: no details block and no delivered row. */
const undelivered = (html: string) => html
  .replace(/<table id="bolstatustable">[\s\S]*?<!--\s*bolstatustable\s*-->/, '')
  .replace(/<tr class="oddrow"><td bgcolor="yellow">DELIVERED;[^\n]*\n/, '');
const BLOCKED = '<html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={};</script></body></html>';

describe('The Custom Companies details page', () => {
  it('asks for the whole shipment number as a pro number through the supplied transport', async () => {
    const fetcher = answering(() => reply(DELIVERED));
    await expect(new CustomCompaniesTracker({ fetcher }).fetch(` ${NUMBER} `)).resolves.toMatchObject({ status: 'delivered' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe(customCompaniesLookupUrl(NUMBER));
    expect(new URL(String(url)).origin + new URL(String(url)).pathname).toBe(CUSTOM_COMPANIES_DETAILS);
    expect(Object.fromEntries(new URL(String(url)).searchParams)).toEqual({ wbtn: 'PRO', wpro1: NUMBER, seskey: '', nav: 'top', language: '' });
    expect(init).toMatchObject({ method: 'GET', signal: expect.any(AbortSignal), redirect: 'manual', headers: { Accept: 'text/html' } });
  });

  it('starts no request for a number that is not a shipment number', async () => {
    const fetcher = answering(() => reply(DELIVERED));
    for (const input of ['ABC12345', '123456', '12345678901', `${NUMBER}/1`]) {
      await expect(new CustomCompaniesTracker({ fetcher }).fetch(input), input).rejects.toMatchObject({ kind: 'invalid_input' });
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(normalizeCustomCompaniesNumber(NUMBER)).toBe(NUMBER);
  });

  it('reads the history on the terminals’ wall clocks, with towns, codes and stages, and leaves the signer out', () => {
    const result = parseCustomCompanies(DELIVERED, NUMBER);
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', current_stage_source: 'carrier_map',
      last_status_text: 'DELIVERED-NO EXCEPTIONS', last_update: null, last_update_local: '2024-06-05T17:22:00' });
    expect(rows(result).slice(0, 4)).toEqual([
      ['2024-06-05T17:22:00', null, 'DELIVERED; THANK YOU FOR USING THE CUSTOM COMPANIES', 'BURLINGTON, VT', 'delivered'],
      ['2024-06-05T09:06:00', 'DISPTCHD', 'Trailer Departed', 'Willston, VT', 'in_transit'],
      ['2024-06-05T09:06:00', 'OFD', 'Out For Delivery', null, 'out_for_delivery'],
      ['2024-05-30T16:25:00', 'WEB', 'On Hand - Waiting For Approval On Additional Services', null, 'exception'],
    ]);
    const events = rows(result);
    // Midnight is written "00:29 AM".
    expect(events).toContainEqual(['2024-05-30T00:29:00', 'ARRIVE', 'Trailer Arrived', 'Castleton on Hudson, NY', 'in_transit']);
    expect(events).toContainEqual(['2024-05-24T18:44:00', 'DISPTCHD', 'Trailer Departed For Northborough, Ma', 'Santa Fe Springs, CA', 'in_transit']);
    expect(events).toContainEqual(['2024-05-20T20:31:00', 'RECLASS', 'Reclass', null, null]);
    expect(events.at(-1)).toEqual(['2024-05-17T15:48:00', 'PU LOG', 'Pickup Request Received', null, 'registered']);
    expect(events).toHaveLength(19);
    const json = JSON.stringify(result);
    for (const hidden of ['SEE SCANNED POD', 'note', '05401', 'PURCHASE ORDER', 'Walnut, CA 91789']) expect(json).not.toContain(hidden);
  });

  it('keeps a shipment delivered when its terminal scans freight after the delivery', () => {
    const number = shown(LATE);
    const result = parseCustomCompanies(LATE, number);
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', last_update_local: '2024-07-18T12:00:00' });
    expect(rows(result).slice(0, 3).map(([time, code]) => [time, code])).toEqual([
      ['2024-07-28T23:50:00', 'STRIP'], ['2024-07-28T09:00:00', 'ARRIVED'], ['2024-07-18T12:00:00', null]]);
  });

  it('follows the newest staged row before the delivery, past rows that move nothing', () => {
    const page = undelivered(DELIVERED);
    expect(parseCustomCompanies(page, NUMBER)).toMatchObject({ status: 'in_transit', current_stage: 'in_transit',
      last_status_text: 'Trailer Departed', last_update_local: '2024-06-05T09:06:00' });
    const held = page.replace(/<tr id="[^"]*" class="evenrow"><td>Trailer Departed<\/td><td>Willston[^\n]*\n<tr id="[^"]*" class="oddrow"><td>Out For Delivery[^\n]*\n/, '');
    expect(parseCustomCompanies(held, NUMBER)).toMatchObject({ status: 'exception', current_stage: 'exception',
      last_status_text: 'On Hand - Waiting For Approval On Additional Services' });
  });

  it('answers an unknown number with not found, and keeps block pages, other shipments and changed pages apart', async () => {
    await expect(new CustomCompaniesTracker({ fetcher: answering(() => reply(fixture('not-found'))) }).fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'not_found' });
    await expect(new CustomCompaniesTracker({ fetcher: answering(() => reply(BLOCKED)) }).fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'challenge' });
    const other = DELIVERED.replace(`<td align="left">${NUMBER}</td>`, '<td align="left">10000000</td>');
    expect(() => parseCustomCompanies(other, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseCustomCompanies('<html><title>Elsewhere</title><body>Hello</body></html>', NUMBER))
      .toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseCustomCompanies(DELIVERED.replace('05:22 PM</td></tr>', '13:22 PM</td></tr>'), NUMBER))
      .toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseCustomCompanies(DELIVERED.replace('<td>Willston, VT</td><td>06/05/2024 </td>', '<td>06/05/2024 </td>'), NUMBER))
      .toThrow(expect.objectContaining({ kind: 'schema' }));
    await expect(new CustomCompaniesTracker({ fetcher: answering(() => reply('  ')) }).fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'indeterminate' });
    await expect(new CustomCompaniesTracker({ fetcher: answering(() => reply('gone', { status: 404 })) }).fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'transport' });
    await expect(new CustomCompaniesTracker({ fetcher: answering(() => reply(null, { status: 302, headers: { Location: '/' } })) }).fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'transport' });
    await expect(new CustomCompaniesTracker({ fetcher: answering(() => reply(null, { status: 429 })) }).fetch(NUMBER))
      .rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('sends a lookup that failed to reach the host once more', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('fetch failed')).mockResolvedValue(reply(DELIVERED));
    const provider = adapter({ fetcher, recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });
    await expect(provider.track({ number: NUMBER })).resolves.toMatchObject({ status: 'delivered' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stages wordings whole and leaves corrections and appointments without a stage', () => {
    expect(customCompaniesStage('Trailer Departed For Londonderry, Nh')).toBe('in_transit');
    expect(customCompaniesStage('Trailer Departed For')).toBeUndefined();
    expect(customCompaniesStage('Trailer Arrived At Delivering Terminal')).toBe('in_transit');
    expect(customCompaniesStage('DELIVERED-NO EXCEPTIONS')).toBe('delivered');
    expect(statusMapAnswer({ carrier: 'custom-companies', providerCode: 'OFD', description: 'Out For Delivery' }))
      .toEqual({ kind: 'mapped', stage: 'out_for_delivery' });
    for (const [code, wording] of [['RECLASS', 'Reclass'], ['APPT', 'Appointment Set: Del Appt On 04/26 @ 1900'], [null, 'Appointment Set: Setup Edi Code']] as const) {
      expect(statusMap.stage(code, normalizeStatusWording(wording))).toBeUndefined();
      expect(statusGapNote(statusMap, code, normalizeStatusWording(wording)), wording).toBeDefined();
    }
  });
});
