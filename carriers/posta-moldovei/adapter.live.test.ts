import { describe, expect, it } from 'vitest';
import { PostaMoldoveiTracker } from './adapter.js';
import { TrawlClient } from '../../core/transport/index.js';

const trawl = TrawlClient.fromEnvironment();
const number = process.env.POSTA_MOLDOVEI_TRACKING_NUMBER;

describe('Poșta Moldovei live public tracking', () => {
  it.skipIf(!trawl || !number)('returns the item\'s scans on wall clocks through the browser service', async () => {
    const result = await new PostaMoldoveiTracker({ trawl }).fetch(number!, { budgetMs: 60_000 });
    expect(result.events?.length).toBeGreaterThan(0);
    expect(result.events!.every((event) => !event.time && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(event.local_time!)
      && event.description)).toBe(true);
    expect(result.last_update_local).toBe(result.events![0]!.local_time);
    expect(result.last_status_text).toEqual(expect.any(String));
  }, 70_000);
});
