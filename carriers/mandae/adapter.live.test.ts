import { describe, expect, it } from 'vitest';
import { MandaeTracker } from './adapter.js';
import { TrawlClient } from '../../core/transport/index.js';

const trawl = TrawlClient.fromEnvironment();
const number = process.env.MANDAE_TRACKING_NUMBER;

describe('Mandaê live public tracking', () => {
  it.skipIf(!trawl || !number)('returns the code\'s scans with their offsets through the browser service', async () => {
    const result = await new MandaeTracker({ trawl }).fetch(number!, { budgetMs: 60_000 });
    expect(result.events?.length).toBeGreaterThan(0);
    expect(result.events!.every((event) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(event.time!) && event.description)).toBe(true);
    expect(result.last_update).toBe(result.events![0]!.time);
    expect(result.last_status_text).toEqual(expect.any(String));
  }, 70_000);
});
