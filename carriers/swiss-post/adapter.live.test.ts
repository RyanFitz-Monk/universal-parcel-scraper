import { describe, expect, it } from 'vitest';
import { SwissPostTracker } from './adapter.js';

describe('Swiss Post live anonymous tracking', () => {
  it('maps the official empty search for a number with a wrong check digit to a clean 404', async () => {
    await expect(new SwissPostTracker().fetch('RR000000001CH')).rejects.toMatchObject({
      name: 'NotFoundError',
      status: 404,
      message: 'Swiss Post could not locate the shipment',
    });
  });
});
