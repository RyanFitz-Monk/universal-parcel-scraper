import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parseTrackingInput } from '../../core/detection/index.js';
import { normalizeCarrierResult } from '../../core/result/index.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import type { StepRecord } from '../../core/telemetry/index.js';
import { adapter, DtdcTracker } from './adapter.js';
import { parseDtdcPage } from './page.js';
import { normalizeDtdcNumber, parseDtdc } from './parser.js';

const NUMBER = 'N00000001';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/delivered.json', import.meta.url), 'utf8'));

describe('DTDC parser', () => {
  it('binds the booking reference and returns dated completed history', () => {
    const result = normalizeCarrierResult(parseDtdc(fixture(), NUMBER));
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', timezone: 'Asia/Kolkata' });
    expect(result.events).toHaveLength(5);
    expect(result.events?.[0]).toMatchObject({ description: 'Delivered', stage: 'delivered', location: 'Example destination depot' });
    expect(result.events?.[3]).toMatchObject({ description: 'Picked Up', stage: 'accepted' });
    expect(result.events?.at(-1)).toMatchObject({ description: 'Booked', stage: 'registered' });
    expect(result.last_update).toBe(new Date(1767445200000).toISOString().replace('.000', ''));
    expect(result.delivered_at).toBe(result.last_update);
    expect(result.weight_kg).toBeUndefined();
    expect(result.sender_name).toBeUndefined();
    expect(result.receiver_name).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(/Synthetic address|Example recipient|private-example|private_instruction/);
  });

  it('accepts the verified original waybill alias and rejects mixed history', () => {
    const payload = fixture();
    payload.data.tracking[0].awb_number = payload.data.consignment.AWBNo;
    expect(parseDtdc(payload, payload.data.consignment.AWBNo).events).toHaveLength(5);
    payload.data.tracking[0].awb_number = 'N99999999';
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('uses only returned consignment identity and rejects an input echo', () => {
    const payload = fixture();
    payload.requested = NUMBER;
    payload.data.consignment.referenceNumber = 'N99999999';
    payload.data.consignment.clientNumber = NUMBER;
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    delete payload.data.consignment;
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('adds a dated return snapshot without moving forward scans onto the return leg', () => {
    const payload = fixture();
    Object.assign(payload.data, { type: 'rto', status_external: 'RTO Booked', current_event_description: 'RTO Booked',
      status_internal: 'rto_in_transit', timestamp: 1767531600000, rto_awb_num: NUMBER });
    const result = parseDtdc(payload, NUMBER);
    expect(result).toMatchObject({ status: 'exception', current_stage: 'exception' });
    expect(result.events).toHaveLength(6);
    expect(result.events?.[0]).toMatchObject({ description: 'RTO Booked', stage: 'exception', provider_leg: 'return' });
    expect(result.events?.[1]).toMatchObject({ description: 'Delivered', stage: 'delivered' });
    expect(result.delivered_at).toBeUndefined();
  });

  it('does not classify delivery to the sender as recipient delivery', () => {
    const payload = fixture();
    payload.data.type = 'rto'; payload.data.tracking[0].type = 'rto';
    const result = parseDtdc(payload, NUMBER);
    expect(result).toMatchObject({ status: 'exception', current_stage: 'returned' });
    expect(result.events?.[0]!.stage).toBe('returned');
    expect(result.delivered_at).toBeUndefined();
  });

  it.each([
    ['Booked', 'pending', 'registered'],
    ['Picked Up', 'in_transit', 'accepted'],
    ['In Transit', 'in_transit', 'in_transit'],
    ['Out For Delivery', 'out_for_delivery', 'out_for_delivery'],
    ['RTO Booked', 'exception', 'exception'],
  ])('keeps return %s active until delivery back to the sender', (wording, status, stage) => {
    const payload = fixture();
    Object.assign(payload.data, { type: 'rto', status_external: wording, current_event_description: wording,
      status_internal: 'synthetic_return_movement', timestamp: 1767531600000, rto_awb_num: 'R00000001' });
    payload.data.tracking.push({ ...payload.data.tracking[2], type: 'rto', awb_number: 'R00000001',
      status_external: wording, event_description: wording, status_internal: 'synthetic_return_movement', timestamp: 1767531600000 });
    const result = normalizeCarrierResult(parseDtdc(payload, NUMBER));
    expect(result).toMatchObject({ status, current_stage: stage });
    expect(result.events?.[0]).toMatchObject({ description: wording, stage, provider_leg: 'return' });
    expect(result.events?.filter(event => event.provider_leg === 'return').every(event => event.stage !== 'returned')).toBe(true);
    expect(result.events?.some(event => event.provider_leg !== 'return' && event.stage === 'delivered')).toBe(true);
    expect(result.delivered_at).toBeUndefined();
  });

  it('orders shuffled forward and return scans by their own instants and declared legs', () => {
    const payload = fixture();
    Object.assign(payload.data, { type: 'rto', status_external: 'Delivered', current_event_description: 'Delivered',
      status_internal: 'rto_delivered', timestamp: 1767704400000, rto_awb_num: 'R00000001' });
    const returning = { ...payload.data.tracking[2], timestamp: 1767618000000, type: 'rto', awb_number: 'R00000001' };
    payload.data.tracking = [payload.data.tracking[4], returning, payload.data.tracking[0],
      payload.data.tracking[2], payload.data.tracking[1], payload.data.tracking[3]];
    const result = parseDtdc(payload, NUMBER);
    expect(result).toMatchObject({ status: 'exception', current_stage: 'returned' });
    expect(result.events?.slice(0, 3).map(event => [event.description, event.stage, event.provider_leg]))
      .toEqual([['Delivered', 'returned', 'return'], ['In Transit', 'in_transit', 'return'], ['Delivered', 'delivered', undefined]]);
    const times = result.events!.map(event => Date.parse(event.time!));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(result.delivered_at).toBeUndefined();
    returning.type = 'forward';
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('keeps scans of one instant in the order of a history listed oldest first', () => {
    const payload = fixture();
    const tracking = payload.data.tracking.reverse();
    tracking.splice(3, 0, { ...tracking[2], status_external: 'Reached Destination', event_description: 'Reached Destination' });
    expect(parseDtdc(payload, NUMBER).events?.map(event => event.description))
      .toEqual(['Delivered', 'Out For Delivery', 'Reached Destination', 'In Transit', 'Picked Up', 'Booked']);
  });

  it('preserves an unknown return scan label without claiming recipient delivery', () => {
    const payload = fixture();
    Object.assign(payload.data, { type: 'rto', status_external: 'New return state', current_event_description: 'New return state' });
    Object.assign(payload.data.tracking[0], { type: 'rto', status_external: 'New return state', event_description: 'New return state' });
    const result = parseDtdc(payload, NUMBER);
    expect(result).toMatchObject({ status: 'unknown', last_status_text: 'New return state' });
    expect(result.current_stage).toBeUndefined();
    expect(result.events?.[0]).toMatchObject({ provider_leg: 'return' });
    expect(result.events?.[0]!.stage).toBeUndefined();
    expect(result.delivered_at).toBeUndefined();
  });

  it('preserves unmapped wording without letting an older delivered scan drive current state', () => {
    const payload = fixture();
    payload.data.status_external = 'New wording'; payload.data.current_event_description = 'New wording';
    const result = parseDtdc(payload, NUMBER);
    expect(result).toMatchObject({ status: 'unknown', last_status_text: 'New wording' });
    expect(result.current_stage).toBeUndefined();
    expect(result.events?.some(scan => scan.stage === 'delivered')).toBe(true);
  });

  it.each([null, 0, -1, 1790000000, '1767445200000', Number.NaN])('rejects ambiguous or invalid epoch milliseconds %s', timestamp => {
    const payload = fixture(); payload.data.tracking[0].timestamp = timestamp;
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('keeps generic unavailable responses indeterminate', () => {
    expect(() => parseDtdc({ status: 'ERROR', error: { message: 'Unable to fetch tracking data currently' } }, NUMBER))
      .toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    expect(() => parseDtdc({ status: 'OK', data: {} }, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    const payload = fixture(); payload.data.tracking = [{}];
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('rejects an unknown shipment leg instead of assuming recipient delivery', () => {
    const payload = fixture(); payload.data.type = 'reverse';
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    payload.data.type = 'forward'; delete payload.data.tracking[0].type;
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('deduplicates exact history and bounds output after ordering', () => {
    const payload = fixture(); payload.data.tracking.push(payload.data.tracking[0]);
    expect(parseDtdc(payload, NUMBER).events).toHaveLength(5);
    for (let i = 0; i < 110; i++) payload.data.tracking.push({ ...payload.data.tracking[0], location: `Example depot ${i}`, timestamp: 1767531600000 + i * 1000 });
    const result = parseDtdc(payload, NUMBER);
    expect(result.events).toHaveLength(100);
    expect(result.events?.[0]!.location).toBe('Example depot 109');
    payload.data.tracking = Array.from({ length: 1001 }, () => payload.data.tracking[0]);
    expect(() => parseDtdc(payload, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('backs every declared capability with synthetic data', () => {
    const capabilities = JSON.parse(readFileSync(new URL('./carrier.json', import.meta.url), 'utf8')).capabilities as string[];
    const result = parseDtdc(fixture(), NUMBER);
    const supported: Record<string, boolean> = { history: Boolean(result.events?.length), location: Boolean(result.events?.some(event => event.location)) };
    for (const capability of capabilities) expect(supported[capability], capability).toBe(true);
  });
});

const FEED = 'https://ebookingbackend.dtdc.in/trackConsignment';
// The tracking page's own picture key, the same for every visitor.
const PICTURE_KEY = 'TlY5pUTfHG1cec/Ei4XNJNQb1tpoTvUx+9lqENUXegY='; // gitleaks:allow
const scan = (label: string, time: string, line: string) => '<div class="timeline-item-middle success timeline-event-main"><div class="timeline-icon"></div>'
  + `<div class="timeline-content-middle"><div class="timeline-header-middle"><span class="timeline-status-middle">${label}</span><span class="timeline-date-middle">${time}</span></div>`
  + `<div class="timeline-description-middle">${line}</div></div></div>`;
const current = (label: string, time: string, line: string) => '<div class="timeline-item success"><div class="timeline-icon"></div><div class="timeline-content"><div class="timeline-header">'
  + `<span class="timeline-status">${label}</span><span class="timeline-date">${time}</span><span class="status current">Current</span></div><div class="timeline-description">${line} </div></div></div>`;
const remark = (time: string, line: string) => '<div class="timeline-item-middle success duplicate-remark timeline-event-remark"><div class="timeline-icon"></div><div class="timeline-content-middle">'
  + `<div class="timeline-description-middle">${line}</div><div class="timeline-header-middle timeline-header-remark"><span class="timeline-date-middle">${time}</span></div></div></div>`;
const page = (timeline: string, { awb = NUMBER, active = 'active' } = {}) => '<!doctype html><html><body><div class="mainshipment-tracking"><div class="mainframe-shipment container-custom">'
  + `<div class="tracking-header"><div class="awb-section"><span class="dtdc-text">DTDC</span><span class="awb-text"><i>AWB:</i> ${awb}</span></div>`
  + '<div class="booking-info"><div class="booking-item"><div class="ref-label">Ref. No.</div><div class="ref-number">#SYNREF0001</div></div></div></div><div class="shipment-main">'
  + `<div class="state-container" id="state-intransit"><div class="timeline">${scan('Booked', 'Aug 01, 2026 9:00AM', 'Stale copy')}</div></div>`
  + `<div class="state-container ${active}" id="state-delivered"><div class="timeline" id="showHistory">${timeline}</div></div></div></div></div></body></html>`;
const notFound = (echo: string) => '<!doctype html><html><body><div class="tracking-header"><div class="ref-number"></div></div><div class="shipment-not-found mt-4">'
  + `<div class="notfound"><div class="shipment-not-found"><h3>Shipment Details Not Found</h3><p>Shipment details not found</p></div> : ${echo} </div></div></body></html>`;
const delivered = () => page(current('Delivered', 'Aug 27, 2026 3:33PM', 'Delivered')
  + scan('Out for Delivery', 'Aug 27, 2026 12:47PM', 'Shipment is out for Delivery') + remark('Aug 27, 2026 12:03PM', 'Received at Example Delivery Centre')
  + '<div class="additional-events-batch" data-batch="1">' + scan('At Processing Centre', 'Aug 26, 2026 8:20AM', 'Undelivered due to')
  + scan('Dispatched from EXAMPLE', 'Aug 25, 2026 10:28PM', 'On its way between EXAMPLE and SAMPLE') + scan('', 'Aug 25, 2026 9:00PM', 'Undelivered due to')
  + scan('Picked up', 'Aug 25, 2026 4:46PM', 'Pick up done') + '</div>');

describe('DTDC tracking page', () => {
  it('reads the shown history with its current scan, remarks and later batches, on India\'s clock', () => {
    const result = normalizeCarrierResult(parseDtdcPage(delivered(), NUMBER));
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', timezone: 'Asia/Kolkata',
      last_status_text: 'Delivered', last_update: '2026-08-27T15:33:00+05:30', delivered_at: '2026-08-27T15:33:00+05:30' });
    expect(result.events?.map(event => [event.description, event.stage])).toEqual([
      ['Delivered', 'delivered'], ['Shipment is out for Delivery', 'out_for_delivery'], ['Received at Example Delivery Centre', undefined],
      // The label goes first: this scan's line names an earlier failed delivery.
      ['Undelivered due to', 'in_transit'], ['On its way between EXAMPLE and SAMPLE', 'in_transit'], ['Undelivered due to', undefined], ['Pick up done', 'accepted']]);
    expect(JSON.stringify(result)).not.toContain('Stale copy');
  });

  it('keeps one copy of a current scan the list repeats', () => {
    const line = 'Shipment return is initiated for EXAMPLE';
    const result = parseDtdcPage(page(current('Return Initiated', 'Sep 28, 2026 11:49AM', line) + scan('Return - Initiated', 'Sep 28, 2026 11:49AM', line)
      + scan('Undelivered', 'Sep 25, 2026 5:48PM', 'Undelivered due to ADDRESS INCOMPLETE OR WRONG')), NUMBER);
    expect(result).toMatchObject({ status: 'exception', current_stage: 'exception', last_status_text: line });
    expect(result.events?.map(event => event.stage)).toEqual(['exception', 'failed_attempt']);
  });

  it('binds the waybill or the reference, and reads a missing shipment only when the page names the number', () => {
    expect(parseDtdcPage(delivered(), 'SYNREF0001').events).toHaveLength(7);
    expect(() => parseDtdcPage(page(scan('Booked', 'Aug 01, 2026 9:00AM', 'Booked'), { awb: 'N00000002' }), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseDtdcPage(notFound(NUMBER), NUMBER)).toThrow(expect.objectContaining({ kind: 'not_found' }));
    expect(() => parseDtdcPage(notFound('N00000002'), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseDtdcPage(page(scan('Booked', 'Aug 01, 2026 9:00AM', 'Booked'), { active: '' }), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseDtdcPage(page(''), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseDtdcPage(page(scan('Booked', 'Yesterday', 'Booked')), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });
});

/** A guest lookup on www.dtdc.com: a sealed picture, its check, the shipment lookup and the shipment page. */
async function website(options: { answers?: string[]; accepted?: string; page?: string; opened?: unknown } = {}) {
  const plain = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const key = await crypto.subtle.importKey('raw', Buffer.from(PICTURE_KEY, 'base64'), { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = new Uint8Array(12).fill(7);
  const sealed = Buffer.concat([iv, Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain))]).toString('base64');
  const answers = [...(options.answers ?? ['ABC123'])];
  const solveCaptcha = vi.fn(async (bytes: Uint8Array) => { expect([...bytes]).toEqual([...plain]); return answers.shift() ?? ''; });
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const target = String(url);
    if (target.startsWith(FEED)) return new Response('Failure', { status: 400 });
    if (target.startsWith('https://www.dtdc.com/wp-json/custom/v1/generate-captcha?t=')) {
      return Response.json({ data: Buffer.from(JSON.stringify({ k: 'synthetic-key-0001', i: sealed })).toString('base64') });
    }
    if (target === 'https://www.dtdc.com/wp-json/custom/v1/captcha/validate') {
      const { captchaKey, captchaValue } = JSON.parse(String(init?.body)) as Record<string, string>;
      expect(captchaKey).toBe('synthetic-key-0001');
      return Response.json(captchaValue === (options.accepted ?? 'ABC123') ? { success: true, token: 'synthetic.token-0001' } : { success: false, message: 'Invalid captcha' });
    }
    if (target === 'https://www.dtdc.com/wp-json/custom/v1/tracking/pull-details') {
      expect(new Headers(init?.headers).get('X-DTDC-Track-Token')).toBe('synthetic.token-0001');
      expect(JSON.parse(String(init?.body))).toEqual({ trackNumbers: [NUMBER] });
      if (typeof options.opened === 'string') return new Response(options.opened, { headers: { 'Content-Type': 'text/html' } });
      return Response.json(options.opened ?? { success: true, redirect: 'https://www.dtdc.com/trackshipment', payload: 'sealed_shipment-0001' });
    }
    if (target === 'https://www.dtdc.com/trackshipment') {
      expect(String(init?.body)).toBe('d=sealed_shipment-0001');
      return new Response(options.page ?? delivered(), { headers: { 'Content-Type': 'text/html' } });
    }
    throw new Error(`unexpected request ${target}`);
  });
  const steps: StepRecord[] = [];
  const tracker = new DtdcTracker({ fetcher, solveCaptcha, recorder: { step: record => steps.push(record), lookup: () => undefined } });
  return { fetcher, solveCaptcha, steps, track: () => tracker.fetch(NUMBER) };
}

describe('DTDC tracking page retrieval', () => {
  it('opens the page with a read picture when the feed fails', async () => {
    const lookup = await website({ answers: ['ABCD', 'XYZ789', 'ABC123'] });
    await expect(lookup.track()).resolves.toMatchObject({ status: 'delivered', delivered_at: '2026-08-27T15:33:00+05:30' });
    // A misread picture is not sent; a refused answer gets a fresh picture.
    expect(lookup.solveCaptcha).toHaveBeenCalledTimes(3);
    expect(lookup.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/captcha/validate'))).toHaveLength(2);
    expect(lookup.steps.map(step => [step.step, step.outcome])).toEqual([['direct', 'indeterminate'], ['website', 'ok']]);
  });

  it('says the picture check stopped it after three refused answers', async () => {
    const lookup = await website({ answers: ['XYZ789', 'XYZ789', 'XYZ789', 'ABC123'] });
    await expect(lookup.track()).rejects.toMatchObject({ kind: 'challenge' });
    expect(lookup.solveCaptcha).toHaveBeenCalledTimes(3);
  });

  it('keeps a refused lookup, a moved page and a web page in place of JSON apart from parcel absence', async () => {
    await expect((await website({ opened: { success: false, errorMessage: 'Failure' } })).track()).rejects.toMatchObject({ kind: 'indeterminate' });
    await expect((await website({ opened: { success: true, redirect: 'https://example.com/trackshipment', payload: 'sealed_shipment-0001' } })).track())
      .rejects.toMatchObject({ kind: 'schema' });
    await expect((await website({ opened: '<!doctype html><title>Example</title>' })).track()).rejects.toMatchObject({ kind: 'indeterminate' });
    await expect((await website({ page: notFound(NUMBER) })).track()).rejects.toMatchObject({ kind: 'not_found' });
  });
});

describe('DTDC retrieval', () => {
  it('uses one anonymous bounded request for each lookup and preserves the environment seam', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(fixture())));
    const instance = adapter({ fetcher, recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });
    expect(instance.id).toBe('dtdc'); expect(instance.steps).toEqual(['direct', 'website']);
    expect(normalizeDtdcNumber('n-0000 0001')).toBe(NUMBER);
    await instance.track({ number: NUMBER }); await instance.track({ number: NUMBER });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toBe(`https://ebookingbackend.dtdc.in/trackConsignment?reference_number=${NUMBER}`);
      expect(init).toMatchObject({ cache: 'no-store', redirect: 'error' });
      expect(new Headers(init?.headers).get('Accept')).toBe('application/json');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      expect(new Headers(init?.headers).has('Cookie')).toBe(false);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each(['123', 'N00000001&reference_number=OTHER', 'N'.repeat(21)])('rejects invalid input %s before I/O', async number => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new DtdcTracker({ fetcher }).fetch(number)).rejects.toMatchObject({ kind: 'invalid_input' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([[400, 'indeterminate'], [401, 'challenge'], [403, 'challenge'], [404, 'transport'], [410, 'transport'], [429, 'rate_limited'], [503, 'maintenance']])('keeps the feed\'s HTTP %s separate from parcel absence', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => new Response('Failure', { status: String(url).startsWith(FEED) ? Number(status) : 503 }));
    const steps: StepRecord[] = [];
    // A rate limit or maintenance is not asked again on the tracking page, here under maintenance.
    const final = ['rate_limited', 'maintenance'].includes(String(kind));
    await expect(new DtdcTracker({ fetcher, recorder: { step: record => steps.push(record), lookup: () => undefined } }).fetch(NUMBER))
      .rejects.toMatchObject({ kind: final ? kind : 'maintenance' });
    expect(steps[0]).toMatchObject({ step: 'direct', outcome: kind });
    expect(fetcher).toHaveBeenCalledTimes(final ? 1 : 2);
  });

  it('propagates cancellation, fractional deadlines and response limits', async () => {
    const unused = vi.fn<typeof fetch>();
    await expect(new DtdcTracker({ fetcher: unused }).fetch(NUMBER, { signal: AbortSignal.abort() })).rejects.toThrow();
    expect(unused).not.toHaveBeenCalled();
    const slow = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      await new Promise<void>(resolve => init?.signal?.addEventListener('abort', () => resolve(), { once: true }));
      init?.signal?.throwIfAborted(); return new Response(JSON.stringify(fixture()));
    });
    await expect(new DtdcTracker({ fetcher: slow }).fetch(NUMBER, { budgetMs: 20.5 })).rejects.toThrow();
    const oversized = vi.fn<typeof fetch>().mockImplementation(async () => new Response('x'.repeat(1_000_001)));
    await expect(new DtdcTracker({ fetcher: oversized }).fetch(NUMBER)).rejects.toThrow('unexpectedly large');
  });
});

describe('DTDC links', () => {
  it.each(['trackingId', 'awb'])('reads the number out of a pasted DTDC link with %s', param => {
    expect(parseTrackingInput(`https://www.dtdc.com/track-your-shipment/?${param}=W00000000`))
      .toMatchObject({ trackingNumber: 'W00000000', carrier: 'dtdc', source: 'link' });
  });
});
