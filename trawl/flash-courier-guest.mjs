import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ORIGIN = 'https://www.flashcourier.com.br';
const PROTOCOL = 'flash-courier-guest-v1';
const OUTPUT_LIMIT = 1024 * 1024;
const WORKER = fileURLToPath(new URL('./flash-courier-guest.py', import.meta.url));
const DIAGNOSTICS = new Set(['http', 'budget', 'transport', 'schema', 'unreadable', 'stale_challenge', 'captcha_refused']);

export function flashCourierApi(number) {
  return `${ORIGIN}/api/hawb/${number}/tipo/todos`;
}

export function flashCourierRequest(raw, capture = {}) {
  let url;
  try { url = new URL(raw); } catch { return null; }
  const number = /^\/rastreio\/([A-Z0-9]{1,20})$/.exec(url.pathname)?.[1];
  return url.origin === ORIGIN && !url.username && !url.password && !url.search && !url.hash && number
    && !capture.contentWaitForSelector && !capture.contentWaitForText
    && !capture.sessionContext && capture.solveEmbeddedCaptchas !== false
    && capture.captureResponses?.length === 1 && capture.captureResponses[0] === flashCourierApi(number) ? number : null;
}

function replyProjection(value, number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('worker_reply');
  const kind = value.kind;
  if (['captcha_refused', 'ambiguous', 'unconfirmed'].includes(kind)) return { kind };
  if (kind === 'not_found') {
    if (value.number !== number) throw new Error('worker_identity');
    return { kind, number };
  }
  if (kind === 'empty_history') {
    if (value.number !== number) throw new Error('worker_identity');
    return { kind, number, success: value.success === true };
  }
  if (kind !== 'history' || value.number !== number || typeof value.success !== 'boolean'
    || typeof value.primaryNumber !== 'string' || !/^[A-Z0-9]{1,20}$/.test(value.primaryNumber)
    || value.customerReference !== null && (typeof value.customerReference !== 'string' || !/^[A-Z0-9]{1,20}$/.test(value.customerReference))
    || value.primaryNumber !== number && value.customerReference !== number
    || !Array.isArray(value.events) || !value.events.length || value.events.length > 500) throw new Error('worker_history');
  const events = value.events.map(row => {
    if (!row || typeof row !== 'object' || typeof row.status !== 'string' || !row.status.trim() || row.status.length > 500
      || typeof row.clock !== 'string' || !row.clock.trim() || row.clock.length > 80) throw new Error('worker_event');
    return { status: row.status, clock: row.clock };
  });
  if (value.summary !== null && (typeof value.summary !== 'string' || value.summary.length > 100)) throw new Error('worker_summary');
  return { kind, success: value.success, number, primaryNumber: value.primaryNumber,
    customerReference: value.customerReference, summary: value.summary, events };
}

export function flashCourierResult(value, { number, url, tier, durationMs }) {
  if (!value || value.protocol !== PROTOCOL || value.requestedNumber !== number
    || !Number.isInteger(value.pageStatus) || value.pageStatus < 0 || value.pageStatus > 599
    || !Array.isArray(value.captures) || value.captures.length > 2) throw new Error('worker_contract');
  let diagnostic = null;
  if (value.diagnostic !== null) {
    const d = value.diagnostic;
    if (!d || !DIAGNOSTICS.has(d.kind)) throw new Error('worker_diagnostic');
    diagnostic = { kind: d.kind };
    if (d.kind === 'http') {
      if (!Number.isInteger(d.status) || d.status < 100 || d.status > 599) throw new Error('worker_http');
      diagnostic.status = d.status;
      diagnostic.retryAfter = typeof d.retryAfter === 'string' && /^\d{1,6}$/.test(d.retryAfter) ? d.retryAfter : null;
    }
  }
  const captures = value.captures.map(row => {
    if (!row || !Number.isInteger(row.status) || row.status < 100 || row.status > 599) throw new Error('worker_capture');
    const headers = { 'content-type': 'application/json' };
    if (typeof row.retryAfter === 'string' && /^\d{1,6}$/.test(row.retryAfter)) headers['retry-after'] = row.retryAfter;
    return { url: flashCourierApi(number), status: row.status, headers,
      body: row.reply === null ? null : JSON.stringify(replyProjection(row.reply, number)),
      trackingNumberSubmitted: number, error: null, truncated: false, base64Encoded: false };
  });
  const counts = value.counts && ['images', 'submits', 'ocr'].every(k => Number.isInteger(value.counts[k]) && value.counts[k] >= 0 && value.counts[k] <= 2)
    ? Object.fromEntries(['images', 'submits', 'ocr'].map(k => [k, value.counts[k]])) : null;
  return { tier, status: 'success', durationMs, effectiveUrl: url, statusCode: value.pageStatus,
    html: JSON.stringify({ protocol: PROTOCOL, requestedNumber: number, phase: ['page', 'generate', 'ocr', 'lookup'].includes(value.phase) ? value.phase : 'page', diagnostic, counts }),
    body: new Uint8Array(), cookies: [], capturedResponses: captures };
}

