import { describe, expect, it } from 'vitest';
import { BypostTracker } from './adapter.js';

const positive = process.env.BYPOST_TRACKING_NUMBER;
const unknown = process.env.BYPOST_UNKNOWN_NUMBER;

describe('bypost live guest retrieval', () => {
  it.skipIf(!positive)('reads a shipment bound to the whole number', async () => {
    const result = await new BypostTracker().fetch(positive!);
    expect(result.current_stage ?? result.events!.length).toBeTruthy();
    expect(result.events!.every(event => event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new BypostTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
