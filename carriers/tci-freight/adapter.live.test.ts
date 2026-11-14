import { describe, expect, it } from 'vitest';
import { TciFreightTracker } from './adapter.js';

const positive = process.env.TCI_FREIGHT_TRACKING_NUMBER;
const unknown = process.env.TCI_FREIGHT_UNKNOWN_NUMBER;

describe('tci-freight live guest retrieval', () => {
  it.skipIf(!positive)('reads whole-bound dated history', async () => {
    const result = await new TciFreightTracker().fetch(positive!);
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.local_time && !event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('keeps an unconfirmed unknown inconclusive', async () => {
    await expect(new TciFreightTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'indeterminate' });
  }, 20_000);
});
