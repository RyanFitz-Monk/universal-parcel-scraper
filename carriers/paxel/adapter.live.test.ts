import { describe, expect, it } from 'vitest';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { TrawlClient } from '../../core/transport/index.js';
import { PaxelTracker } from './adapter.js';

const trawl = TrawlClient.fromEnvironment();
const environment = { trawl, browserExecutablePath: null, recorder: NOOP_RECORDER, env: {} };
const number = process.env.PAXEL_TRACKING_NUMBER;
const unknown = process.env.PAXEL_UNKNOWN_NUMBER;

describe('Paxel guest form', () => {
  it.skipIf(!trawl || !number)('reads the whole AWB history while preserving yearless clocks', async () => {
    const result = await new PaxelTracker(environment).fetch(number!, { budgetMs: 55_000 });
    expect(result.events?.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.provider_time_text && event.description && !event.time && !event.local_time)).toBe(true);
    expect(result.history_truncated).toBe(true);
    expect(result.expected_delivery).toBeNull();
  }, 60_000);

  it.skipIf(!trawl || !unknown)('keeps the native invalid-AWB notice inconclusive', async () => {
    await expect(new PaxelTracker(environment).fetch(unknown!, { budgetMs: 55_000 }))
      .rejects.toMatchObject({ kind: 'indeterminate', reason: 'invalid_awb' });
  }, 60_000);
});
