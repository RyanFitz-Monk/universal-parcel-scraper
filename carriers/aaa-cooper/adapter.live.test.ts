import { describe, expect, it } from 'vitest';
import { ProxyAgent } from 'undici';
import { AaaCooperTracker } from './adapter.js';

describe('AAA Cooper live tracking', () => {
  it.skipIf(!process.env.AAA_COOPER_TRACKING_NUMBER || !process.env.AAA_COOPER_PROXY_URL)('retrieves the identified shipment through US egress', async () => {
    const proxy = new URL(process.env.AAA_COOPER_PROXY_URL!);
    const dispatcher = new ProxyAgent({ uri: proxy.origin,
      token: `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}` });
    try {
      const fetcher: typeof fetch = (input, init) => fetch(input, { ...init, dispatcher } as RequestInit);
      const result = await new AaaCooperTracker({ fetcher }).fetch(process.env.AAA_COOPER_TRACKING_NUMBER!, { budgetMs: 30_000 });
      expect(result.events?.length).toBeGreaterThan(0);
      expect(result.events?.every(event => event.local_time && event.description && !event.time)).toBe(true);
      expect(result.current_stage).toBeDefined();
      expect(result).not.toHaveProperty('signed_by');
    } finally { await dispatcher.close(); }
  }, 40_000);
});
