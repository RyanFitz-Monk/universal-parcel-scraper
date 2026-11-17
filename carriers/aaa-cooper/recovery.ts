import { load } from 'cheerio';
import { setTimeout as delay } from 'node:timers/promises';
import { BudgetExceededError, ChallengeError, IndeterminateError, SchemaError, TransportError, UpstreamHttpError, UpstreamNetworkError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { decodeText, fetchBounded } from '../../core/transport/boundedFetch.js';
import { aaaCooperChallengeState } from './challenge.js';
import { aaaCooperForm, aaaCooperPost, aaaCooperScriptState, type AaaCooperForm } from './form.js';
import { AaaCooperOcr } from './ocr.js';
import { AAA_COOPER_MAX_BYTES, parseAaaCooper, PROVIDER } from './parser.js';

export interface AaaCooperPage { html: string; receivedAt: number }
const REDIRECTS = [301, 302, 303, 307, 308], GONE = [404, 410];
const CLEANUP_MS = 500, MIN_SOLVE_MS = 1500;
// Telerik supports minimum-time protection; keep the accepted native form's age guard.
const MIN_FORM_AGE_MS = 4000;

export function aaaCooperCanRecover(page: AaaCooperPage): boolean {
  return !!page.html && aaaCooperChallengeState(load(page.html)).recoverable;
}

/** The caller owns this lookup's cookie jar; all responses remain in its current session. */
export async function recoverAaaCooper(options: {
  number: string; url: string; page: AaaCooperPage; fetcher: typeof fetch; userAgent: string; signal: AbortSignal; remainingMs: number;
}): Promise<CarrierResult> {
  const { number, url, page, fetcher, userAgent, signal, remainingMs } = options;
  if (remainingMs <= CLEANUP_MS) throw new BudgetExceededError(PROVIDER, remainingMs);
  const deadline = performance.now() + remainingMs - CLEANUP_MS;
  const operation = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, Math.floor(remainingMs - CLEANUP_MS)))]);
  const left = (needed = 1) => {
    operation.throwIfAborted();
    const ms = Math.floor(deadline - performance.now());
    if (ms < needed) throw new BudgetExceededError(PROVIDER, remainingMs);
    return ms;
  };
  let ocr: AaaCooperOcr | undefined;
  const puzzles = new Set<string>(), scripts = new Map<string, string>();
  const request = async (target: string | URL, init: RequestInit, maxBytes = AAA_COOPER_MAX_BYTES) => {
    const response = await fetchBounded(target, { ...init, signal: operation, headers: {
      Accept: 'text/html,application/xhtml+xml', 'User-Agent': userAgent, ...init.headers,
    } }, { provider: PROVIDER, fetcher, maxBytes, timeoutMs: left(), redirect: 'manual', allowHttpStatuses: [...REDIRECTS, ...GONE] });
    left();
    if (response.response.url && response.response.url !== String(target)) throw new SchemaError(PROVIDER, 'AAA Cooper returned another response URL');
    return response;
  };
  const update = (bytes: Uint8Array) => {
    page.html = decodeText(bytes); page.receivedAt = performance.now();
    if (!page.html.trim()) throw new IndeterminateError(PROVIDER, 'AAA Cooper returned an empty tracking page');
  };
  const read = async () => {
    const response = await request(url, { method: 'GET' });
    if (response.response.status !== 200) throw new TransportError(PROVIDER, 'AAA Cooper tracking page is unavailable');
    update(response.bytes);
  };
  const scriptState = async (form: AaaCooperForm) => {
    if (form.scriptState) return form.scriptState;
    if (!form.scriptUrl) throw new ChallengeError(PROVIDER, 'AAA Cooper script-manager resource is unavailable');
    const key = form.scriptUrl.href, cached = scripts.get(key);
    if (cached) return cached;
    const response = await request(form.scriptUrl, { method: 'GET', headers: { Accept: 'application/javascript', Referer: url } }, 2 * AAA_COOPER_MAX_BYTES);
    if (response.response.status !== 200) throw new TransportError(PROVIDER, 'AAA Cooper script-manager resource is unavailable');
    const state = aaaCooperScriptState(decodeText(response.bytes)); scripts.set(key, state); return state;
  };
  const stillChallenged = (error: unknown) => error instanceof ChallengeError && aaaCooperCanRecover(page);
  const run = async (): Promise<CarrierResult> => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        left(MIN_SOLVE_MS);
        const form = aaaCooperForm(page.html, url);
        if (puzzles.has(form.puzzle)) throw new ChallengeError(PROVIDER, 'AAA Cooper did not issue a fresh text challenge');
        puzzles.add(form.puzzle);
        const state = await scriptState(form);
        left(MIN_SOLVE_MS);
        const image = await request(form.imageUrl, { method: 'GET', headers: { Accept: 'image/jpeg', Referer: url } }, 65536);
        if (image.response.status !== 200 || !/^image\/jpeg(?:;|$)/i.test(image.response.headers.get('content-type') ?? '')) {
          image.bytes.fill(0);
          throw new ChallengeError(PROVIDER, 'AAA Cooper returned an unsupported text challenge');
        }
        let answer = '', posted = false;
        try { left(MIN_SOLVE_MS); ocr ??= new AaaCooperOcr(); answer = await ocr.solve(image.bytes, operation); left(); }
        finally { image.bytes.fill(0); }
        if (/^\d{6}$/.test(answer)) {
          const body = aaaCooperPost(form, answer, state); answer = ''; posted = true;
          let response: Awaited<ReturnType<typeof request>>;
          try {
            const wait = MIN_FORM_AGE_MS - (performance.now() - page.receivedAt);
            if (wait > 0) { left(wait + 1); await delay(wait, undefined, { signal: operation }); }
            response = await request(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: new URL(url).origin, Referer: url } });
          } finally { for (const name of [...body.keys()]) body.delete(name); }
          if (response.response.status === 302 || response.response.status === 303) {
            const location = response.response.headers.get('location');
            let target: URL | undefined;
            try { if (location) target = new URL(location, url); } catch { /* Preserve the identity failure. */ }
            if (!target || target.href !== url) throw new SchemaError(PROVIDER, 'AAA Cooper redirected another tracking query');
            await read();
          } else {
            if (response.response.status !== 200) throw new TransportError(PROVIDER, 'AAA Cooper tracking postback is unavailable');
            update(response.bytes);
          }
          try { return parseAaaCooper(page.html, number); } catch (error) { if (!stillChallenged(error)) throw error; }
        }
        answer = '';
        if (attempt === 1) throw new ChallengeError(PROVIDER, 'AAA Cooper text verification did not finish');
        // Rejected answers may already contain a new puzzle. An abstention needs a fresh page.
        if (!posted || puzzles.has(aaaCooperForm(page.html, url).puzzle)) {
          await read();
          try { return parseAaaCooper(page.html, number); } catch (error) { if (!stillChallenged(error)) throw error; }
        }
      }
      throw new ChallengeError(PROVIDER, 'AAA Cooper text verification did not finish');
    } catch (error) {
      if (operation.aborted) {
        if (signal.aborted && !(signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError')) throw signal.reason;
        throw new BudgetExceededError(PROVIDER, remainingMs, { cause: error });
      }
      // Full forms and per-session tokens are not retained in request diagnostics.
      if (error instanceof UpstreamHttpError) throw new UpstreamHttpError(error.provider, error.status, error.retryAfterMs);
      if (error instanceof UpstreamNetworkError) throw new UpstreamNetworkError(error.provider, error.cause);
      throw error;
    }
  };
  let result: CarrierResult | undefined, failure: unknown, failed = false;
  try { result = await run(); } catch (error) { failure = error; failed = true; }
  finally {
    scripts.clear(); puzzles.clear();
    try { await ocr?.close(); } catch (error) {
      if (!failed) { failure = new TransportError(PROVIDER, 'AAA Cooper OCR cleanup failed', { cause: error }); failed = true; }
    }
  }
  if (failed) throw failure;
  return result!;
}
