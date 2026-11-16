import { describe, expect, it } from 'vitest';
import { ProxyAgent } from 'undici';
import { CustomCompaniesTracker } from './adapter.js';

describe('The Custom Companies live details page', () => {
  it.skipIf(!process.env.CUSTOM_COMPANIES_TRACKING_NUMBER || !process.env.CUSTOM_COMPANIES_PROXY_URL)('retrieves the identified shipment through US egress', async () => {
    const proxy = new URL(process.env.CUSTOM_COMPANIES_PROXY_URL!);
    const dispatcher = new ProxyAgent({ uri: proxy.origin,
      token: `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}` });
    try {
      const fetcher: typeof fetch = (input, init) => fetch(input, { ...init, dispatcher } as RequestInit);
      const result = await new CustomCompaniesTracker({ fetcher }).fetch(process.env.CUSTOM_COMPANIES_TRACKING_NUMBER!, { budgetMs: 30_000 });
      expect(result.events?.length).toBeGreaterThan(0);
      expect(result.current_stage).toBeDefined();
    } finally { await dispatcher.close(); }
  }, 40_000);
});
