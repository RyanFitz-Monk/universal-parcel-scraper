import { describe, expect, it } from 'vitest';
import { createTracker } from '../../facade/index.js';

const positive = process.env.VEHO_TRACKING_NUMBER;
const unknown = process.env.VEHO_UNKNOWN_NUMBER;
const { FLARESOLVERR_URL: trawlUrl, VEHO_BROWSER_WS_ENDPOINT, VEHO_FALLBACK_PROXY_URL } = process.env;
const service = trawlUrl || VEHO_BROWSER_WS_ENDPOINT;
const tracker = () => createTracker({ providers: [], trawlUrl, env: { VEHO_BROWSER_WS_ENDPOINT, VEHO_FALLBACK_PROXY_URL } });

describe('Veho live guest retrieval', () => {
  it.skipIf(!positive || !service)('reads a package after a browser obtains the attestation', async () => {
    const answer = await tracker().track({ number: positive!, carrier: 'veho' }, { budgetMs: 55_000 });
    expect(answer).toMatchObject({ carrier: 'veho', source: 'veho' });
    expect(answer.result.events.length).toBeGreaterThan(0);
    expect(answer.result.events.every(event => event.time && event.provider_code && event.description)).toBe(true);
  }, 70_000);
  it.skipIf(!unknown || !service)('reports an unknown number as not found', async () => {
    await expect(tracker().track({ number: unknown!, carrier: 'veho' }, { budgetMs: 55_000 })).rejects.toMatchObject({ kind: 'not_found' });
  }, 70_000);
});
