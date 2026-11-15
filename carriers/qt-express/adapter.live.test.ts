import { describe, expect, it } from 'vitest';
import { QtExpressTracker } from './adapter.js';

const positive = process.env.QT_EXPRESS_TRACKING_NUMBER;
const unknown = process.env.QT_EXPRESS_UNKNOWN_NUMBER;

describe('qt-express live guest retrieval', () => {
  it.skipIf(!positive)('reads a parcel bound to the whole number', async () => {
    const result = await new QtExpressTracker().fetch(positive!);
    expect(result.status).not.toBe('unknown');
    expect(result.events!.every(event => event.time && event.description)).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('reports an unknown number as not found', async () => {
    await expect(new QtExpressTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
