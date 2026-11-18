import { describe, expect, it } from 'vitest';
import { TrawlClient } from '../../core/transport/index.js';
import { JumppointInternationalTracker } from './adapter.js';
const trawl = TrawlClient.fromEnvironment(), number = process.env.JUMPPOINT_INTERNATIONAL_TRACKING_NUMBER,
  unknown = process.env.JUMPPOINT_INTERNATIONAL_UNKNOWN_NUMBER;
describe('Jumppoint International guest browser', () => {
  it.skipIf(!trawl || !number)('returns dated history for the whole identifier', async () => {
    const result = await new JumppointInternationalTracker({ trawl }).fetch(number!);
    expect(result.events?.length).toBeGreaterThan(0); expect(result.events!.every(event => event.time || event.local_time)).toBe(true);
  }, 50_000);
  it.skipIf(!trawl || !unknown)('keeps an empty synthetic echo inconclusive', async () => {
    await expect(new JumppointInternationalTracker({ trawl }).fetch(unknown!)).rejects.toMatchObject({ kind: 'indeterminate' });
  }, 50_000);
});