/** A fresh anonymous HTTP session and a bounded local OCR process; no browser context or account is opened. */
export async function runFlashCourierGuest({ url, capture, tier, maxTimeout, signal, validateTarget,
  spawnWorker = spawn, executable = '/opt/zto-ocr/bin/python' }) {
  const number = flashCourierRequest(url, capture);
  if (!number) return undefined;
  signal?.throwIfAborted();
  const started = Date.now();
  const reserve = Math.min(2000, Math.max(25, Math.floor(maxTimeout / 10)));
  const workMs = Math.floor(maxTimeout - reserve);
  const failure = kind => flashCourierResult({ protocol: PROTOCOL, requestedNumber: number, pageStatus: 0,
    phase: 'page', diagnostic: { kind }, captures: [] }, { number, url, tier, durationMs: Date.now() - started });
  if (!Number.isFinite(maxTimeout) || workMs < 1) return failure('budget');
  if (validateTarget) {
    await validateTarget(url);
    signal?.throwIfAborted();
    await validateTarget(`${ORIGIN}/api/captcha/generate/`);
    signal?.throwIfAborted();
    await validateTarget(flashCourierApi(number));
  }
  signal?.throwIfAborted();
  if (Date.now() - started >= workMs) return failure('budget');
  let child, closed = false, timer, forceTimer, cleanupTimer, expired = false, overflow = false;
  const chunks = [];
  let length = 0;
  let closePromise;
  const stop = () => {
    if (!child || closed) return;
    child.kill('SIGTERM');
    if (!forceTimer) forceTimer = setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, 200);
  };
  const abort = () => stop();
  try {
    child = spawnWorker(executable, [WORKER], { stdio: ['pipe', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', LANG: 'C.UTF-8', OMP_NUM_THREADS: '1' } });
    closePromise = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => { closed = true; resolve(code); });
    });
    child.stdout.on('data', part => {
      length += part.length;
      if (length > OUTPUT_LIMIT) { overflow = true; stop(); } else chunks.push(part);
    });
    // Drain warnings without retaining image, answer or provider data.
    child.stderr.on('data', () => {});
    child.stdin.on('error', () => {});
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) stop();
    timer = setTimeout(() => { expired = true; stop(); }, Math.max(1, workMs - (Date.now() - started)));
    child.stdin.end(JSON.stringify({ number, budgetMs: Math.min(60000, Math.max(1, workMs - (Date.now() - started))) }));
    const code = await closePromise;
    signal?.throwIfAborted();
    if (expired) return failure('budget');
    if (overflow || code !== 0) return failure('transport');
    try {
      return flashCourierResult(JSON.parse(Buffer.concat(chunks).toString('utf8')),
        { number, url, tier, durationMs: Date.now() - started });
    } catch { return failure('schema'); }
  } catch {
    signal?.throwIfAborted();
    return failure(expired ? 'budget' : 'transport');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    if (child && !closed) {
      stop();
      await Promise.race([closePromise?.catch(() => {}), new Promise(resolve => { cleanupTimer = setTimeout(resolve, 300); })]);
      if (!closed) child.kill('SIGKILL');
    }
    clearTimeout(cleanupTimer);
    clearTimeout(forceTimer);
    for (const part of chunks) part.fill(0);
  }
}
