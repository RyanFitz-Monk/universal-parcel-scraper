import { describe, expect, it } from 'vitest';
import { LionTracker } from './adapter.js';

const positive = process.env.THREESIXTYLION_TRACKING_NUMBER;
const unknown = process.env.THREESIXTYLION_UNKNOWN_NUMBER;

describe('360lion live guest retrieval', () => {
  it.skipIf(!positive)('reads a parcel bound to the whole number', async () => {
    const result = await new LionTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.events!.every(event => event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new LionTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
