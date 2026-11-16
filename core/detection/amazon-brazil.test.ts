import { describe, expect, it } from 'vitest';
import { isAmazonTrackingNumber } from './amazon.js';
import { detectCarrierMatch } from './detect.js';
import { requiresAmazonAccount } from '../catalog/amazon.js';
import { parcelTrackingLinks } from '../catalog/parcel.js';
import { normalizeAmazonShippingTrackingNumber } from '../../carriers/amazon-shipping/adapter.js';

describe('Brazilian Amazon tracking references', () => {
  it('recognizes the complete nine-digit TBR family with common separators', () => {
    for (const number of ['TBR000000001', 'tbr 000 000 001', 'TBR-000-000-001']) {
      expect(isAmazonTrackingNumber(number)).toBe(true);
      expect(normalizeAmazonShippingTrackingNumber(number)).toBe('TBR000000001');
      expect(detectCarrierMatch(number)).toMatchObject({ carrier: 'amazon-logistics', confidence: 'high' });
    }
  });

  it('rejects other TBR lengths instead of broadening the shared TB family', () => {
    for (const digits of [8, 10, 12]) {
      const number = 'TBR' + '0'.repeat(digits);
      expect(isAmazonTrackingNumber(number)).toBe(false);
      expect(detectCarrierMatch(number).candidates).not.toContain('amazon-logistics');
      expect(() => normalizeAmazonShippingTrackingNumber(number)).toThrow(expect.objectContaining({ kind: 'invalid_input' }));
    }
  });

  it('keeps retail tracking in Amazon and opens its Brazilian store', () => {
    const trackingNumber = 'TBR000000001';
    expect(requiresAmazonAccount('amazon-logistics', trackingNumber)).toBe(true);
    expect(requiresAmazonAccount('unknown', trackingNumber)).toBe(true);
    expect(parcelTrackingLinks({ carrier: 'amazon-logistics', trackingNumber, destinationCountry: 'US' })[0]?.url)
      .toBe('https://www.amazon.com.br/gp/your-account/order-history');
  });
});
