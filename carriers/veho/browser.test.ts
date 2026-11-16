import { afterEach, describe, expect, it, vi } from 'vitest';
import { remoteChromeUserAgent, withRemoteBrowser } from '../../core/transport/localBrowser.js';
import { attestInBrowser } from './browser.js';
import { PAGE } from './parser.js';

vi.mock('../../core/transport/localBrowser.js', () => ({ withRemoteBrowser: vi.fn(), remoteChromeUserAgent: vi.fn() }));
const EXCHANGE = 'https://content-firebaseappcheck.googleapis.com/v1/projects/veho-consumer-mobile/apps/1:2:web:3:exchangeRecaptchaEnterpriseToken';
const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const BODY = JSON.stringify({ token: 'synthetic', ttl: '3600s' });

type Matcher = (response: unknown) => boolean;
const answer = (status = 200, body = BODY, headers: Record<string, string> = {}) => ({ status: () => status, headers: () => headers,
  body: vi.fn(async () => Buffer.from(body)) });

function harness({ navigation = 200, exchange = answer() }: { navigation?: number; exchange?: ReturnType<typeof answer> | null } = {}) {
  let matcher: Matcher | undefined;
  const page = {
    waitForResponse: vi.fn(async (match: Matcher) => { matcher = match; if (!exchange) throw new Error('Timeout'); return exchange; }),
    goto: vi.fn(async () => ({ status: () => navigation })),
  };
  const newContext = vi.fn(async () => ({ newPage: async () => page }));
  const signal = new AbortController().signal;
  vi.mocked(remoteChromeUserAgent).mockResolvedValue(USER_AGENT);
  vi.mocked(withRemoteBrowser).mockImplementation(async (_options, run) => run({ browser: { newContext } as never, signal, remainingMs: () => 8000 }));
  return { page, newContext, matches: (url: string, method = 'POST') => matcher!({ url: () => url, request: () => ({ method: () => method }) }),
    run: () => attestInBrowser('ws://browser.test/synthetic', signal, 9000) };
}

afterEach(() => { vi.clearAllMocks(); });

describe('Veho private browser attestation', () => {
  it('opens the page as Chrome, given no number, and reads the exchange it observed before navigating', async () => {
    const h = harness();
    await expect(h.run()).resolves.toEqual({ status: 200, body: BODY, truncated: false });
    expect(withRemoteBrowser).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'ws://browser.test/synthetic', timeoutMs: 9000 }), expect.any(Function));
    expect(h.newContext).toHaveBeenCalledWith(expect.objectContaining({ userAgent: USER_AGENT, serviceWorkers: 'block' }));
    expect(h.page.goto).toHaveBeenCalledWith(PAGE, { waitUntil: 'domcontentloaded', timeout: 7500 });
    expect(h.page.waitForResponse.mock.invocationCallOrder[0]).toBeLessThan(h.page.goto.mock.invocationCallOrder[0]!);
    expect(h.matches(EXCHANGE)).toBe(true);
    for (const [url, method] of [[EXCHANGE, 'GET'], [EXCHANGE.replace('content-', ''), 'POST'], [EXCHANGE.replace('veho-consumer-mobile', 'other'), 'POST'],
      [EXCHANGE.replace('https://', 'https://user@'), 'POST'], [`${EXCHANGE}/more`, 'POST'], ['not a url', 'POST']] as const) {
      expect(h.matches(url, method)).toBe(false);
    }
  });

  it('keeps a refused exchange\'s status and an oversized answer apart from a token', async () => {
    const refused = harness({ exchange: answer(403) });
    await expect(refused.run()).resolves.toEqual({ status: 403, body: null, truncated: false });
    await expect(harness({ exchange: answer(200, 'x'.repeat(16_385)) }).run()).resolves.toMatchObject({ body: null, truncated: true });
    const announced = harness({ exchange: answer(200, BODY, { 'content-length': '20000' }) });
    await expect(announced.run()).resolves.toMatchObject({ truncated: true });
  });

  it('reports a refused page or a page without an exchange as a challenge, and other pages by status', async () => {
    await expect(harness({ navigation: 403 }).run()).rejects.toMatchObject({ kind: 'challenge' });
    await expect(harness({ exchange: null }).run()).rejects.toMatchObject({ kind: 'challenge' });
    await expect(harness({ navigation: 502 }).run()).rejects.toMatchObject({ status: 502 });
  });
});
