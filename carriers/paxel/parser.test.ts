import { describe, expect, it } from 'vitest';
import { fillPartialAnswer, isPartialAnswer } from '../../core/result/partial.js';
import { resolveResult } from '../../core/result/resolve.js';
import { finishAdapterAnswer } from '../../core/adapter/run.js';
import { normalizePaxelNumber, parsePaxel, sourceClock } from './parser.js';
import { paxelScan } from './status.js';

const NUMBER = 'TSPX-12345678901';
const pair = (index = 0, wording = 'Paketmu telah berhasil diantar oleh Hero SYNTHETIC STAFF', clock = 'Nov 06 | 21:08'): string =>
  `<div class="row tx-grey"><div class="col-9"><span class="point"></span><div class="district">FACILITY ${index}</div></div>
    <div class="col-3">${clock}</div></div><div class="description"><p>${wording}</p></div>`;
const page = (pairs = Array.from({ length: 23 }, (_, index) => pair(index)).join(''), number = NUMBER): string =>
  `<form><input name="_token" value="SYNTHETIC_TOKEN"><div class="awb-detail awb-detail-0">
    <h5>${number}</h5><h6>${number}</h6><div class="proof-of-delivery"><a href="https://pod.invalid/secret">SYNTHETIC POD</a></div>
    <div class="address">SYNTHETIC RECIPIENT 0987654321</div><div class="delivery-timeline">${pairs}</div></div></form>`;
const invalid = (number = NUMBER): string => `<table class="table table-responsive"><thead><tr><th>Resi/AWB</th></tr></thead>
  <tbody><tr><td>${number}</td><td><span class="tx-red">AWB Tidak Valid</span></td></tr></tbody></table>`;

