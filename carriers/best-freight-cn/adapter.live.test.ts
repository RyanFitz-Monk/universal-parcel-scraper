import { describe, expect, it } from 'vitest';
import { BestFreightCnTracker } from './adapter.js';
const number = process.env.BEST_FREIGHT_CN_TRACKING_NUMBER, unknown = process.env.BEST_FREIGHT_CN_UNKNOWN_NUMBER;
describe('BEST Freight China live guest history', () => {
  it.skipIf(!number)('reads whole-bound dated freight history', async () => {
    const tracker = new BestFreightCnTracker();
    try { const result = await tracker.fetch(number!); expect(result.events!.length).toBeGreaterThan(0); expect(result.events!.every(e => e.local_time && !e.time)).toBe(true); } finally { await tracker.close(); }
  });
  it.skipIf(!unknown)('preserves the native absence contract after verification', async () => {
    const tracker = new BestFreightCnTracker();
    try { await expect(tracker.fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' }); } finally { await tracker.close(); }
  });
});
