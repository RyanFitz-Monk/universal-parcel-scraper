import { describe, expect, it } from 'vitest';
import { DtdcTracker } from './adapter.js';

describe('DTDC live compatibility', () => {
  it.skipIf(!process.env.DTDC_TRACKING_NUMBER)('returns identity-bound dated history without session state', async () => {
    const tracker = new DtdcTracker();
    const result = await tracker.fetch(process.env.DTDC_TRACKING_NUMBER!).finally(() => tracker.close());
    expect(result.events?.length).toBeGreaterThan(0);
    expect(result.last_status_text).toEqual(expect.any(String));
    expect(result.last_update).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.events?.every(event => event.description && event.time && /(?:Z|[+-]\d{2}:\d{2})$/.test(event.time))).toBe(true);
  });
});
