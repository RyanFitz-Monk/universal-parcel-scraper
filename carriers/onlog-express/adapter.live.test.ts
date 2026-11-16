import { describe, expect, it } from 'vitest';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { TrawlClient } from '../../core/transport/trawl.js';
import { adapter } from './adapter.js';

const number = process.env.ONLOG_EXPRESS_TRACKING_NUMBER, unknown = process.env.ONLOG_EXPRESS_UNKNOWN_NUMBER;
const url = process.env.FLARESOLVERR_URL;
const tracker = () => adapter({ env: {}, browserExecutablePath: null, recorder: NOOP_RECORDER, trawl: url ? new TrawlClient(url) : null });
describe('Onlog Express live guest retrieval', () => {
  it.skipIf(!number || !url)('reads whole-bound dated history', async () => {
    const result = await tracker().track({ number: number! });
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.description && event.local_time)).toBe(true);
    expect(result.events!.every(event => !event.time)).toBe(true);
  }, 70000);
  it.skipIf(!unknown || !url)('recognizes the explicit guest absence reply', async () => {
    await expect(tracker().track({ number: unknown! })).rejects.toMatchObject({ kind: 'not_found' });
  }, 70000);
});
