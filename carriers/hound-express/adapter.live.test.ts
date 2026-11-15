import { describe, expect, it } from 'vitest';
import { HoundExpressTracker } from './adapter.js';

const positive = process.env.HOUND_EXPRESS_TRACKING_NUMBER;
const unknown = process.env.HOUND_EXPRESS_UNKNOWN_NUMBER;

describe('hound-express live guest retrieval', () => {
  it.skipIf(!positive)('reads a guide bound to the whole number', async () => {
    const result = await new HoundExpressTracker().fetch(positive!);
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.time && event.description && event.provider_code)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown guide as not found', async () => {
    await expect(new HoundExpressTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