describe('Paxel whole-bound HTML', () => {
  it('retains all 23 source-ordered scans without claiming year, zone or completeness', () => {
    const result = parsePaxel(page(), NUMBER);
    expect(result.events).toHaveLength(23);
    expect(result.events?.map(event => event.location)).toEqual(Array.from({ length: 23 }, (_, index) => `FACILITY ${index}`));
    expect(result).toMatchObject({ status: 'delivered', current_stage: 'delivered', last_update: null, expected_delivery: null, history_truncated: true });
    expect(result.events?.every(event => event.provider_time_text === 'Nov 06 | 21:08' && event.time === undefined
      && event.local_time === undefined && event.time_zone === undefined)).toBe(true);
    expect(result).not.toHaveProperty('last_update_local');
    expect(result).not.toHaveProperty('delivered_at');
    expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC|0987654321|pod\.invalid|2026|_token/);
  });

  it('accepts printed/compact whole forms without partial or mixed-format equivalences', () => {
    expect(normalizePaxelNumber(NUMBER.replace('-', ''))).toBe(NUMBER);
    expect(normalizePaxelNumber('  ' + NUMBER.toLowerCase() + '  ')).toBe(NUMBER);
    const printed = 'EM.ABC123DE45-20261106-1-ABC123';
    expect(normalizePaxelNumber(printed.replace(/[.-]/g, ''))).toBe(printed);
    expect(normalizePaxelNumber(printed)).toBe(printed);
    for (const input of ['TSPX-123', NUMBER + '1', 'prefix' + NUMBER, printed.replace('EM.', 'EM'), printed + '-']) {
      expect(() => normalizePaxelNumber(input)).toThrow(expect.objectContaining({ kind: 'invalid_input' }));
    }
    expect(parsePaxel(page(pair(), printed), printed).events).toHaveLength(1);
  });

  it('requires one visible detail, both distinct exact whole headings and one timeline', () => {
    const html = page(pair());
    for (const changed of [html + html, html.replace('<h5>' + NUMBER, '<h5>OTHER'), html.replace('<h6>', '<h5>').replace('</h6>', '</h5>'),
      html.replace('<h6>', '<h6 hidden>'), '<div hidden>' + html + '</div>', html.replace('delivery-timeline', 'other-timeline'),
      html.replace('</form>', '<div class="delivery-timeline"></div></form>')]) {
      expect(() => parsePaxel(changed, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('rejects incomplete, hidden, ambiguous and unpaired timeline fields', () => {
    for (const pairs of ['', pair() + '<div class="row"></div>', pair().replace('class="col-3"', 'class="col-3 d-none"'),
      pair().replace('class="district"', 'class="district" hidden'), pair().replace('</div><div class="description">', '</div>unexpected<div class="description">'),
      pair().replace('<div class="col-3">', '<div class="col-3"><span class="col-3"></span>'), pair().replace('Nov 06 | 21:08', 'Nov 06 | 18:00 - 22:00')]) {
      expect(() => parsePaxel(page(pairs), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
  });

  it('preserves New Year source order and validates possible month/day clocks', () => {
    const result = parsePaxel(page(pair(0, undefined, 'Jan 01 | 00:01') + pair(1, undefined, 'Dec 31 | 23:59')), NUMBER);
    expect(result.events?.map(event => event.provider_time_text)).toEqual(['Jan 01 | 00:01', 'Dec 31 | 23:59']);
    expect(sourceClock('Feb 29 | 10:20')).toBe('Feb 29 | 10:20');
    for (const clock of ['Feb 30 | 10:20', 'Apr 31 | 10:20', 'Nov 00 | 10:20', 'Nov 06 | 24:00', 'Nov 06 | 21:60', '2026 Nov 06 | 21:08']) {
      expect(() => sourceClock(clock)).toThrow(expect.objectContaining({ kind: 'schema', reason: 'scan_clock_schema' }));
    }
  });

  it('maps arrival at the recipient only to out-for-delivery, and future assignment to no stage', () => {
    expect(paxelScan('Yay! Hero SYNTHETIC STAFF sudah sampai di tujuanmu!')).toEqual({ description: 'Yay! Hero sudah sampai di tujuanmu', stage: 'out_for_delivery' });
    expect(paxelScan('Yay! Hero sudah sampai di tujuanmu')).toMatchObject({ stage: 'out_for_delivery' });
    expect(paxelScan('Hore! Hero sedang otw antar paket ke tujuanmu!')).toMatchObject({ stage: 'out_for_delivery' });
    for (const wording of ['Unknown recipient SYNTHETIC CONTACT 0987654321', 'Paketmu delivered tomorrow']) {
      expect(paxelScan(wording)).toEqual({ description: 'Tracking update' });
      expect(parsePaxel(page(pair(0, wording)), NUMBER)).toMatchObject({ status: 'unknown', last_status_text: 'Tracking update' });
    }
  });

  it('keeps the established synthetic future-assignment notice nonmoving through public answer finalization', () => {
    const wording = 'Hero akan mengantar paketmu!';
    expect(paxelScan(wording)).toEqual({ description: wording, stage: 'pending' });
    const result = resolveResult(finishAdapterAnswer('paxel', parsePaxel(page(pair(0, wording)), NUMBER)));
    expect(result).toMatchObject({ status: 'pending', current_stage: 'pending' });
    expect(result.events).toMatchObject([{ stage: 'pending', stage_source: 'carrier_map', description: wording }]);
    expect(result.events[0]).not.toHaveProperty('stage_inferred');
  });

  it.each([
    'Paketmu sudah sampai di lokasi transit. Sebentar lagi akan diantar oleh Hero kami!',
    'Paketmu sedang dalam perjalanan ke lokasi transit selanjutnya!',
    'Paketmu sedang transit. Sabar ya, paketmu akan segera dikirimkan ke tujuan berikutnya',
  ])('keeps the observed transit stage: %s', wording => {
    expect(parsePaxel(page(pair(0, wording)), NUMBER)).toMatchObject({ current_stage: 'in_transit' });
  });

  it('keeps the exact whole-bound invalid notice indeterminate', () => {
    expect(() => parsePaxel(invalid(), NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate', reason: 'invalid_awb' }));
    for (const changed of [invalid('TSPX-99999999999'), invalid().replace('AWB Tidak Valid</span>', 'AWB Tidak Valid?</span>'),
      invalid().replace('<td>', '<td hidden>'), invalid() + invalid(), invalid().replace('<span', '<div').replace('</span>', '</div>')]) {
      expect(() => parsePaxel(changed, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    // A notice elsewhere cannot override independently bound history.
    expect(parsePaxel(page(pair()) + invalid('TSPX-99999999999'), NUMBER).events).toHaveLength(1);
  });

  it.each(['<title>Just a moment...</title>', '<div class="cf-turnstile"></div>', '<script src="/cdn-cgi/challenge-platform/a.js"></script>',
    '<div class="g-recaptcha"></div>', '<input name="captcha_code">'])('classifies HTTP 200 verification as a challenge: %s', html => {
    expect(() => parsePaxel(html, NUMBER)).toThrow(expect.objectContaining({ kind: 'challenge' }));
  });

  it.each(['TokenMismatchException', '<div id="_ignition">debug</div>', 'Stack trace: synthetic', 'APP_KEY = synthetic', '{}', ''])('keeps debug, error and empty HTML distinct from verification: %s', html => {
    expect(() => parsePaxel(html, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('rejects response/event caps and contact-shaped facility fields', () => {
    expect(() => parsePaxel('x'.repeat(2_000_001), NUMBER)).toThrow(expect.objectContaining({ reason: 'body_limit' }));
    expect(() => parsePaxel('é'.repeat(1_000_001), NUMBER)).toThrow(expect.objectContaining({ reason: 'body_limit' }));
    expect(() => parsePaxel(page(Array.from({ length: 501 }, (_, index) => pair(index)).join('')), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parsePaxel(page(pair().replace('FACILITY 0', 'phone 0987654321')), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });

  it('lets a fuller same-carrier fallback supplement the partial native history', () => {
    const direct = parsePaxel(page(pair()), NUMBER);
    expect(isPartialAnswer(direct)).toBe(true);
    const fuller = { status: 'delivered' as const, current_stage: 'delivered', discovered_carrier: 'paxel', events: [
      { time: '2026-11-06T21:08:00+07:00', stage: 'delivered', description: 'Delivered' },
      { time: '2026-11-05T10:00:00+07:00', stage: 'in_transit', description: 'In transit' },
    ] };
    expect(fillPartialAnswer('paxel', NUMBER, direct, fuller)?.events).toHaveLength(2);
    expect(fillPartialAnswer('paxel', NUMBER, direct, { ...fuller, discovered_carrier: 'dhl-express' })).toBeNull();
  });
});
