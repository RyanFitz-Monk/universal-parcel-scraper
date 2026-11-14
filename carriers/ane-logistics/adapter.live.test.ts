import { describe, expect, it } from 'vitest';
import { AneLogisticsTracker } from './adapter.js';

const positive = process.env.ANE_LOGISTICS_TRACKING_NUMBER;
const unknown = process.env.ANE_LOGISTICS_UNKNOWN_NUMBER;

describe('ane-logistics live guest retrieval', () => {
  it.skipIf(!positive)('reads whole-bound dated history', async () => {
    const result = await new AneLogisticsTracker().fetch(positive!);
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.local_time && !event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('keeps an unconfirmed unknown inconclusive', async () => {
    await expect(new AneLogisticsTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'indeterminate' });
  }, 20_000);
});
