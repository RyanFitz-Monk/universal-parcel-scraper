import { describe, expect, it } from 'vitest';
import { SwissconnectTracker } from './adapter.js';

const positive = process.env.SWISSCONNECT_TRACKING_NUMBER;
const unknown = process.env.SWISSCONNECT_UNKNOWN_NUMBER;

describe('swissconnect live guest retrieval', () => {
  it.skipIf(!positive)('reads a shipment bound to the whole number', async () => {
    const result = await new SwissconnectTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.last_status_text).toBeTruthy();
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new SwissconnectTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
