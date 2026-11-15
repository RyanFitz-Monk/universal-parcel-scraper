import { describe, expect, it } from 'vitest';
import { NightStarExpressTracker } from './adapter.js';

const positive = process.env.NIGHT_STAR_EXPRESS_TRACKING_NUMBER;
const unknown = process.env.NIGHT_STAR_EXPRESS_UNKNOWN_NUMBER;

describe('night-star-express live guest retrieval', () => {
  it.skipIf(!positive)('reads an order bound to the whole number', async () => {
    const result = await new NightStarExpressTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.events!.every(event => event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new NightStarExpressTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
