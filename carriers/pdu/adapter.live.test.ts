import { describe, expect, it } from 'vitest';
import { PduTracker } from './adapter.js';

const positive = process.env.PDU_TRACKING_NUMBER;
const unknown = process.env.PDU_UNKNOWN_NUMBER;

describe('PDU live guest retrieval', () => {
  it.skipIf(!positive)('reads a parcel bound to the whole number', async () => {
    const result = await new PduTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.events?.length).toBeGreaterThan(0);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new PduTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
