import { describe, expect, it } from 'vitest';
import { ProxyAgent } from 'undici';
import { TForceTracker } from './adapter.js';

describe('TForce Logistics live tracker', () => {
  it.skipIf(!process.env.TFORCE_LOGISTICS_TRACKING_NUMBER || !process.env.TFORCE_LOGISTICS_PROXY_URL)('retrieves the identified package through North American egress', async () => {
    const proxy = new URL(process.env.TFORCE_LOGISTICS_PROXY_URL!);
    const dispatcher = new ProxyAgent({ uri: proxy.origin,
      token: `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}` });
    try {
      const fetcher: typeof fetch = (input, init) => fetch(input, { ...init, dispatcher } as RequestInit);
      const result = await new TForceTracker({ fetcher }).fetch(process.env.TFORCE_LOGISTICS_TRACKING_NUMBER!, { budgetMs: 30_000 });
      expect(result.events?.length).toBeGreaterThan(0);
      expect(result.events?.every((event) => /[+-]\d{2}:\d{2}$/.test(event.time ?? ''))).toBe(true);
    } finally { await dispatcher.close(); }
  }, 40_000);
});
