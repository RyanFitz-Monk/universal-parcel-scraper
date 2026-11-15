import { describe, expect, it } from 'vitest';
import { TimeMattersTracker } from './adapter.js';

const positive = process.env.TIME_MATTERS_TRACKING_NUMBER;
const unknown = process.env.TIME_MATTERS_UNKNOWN_NUMBER;

describe('time-matters live guest retrieval', () => {
  it.skipIf(!positive)('reads an order by its number', async () => {
    const result = await new TimeMattersTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.events!.every(event => event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new TimeMattersTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
