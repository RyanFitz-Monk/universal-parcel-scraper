import { describe, expect, it } from 'vitest';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { adapter } from './adapter.js';

const number = process.env.WHATSSHIP_TRACKING_NUMBER;
const unknown = process.env.WHATSSHIP_UNKNOWN_NUMBER;
describe('WhatsShip guest retrieval', () => {
  it.skipIf(!number)('returns dated history with universal providers disabled', async () => {
    const reply = await createTracker({ providers: [] }).track({ carrier: 'whatsship', number: number! });
    expect(reply.source).toBe('whatsship');
    expect(reply.result.events.length).toBeGreaterThan(0);
    expect(reply.result.events.every(event => event.description && (event.time || event.local_time))).toBe(true);
  }, 20_000);
  it.skipIf(!unknown)('distinguishes a definite missing reference', async () => {
    const direct = adapter({ recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });
    await expect(direct.track({ number: unknown! })).rejects.toMatchObject({ kind: 'not_found' });
  }, 20_000);
});
