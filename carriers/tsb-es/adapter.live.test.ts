import { describe, expect, it } from 'vitest';
import { TsbTracker } from './adapter.js';

const positive = process.env.TSB_ES_TRACKING_NUMBER;
const unknown = process.env.TSB_ES_UNKNOWN_NUMBER;

describe('tsb-es live guest retrieval', () => {
  it.skipIf(!positive)('reads a shipment bound to the whole number', async () => {
    const result = await new TsbTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.events!.every(event => event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new TsbTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
