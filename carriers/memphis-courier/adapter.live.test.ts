import { describe, expect, it } from 'vitest';
import { MemphisTracker } from './adapter.js';

const positive = process.env.MEMPHIS_COURIER_TRACKING_NUMBER;
const unknown = process.env.MEMPHIS_COURIER_UNKNOWN_NUMBER;

describe('memphis-courier live guest retrieval', () => {
  it.skipIf(!positive)('reads a shipment bound to the whole code', async () => {
    const result = await new MemphisTracker().fetch(positive!);
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => (event.time || event.local_time) && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown code as not found', async () => {
    await expect(new MemphisTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
