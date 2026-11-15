import { describe, expect, it } from 'vitest';
import { TrawlClient } from './trawl.js';
import { trawlPageStep } from './trawlPage.js';

const PAGE = 'https://carrier.test/track?number=EXAMPLE';

function step(reply: () => Response) {
  return trawlPageStep({ trawl: new TrawlClient('http://browser.test', async () => reply()),
    provider: 'Example', url: PAGE, maxBytes: 100_000, parse: html => html });
}

function gaveUp(reason: string, error = 'Max tier reached without success'): Response {
  return Response.json({ error, timings: [{ tier: 3, status: 'error', reason }] }, { status: 500 });
}

describe('trawlPageStep', () => {
  it('fails a read TRAWL gave up for lack of time as the budget running out, and its other failures as before', async () => {
    for (const [reply, kind] of [
      [() => gaveUp('Scrape deadline exceeded', 'Scrape deadline exceeded'), 'budget'],
      [() => gaveUp('evaluate: Example lookup budget exhausted'), 'budget'],
      [() => gaveUp('evaluate: The operation was aborted. '), 'budget'],
      [() => gaveUp('proxy-connection-failed'), 'indeterminate'],
    ] as const) {
      const error: unknown = await step(reply).run({ signal: AbortSignal.timeout(60_000), remainingMs: 20_000, attempt: 1 } as never)
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({ kind });
      if (kind === 'budget') expect((error as Error).cause).toMatchObject({ status: 500 });
      else expect(error).toMatchObject({ status: 500 });
    }
  });

  it('reads the page the browser returned', async () => {
    const reply = () => Response.json({ tier: 3, statusCode: 200, url: PAGE, html: '<p>scan</p>' });
    await expect(step(reply).run({ signal: AbortSignal.timeout(60_000), remainingMs: 20_000, attempt: 1 } as never))
      .resolves.toBe('<p>scan</p>');
  });
});
