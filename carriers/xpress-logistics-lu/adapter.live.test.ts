import { describe, expect, it } from 'vitest';
import { XpressLogisticsTracker } from './adapter.js';

const positive = process.env.XPRESS_LOGISTICS_LU_TRACKING_NUMBER;
const unknown = process.env.XPRESS_LOGISTICS_LU_UNKNOWN_NUMBER;

describe('xpress-logistics-lu live guest retrieval', () => {
  it.skipIf(!positive)('reads a parcel bound to the whole number', async () => {
    const result = await new XpressLogisticsTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.events!.every(event => event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new XpressLogisticsTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
