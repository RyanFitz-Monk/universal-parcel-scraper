import { describe, expect, it } from 'vitest';
import { NOOP_RECORDER } from '../../core/telemetry/index.js';
import { createTracker } from '../../facade/index.js';
import { adapter } from './adapter.js';

const postcode = process.env.GLS_NL_POSTCODE;
const direct = () => adapter({ recorder: NOOP_RECORDER, env: {}, trawl: null, browserExecutablePath: null });

describe('GLS Netherlands live retrieval', () => {
  it.skipIf(!process.env.GLS_NL_TRACKING_NUMBER || !postcode)('retrieves the history of the requested parcel with providers disabled', async () => {
    const answer = await createTracker({ providers: [] }).track({ number: process.env.GLS_NL_TRACKING_NUMBER!, carrier: 'gls-nl', postcode });
    expect(answer).toMatchObject({ carrier: 'gls-nl', source: 'gls-nl' });
    expect(answer.attempts[0]).toMatchObject({ source: 'gls-nl', kind: 'ok' });
    expect(answer.result.events.length).toBeGreaterThan(0);
    // Every scan keeps GLS's clock, read in the Netherlands.
    expect(answer.result.events.every((event) => event.description && event.time
      && event.time_zone === 'Europe/Amsterdam' && event.time_zone_basis === 'carrier'
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(String(event.local_time)))).toBe(true);
  }, 30_000);

  it.skipIf(!process.env.GLS_NL_UNKNOWN_NUMBER || !postcode)('reads an unknown number as inconclusive, as a wrong postcode is', async () => {
    await expect(direct().track({ number: process.env.GLS_NL_UNKNOWN_NUMBER!, postcode }))
      .rejects.toMatchObject({ kind: 'indeterminate', reason: 'portal_not_found' });
  }, 30_000);
});
