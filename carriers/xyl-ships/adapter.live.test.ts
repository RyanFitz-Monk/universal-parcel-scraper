import { describe, expect, it } from 'vitest';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { adapter } from './adapter.js';

const number = process.env.XYL_SHIPS_TRACKING_NUMBER;
const unknown = process.env.XYL_SHIPS_UNKNOWN_NUMBER;
const direct = () => adapter({ recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });

describe('XYL-Ships live tracking', () => {
  it.skipIf(!number)('reads whole-bound dated history', async () => {
    const result = await direct().track({ number: number! });
    expect(result.events!.length).toBeGreaterThan(0);
    expect(result.events!.every(event => event.description && event.time)).toBe(true);
  });
  it.skipIf(!unknown)('reads an unknown number as not found', async () => {
    await expect(direct().track({ number: unknown! })).rejects.toMatchObject({ kind: 'not_found' });
  });
});
