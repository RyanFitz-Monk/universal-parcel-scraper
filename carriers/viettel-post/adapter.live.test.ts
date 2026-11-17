import { describe, expect, it } from 'vitest';
import { ViettelPostTracker } from './adapter.js';
import { TrawlClient } from '../../core/transport/trawl.js';
import { fetchViettelPostHistory } from './browser.js';

const number = process.env.VIETTEL_POST_TRACKING_NUMBER;
const unknown = process.env.VIETTEL_POST_UNKNOWN_NUMBER;
describe('Viettel Post live legacy record', () => {
  it.skipIf(!number)('returns a bound partial record after local OCR', async () => {
    const tracker = new ViettelPostTracker();
    try { const result = await tracker.fetch(number!); expect(result.summary_only).toBe(true); expect(result.last_status_text).toEqual(expect.any(String)); }
    finally { await tracker.close(); }
  }, 40_000);
  it.skipIf(!unknown)('reports a valid empty lookup after verification as unknown', async () => {
    const tracker = new ViettelPostTracker();
    try { await expect(tracker.fetch(unknown!)).rejects.toMatchObject({ kind: 'not_found' }); }
    finally { await tracker.close(); }
  }, 40_000);
});

describe('Viettel Post current guest history', () => {
  it.skipIf(!number || !process.env.FLARESOLVERR_URL)('reads full dated history through native verification', async () => {
    const tracker = new ViettelPostTracker({ trawl: TrawlClient.fromEnvironment(),
      browserProxy: process.env.VIETTEL_POST_BROWSER_PROXY_URL });
    try {
      const result = await tracker.fetch(number!);
      expect(result.summary_only).not.toBe(true); expect(result.events!.length).toBeGreaterThan(1);
      expect(result.events!.every(event => event.local_time && !event.time)).toBe(true);
    } finally { await tracker.close(); }
  }, 110_000);

  it.skipIf(!unknown || !process.env.FLARESOLVERR_URL)('keeps a hidden query echo inconclusive', async () => {
    await expect(fetchViettelPostHistory(unknown!, { trawl: TrawlClient.fromEnvironment()!,
      proxy: process.env.VIETTEL_POST_BROWSER_PROXY_URL, signal: AbortSignal.timeout(95000),
      remainingMs: 95000, legacyReserveMs: 20000 })).rejects.toMatchObject({ kind: 'indeterminate' });
  }, 110_000);
});
