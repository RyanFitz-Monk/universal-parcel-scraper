import { describe, expect, it } from 'vitest';
import { FtdNzTracker } from './adapter.js';
const number = process.env.FTD_NZ_TRACKING_NUMBER, unknown = process.env.FTD_NZ_UNKNOWN_NUMBER;
describe('FTD New Zealand live guest history', () => {
  it.skipIf(!number)('reads whole-bound forwarder scans and the named reference', async () => {
    const result = await new FtdNzTracker().fetch(number!);
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ delivery_carrier: 'zto', history_truncated: true });
    expect(result.events!.every(event => event.local_time && !event.time)).toBe(true);
  });
  it.skipIf(!unknown)('keeps the unbound empty form inconclusive', async () => {
    await expect(new FtdNzTracker().fetch(unknown!)).rejects.toMatchObject({ kind: 'indeterminate' });
  });
});
