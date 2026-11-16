import { describe, expect, it } from 'vitest';
import { createTracker } from '../../facade/index.js';
import { CorreosBoliviaTracker } from './adapter.js';
describe('Correos de Bolivia official mobile guest API', () => {
  it.skipIf(!process.env.CORREOS_BOLIVIA_TRACKING_NUMBER)('returns native whole-bound dated history with providers disabled', async () => {
    const answer = await createTracker({ providers: [] }).track({ number: process.env.CORREOS_BOLIVIA_TRACKING_NUMBER!, carrier: 'correos-bolivia' });
    expect(answer).toMatchObject({ carrier: 'correos-bolivia', source: 'correos-bolivia' });
    expect(answer.result.events.length).toBeGreaterThan(0);
    expect(answer.result.events.every(e => e.local_time && e.description && !e.time)).toBe(true);
  }, 30_000);
  it.skipIf(!process.env.CORREOS_BOLIVIA_UNKNOWN_NUMBER)('preserves native explicit absence', async () => {
    await expect(new CorreosBoliviaTracker().fetch(process.env.CORREOS_BOLIVIA_UNKNOWN_NUMBER!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 30_000);
});
