import { describe, expect, it } from 'vitest';
import { createTracker } from '../../facade/index.js';
const number = process.env.SICEPAT_TRACKING_NUMBER, unknown = process.env.SICEPAT_UNKNOWN_NUMBER;
const trawlUrl = process.env.FLARESOLVERR_URL;
describe('SiCepat app guest retrieval', () => {
  it.skipIf(!number || !trawlUrl)('reads whole-bound dated domestic history', async () => {
    const result = await createTracker({ providers: [], trawlUrl, env: {} }).track({ number: number!, carrier: 'sicepat' });
    expect(result.source).toBe('sicepat');
    expect(result.result.events.length).toBeGreaterThan(0);
    expect(result.result.events.every(event => event.local_time && event.description)).toBe(true);
  }, 35_000);
  it.skipIf(!unknown || !trawlUrl)('distinguishes an explicit missing waybill', async () => {
    await expect(createTracker({ providers: [], trawlUrl, env: {} }).track({ number: unknown!, carrier: 'sicepat' }))
      .rejects.toMatchObject({ attempts: [expect.objectContaining({ kind: 'not_found' })] });
  }, 35_000);
});
