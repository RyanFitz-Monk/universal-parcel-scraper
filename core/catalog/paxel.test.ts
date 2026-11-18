import { describe, expect, it } from 'vitest';
import { detectCarrierMatch, parseTrackingInput } from '../detection/index.js';
import { CARRIERS, trackingNumberForLink } from './index.js';

const printed = 'EM.ABCDEFGHJK-20261107-1-ZZZZZZ';
const normalized = 'EMABCDEFGHJK202611071ZZZZZZ';

describe('Paxel portal links', () => {
  it.each([printed, normalized, normalized.toLowerCase()])('restores the printed AWB for %s', raw => {
    const url = CARRIERS.paxel.trackingUrl!(raw);
    expect(url).toBe(`https://paxel.co/id/lacak-pengiriman?awb_req=${printed}`);
    expect(parseTrackingInput(url)).toMatchObject({
      trackingNumber: printed, carrier: 'paxel', confidence: 'high', source: 'link',
    });
  });

  it.each(['id/lacak-pengiriman', 'id/track-shipments', 'en/track-shipments'])('reads pasted %s links', path => {
    expect(parseTrackingInput(`https://paxel.co/${path}?awb_req=${printed}`)).toMatchObject({
      trackingNumber: printed, carrier: 'paxel', confidence: 'high', source: 'link',
    });
  });

  it.each(['TSPX-00000000000', 'TSPX00000000000', 'tspx00000000000'])('prints a filed TSPX reference without adding an issuer rule', raw => {
    expect(trackingNumberForLink('paxel', raw)).toBe('TSPX-00000000000');
    expect(CARRIERS.paxel.trackingUrl!(raw)).toBe('https://paxel.co/id/lacak-pengiriman?awb_req=TSPX-00000000000');
  });

  it('does not offer Paxel for a bare TSPX-shaped number', () => {
    expect(detectCarrierMatch('TSPX00000000000').candidates ?? []).not.toContain('paxel');
  });

  it('leaves other identifier layouts unchanged', () => {
    for (const raw of ['TSPX-0000000000', 'TSPX-000000000000', 'SAMPLE', 'EM-TOO-SHORT']) {
      expect(trackingNumberForLink('paxel', raw)).toBe(raw);
    }
    expect(CARRIERS.paxel.trackingSearchUrl).toBe('https://paxel.co/id/lacak-pengiriman');
  });
});
