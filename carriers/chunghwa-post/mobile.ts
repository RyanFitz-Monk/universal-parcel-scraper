import { randomUUID } from 'node:crypto';
import makeFetchCookie from 'fetch-cookie';
import { CookieJar } from 'tough-cookie';
import { BudgetExceededError, ChallengeError, IndeterminateError, SchemaError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { decodeText, fetchBounded } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { parseChunghwaPostMobile, PROVIDER } from './parser.js';

const BASE = 'https://postserv.post.gov.tw/pstmail/';

/** Guest branch of tw.gov.post.mpost's international lookup; never supplies an account token. */
export async function fetchChunghwaPostMobile(number: string, options: {
  fetcher: typeof fetch; signal: AbortSignal; budgetMs: number; userAgent: string;
}): Promise<CarrierResult> {
  const deadline = performance.now() + options.budgetMs;
  const jar = new CookieJar();
  const fetcher = makeFetchCookie(options.fetcher, jar);
  const request = async (path: string, body?: unknown, form = false) => {
    options.signal.throwIfAborted();
    const remaining = Math.floor(deadline - performance.now());
    if (remaining <= 0) throw new BudgetExceededError(PROVIDER, options.budgetMs);
    const { response, bytes } = await fetchBounded(BASE + path, {
      signal: options.signal, method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json;charset=UTF-8',
        'User-Agent': options.userAgent, Referer: BASE + 'webview' },
      ...(body === undefined ? {} : { body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) }),
    }, { provider: PROVIDER, timeoutMs: remaining, maxBytes: 1_000_000, fetcher, redirect: form ? 'manual' : 'error',
      allowHttpStatuses: form ? [302, 303, 404, 410] : [404, 410] });
    if (response.status !== 200 && !(form && [302, 303].includes(response.status))) throw new IndeterminateError(PROVIDER, 'Chunghwa Post did not answer the mobile query');
    return { response, text: decodeText(bytes) };
  };
  const dispatch = async (operation: string, body: Record<string, unknown>) => {
    const { text } = await request('EsoafDispatcher', {
      header: { InputVOClass: 'com.systex.jbranch.app.server.post.vo.EB500200InputVO', TxnCode: 'EB500200',
        BizCode: operation, StampTime: true, SupvPwd: '', TXN_DATA: {}, SupvID: '', CustID: '', REQUEST_ID: '',
        ClientTransaction: true, DevMode: false, SectionID: 'esoaf' }, body,
    });
    if (/^\s*</.test(text)) throw new ChallengeError(PROVIDER, 'Chunghwa Post returned a verification page');
    try { return JSON.parse(text) as unknown; }
    catch { throw new SchemaError(PROVIDER, 'Chunghwa Post returned unreadable mobile tracking JSON'); }
  };
  try {
    const opened = await request('webview', new URLSearchParams({ Type: '2', MailNo1: number }), true);
    if ([302, 303].includes(opened.response.status)) {
      const location = opened.response.headers.get('location');
      let target: URL | null = null;
      try { target = location ? new URL(location, BASE) : null; } catch { /* Refuse malformed redirects below. */ }
      if (!target || target.origin !== new URL(BASE).origin || target.pathname !== '/pstmail/main_mail.html'
        || target.search !== '?targetTxn=EB500250') {
        throw new IndeterminateError(PROVIDER, 'Chunghwa Post changed the mobile entry');
      }
      await request('main_mail.html?targetTxn=EB500250');
    }
    await request('SessionServlet');
    const init = await dispatch('initDataFromWebview', {});
    const screens = Array.isArray(init) ? init.filter(row => isRecord(row) && isRecord(row.header)
      && row.header.OutputType === 'Screen' && isRecord(row.body)) : [];
    const screen: unknown = screens.length === 1 ? screens[0] : undefined;
    const host: unknown = isRecord(screen) && isRecord(screen.body) ? screen.body.host_rs : undefined;
    if (!isRecord(host) || typeof host.MAILNO1 !== 'string' || host.MAILNO1.trim().toUpperCase() !== number) {
      throw new IndeterminateError(PROVIDER, 'Chunghwa Post did not retain the requested mobile item');
    }
    return parseChunghwaPostMobile(await dispatch('queryFromWebview', {
      MAILNO: number, uuid: randomUUID(), captcha: '', pageCount: 10,
    }), number);
  } finally {
    await jar.removeAllCookies();
  }
}
