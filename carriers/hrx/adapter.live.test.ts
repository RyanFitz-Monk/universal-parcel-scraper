import { describe, expect, it } from 'vitest';
import { HrxTracker } from './adapter.js';

const positive = process.env.HRX_TRACKING_NUMBER;
const unknown = process.env.HRX_UNKNOWN_NUMBER;

describe('hrx live guest retrieval', () => {
  it.skipIf(!positive)('reads an order bound to the whole number', async () => {
    const result = await new HrxTracker().fetch(positive!);
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.time && event.provider_code && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new HrxTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
