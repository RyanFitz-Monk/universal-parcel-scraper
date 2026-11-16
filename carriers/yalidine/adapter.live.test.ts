import { describe, expect, it } from 'vitest';
import { TrawlClient } from '../../core/transport/trawl.js';
import { YalidineTracker } from './adapter.js';

const ready = Boolean(process.env.YALIDINE_TRACKING_NUMBER);
describe('Yalidine native retrieval', () => {
  it.skipIf(!ready)('reads full dated guest history without browser or account', async () => {
    const tracker = new YalidineTracker();
    const first = await tracker.fetch(process.env.YALIDINE_TRACKING_NUMBER!);
    expect(first.events!.length).toBeGreaterThan(0);
    expect(first.events!.every(event => event.description && event.local_time && !event.time)).toBe(true);
    expect(first.last_update).toBeNull();
  }, 180_000);

  it.skipIf(!process.env.FLARESOLVERR_URL || !process.env.YALIDINE_UNKNOWN_NUMBER)('reads a verified missing-parcel notice', async () => {
    await expect(new YalidineTracker({ trawl: TrawlClient.fromEnvironment() })
      .fetch(process.env.YALIDINE_UNKNOWN_NUMBER!)).rejects.toMatchObject({ kind: 'not_found' });
  }, 90_000);
});
