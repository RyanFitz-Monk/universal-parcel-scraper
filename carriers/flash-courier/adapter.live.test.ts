import { describe, expect, it } from 'vitest';
import { TrawlClient } from '../../core/transport/index.js';
import { FlashCourierTracker } from './adapter.js';
const trawl = TrawlClient.fromEnvironment(), number = process.env.FLASH_COURIER_TRACKING_NUMBER, unknown = process.env.FLASH_COURIER_UNKNOWN_NUMBER;
describe('Flash Courier guest OCR', () => {
  it.skipIf(!trawl || !number)('returns whole-bound dated history', async () => {
    const r = await new FlashCourierTracker({ trawl }).fetch(number!);
    expect(r.events?.length).toBeGreaterThan(0); expect(r.events!.every(e => e.local_time)).toBe(true);
  }, 60_000);
  it.skipIf(!trawl || !unknown)('preserves explicit scoped absence', async () => {
    await expect(new FlashCourierTracker({ trawl }).fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 60_000);
});
