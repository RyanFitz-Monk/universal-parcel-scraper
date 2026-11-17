import { describe, expect, it, vi } from 'vitest';
import { statusMapAnswer } from '../../core/catalog/statusMaps.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { normalizeStatusWording } from '../../core/status/statusMap.js';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { parseHualeiTrack } from '../gzyl/hualei.js';
import { adapter, PwbTracker } from './adapter.js';
import { PWB, PWB_ORIGIN } from './parser.js';
import { statusMap } from './status.js';
import statuses from './statuses.json' with { type: 'json' };
import carrier from './carrier.json' with { type: 'json' };

const NUMBER = 'PWB999999970CN';
// Evening in Beijing on 17 March, after the record's last row.
const READ_AT = Date.parse('2026-03-17T12:00:00Z');
const row = (track_date: string, track_content: string, track_kind = '', track_location = '') => ({ track_date, track_content, track_kind, track_location });
/** A synthetic record in the shape PWB's tracker answers, newest row first, on a line to Switzerland with DPD for the last mile. */
const record = (rows: readonly ReturnType<typeof row>[]) => [{ ack: 'true', data: [{
  trackingNumber: NUMBER, consigneeCountry: 'CH', productKindName: 'Synthetic Line', businessStatusCode: 'TS', trackDetails: rows,
}] }];
const LINE = [
  row('2026-03-16 15:33:00', 'Package picked up by last-mile carrier'),
  row('2026-03-16 12:33:00', 'Customs import clearance completed, awaiting pickup by local carrier'),
  row('2026-03-16 10:33:00', '目的港已提货 Delivery has been made at the destination port'),
  row('2026-03-14 07:03:00', 'Package arrived at destination country'),
  row('2026-03-11 15:19:00', 'Package in transit to destination country'),
  row('2026-03-08 16:45:00', '预计配载航班3月11日,Expected flight on March 11th'),
  row('2026-03-07 11:19:00', 'Customs export clearance completed'),
  row('2026-03-06 15:48:31', 'Order information has been transmitted to DPD.'),
  row('2026-03-02 20:11:37', 'Package departed from the warehouse', 'SHIPMENT', '深圳'),
  row('2026-03-02 19:04:03', 'Package received and scanned at warehouse到达收货点', 'ARRIVAL', '深圳'),
  row('2026-03-02 09:51:41', '货物电子信息已经收到'),
];
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });

describe('PWB numbers', () => {
  it('claims PWB, nine digits and CN, and nothing shorter, longer or under another prefix', () => {
    expect(detectCarrierMatch(NUMBER)).toMatchObject({ carrier: 'pwb', confidence: 'high', candidates: ['pwb'] });
    for (const other of ['PWB99999997CN', 'PWB9999999700CN', 'PWX999999970CN', 'PWB999999970US', 'XPWB999999970CN']) {
      expect(detectCarrierMatch(other).candidates, other).not.toContain('pwb');
    }
  });
});

describe('PWB tracking adapter', () => {
  it('asks its own Hualei tracker over plain HTTP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(record(LINE)));
    const result = await new PwbTracker({ fetcher, recorder: NOOP_RECORDER }).fetch(NUMBER.toLowerCase());
    expect(result).toMatchObject({ status: 'in_transit', current_stage: 'in_transit', destination_country: 'CH' });
    expect(fetcher.mock.calls.map(([url, init]) => [String(url), init?.method ?? 'GET'])).toEqual([[`${PWB_ORIGIN}/selectTrack.htm?documentCode=${NUMBER}`, 'GET']]);
    expect(PWB_ORIGIN).toBe('http://www.pwbpost.com:8082');
    expect(adapter({ fetcher, recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null }))
      .toMatchObject({ id: 'pwb', recordsSteps: true, steps: ['direct', 'retry'] });
  });

  it('reads the line on Beijing time, the DPD hand-over and the destination port as no movement or delivery', () => {
    const result = parseHualeiTrack(record(LINE), NUMBER, PWB, READ_AT)!;
    expect(result).toMatchObject({
      status: 'in_transit', current_stage: 'in_transit', current_stage_source: 'carrier_map',
      last_status_text: 'Package picked up by last-mile carrier', last_update: '2026-03-16T15:33:00+08:00', destination_country: 'CH',
    });
    expect(result.events!.map((event) => event.stage)).toEqual([
      'in_transit', 'in_transit', 'in_transit', 'in_transit', 'in_transit', 'in_transit', 'in_transit', 'pending', 'in_transit', 'accepted', 'registered',
    ]);
    expect(result.events!.every((event) => event.stage_source === 'carrier_map')).toBe(true);
    expect(result.delivery_carrier).toBeUndefined();
    expect(result.delivery_tracking_number).toBeUndefined();
  });

  it('keeps the stage before DPD’s hand-over when that is the newest row', () => {
    const result = parseHualeiTrack(record(LINE.slice(7)), NUMBER, PWB, READ_AT)!;
    expect(result).toMatchObject({ current_stage: 'in_transit', last_status_text: 'Order information has been transmitted to DPD.' });
  });

  it('maps every wording it lists by wording alone, a booked flight on any day, and the app reads the map', () => {
    for (const entry of statuses.entries) expect(statusMap.stage(null, normalizeStatusWording(entry.wording)), entry.wording).toBe(entry.stage);
    expect(statusMap.stage(null, normalizeStatusWording('预计配载航班12月2日,Expected flight on December 2nd'))).toBe('in_transit');
    expect(statusMapAnswer({ carrier: 'pwb', providerCode: null, description: '目的港已提货 Delivery has been made at the destination port' }))
      .toEqual({ kind: 'mapped', stage: 'in_transit' });
    expect(statusMapAnswer({ carrier: 'pwb', providerCode: 'ARRIVAL', description: 'synthetic arrival' })).toEqual({ kind: 'unknown' });
    expect(carrier.portal).not.toHaveProperty('url');
  });
});
