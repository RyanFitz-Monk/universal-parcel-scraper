import { describe, expect, it } from 'vitest';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { adapter } from './adapter.js';

const number = process.env.LHTEX_TRACKING_NUMBER;
const unknown = process.env.LHTEX_UNKNOWN_NUMBER;
const direct = () => adapter({ recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });

describe('LHT Express live guest retrieval', () => {
  it.skipIf(!number)('reads whole-bound dated history', async () => {
    const result = await direct().track({ number: number! });
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.description && event.local_time && !event.time)).toBe(true);
  });
  it.skipIf(!unknown)('keeps an empty successful reply inconclusive', async () => {
    await expect(direct().track({ number: unknown! })).rejects.toMatchObject({ kind: 'indeterminate' });
  });
});
