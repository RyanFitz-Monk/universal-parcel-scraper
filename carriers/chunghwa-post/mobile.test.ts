import { describe, expect, it, vi } from 'vitest';
import { ChunghwaPostTracker } from './adapter.js';
import { parseChunghwaPost, parseChunghwaPostMobile } from './parser.js';

const NUMBER = 'EE000000005TW';
const end = { header: { OutputType: 'EndBracket' }, body: { result: 'success' } };
const init = (number = NUMBER) => [{ header: { OutputType: 'Screen' }, body: { host_rs: { MAILNO1: number } } }, end];
const history = () => [{ header: { OutputType: 'Screen' }, body: { cptCheck: false, incorrectList: [], iType: 1,
  host_rs: { Status: 'S', MAILNO: NUMBER, ITEM: [{ EVCODE: 'A', STATUS: '交寄郵件', DATIME: '20260101090000',
    BRHNAT: '郵局', BRHNO: '000003', RCVMAN: 'PRIVATE' }] } } }, end];
const opened = (cookie: string) => {
  const response = new Response('<html>mobile</html>', { headers: { 'Set-Cookie': `JSESSIONID=${cookie}; Path=/pstmail` } });
  Object.defineProperty(response, 'url', { value: 'https://postserv.post.gov.tw/pstmail/webview' });
  return response;
};
const mockFlow = (payload: unknown = history()) => vi.fn<typeof fetch>()
  .mockResolvedValueOnce(opened('guest'))
  .mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(Response.json(init())).mockResolvedValueOnce(Response.json(payload));

describe('Chunghwa Post mobile guest protocol', () => {
  it('binds the bootstrap and returned item without relaxing the web CAPTCHA parser', async () => {
    const fetcher = mockFlow(); const solveCaptcha = vi.fn();
    const result = await new ChunghwaPostTracker({ fetcher, solveCaptcha }).fetch(NUMBER);
    expect(result.events).toHaveLength(1);
    expect(result.events![0]).toMatchObject({ time: '2026-01-01T01:00:00Z', stage: 'accepted' });
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    expect(solveCaptcha).not.toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(4);
    expect(new URLSearchParams(String(fetcher.mock.calls[0]![1]?.body)).get('MailNo1')).toBe(NUMBER);
    const request = fetcher.mock.calls[3]![1]!;
    expect(new Headers(request.headers).get('Cookie')).toContain('JSESSIONID=guest');
    expect(JSON.parse(String(request.body))).toMatchObject({ header: { BizCode: 'queryFromWebview' }, body: { MAILNO: NUMBER, captcha: '' } });
    expect(() => parseChunghwaPost(history(), NUMBER)).toThrow(expect.objectContaining({ kind: 'challenge' }));
  });

  it('follows only the official mobile bootstrap redirect, keeping its cookie', async () => {
    const redirected = new Response('', { status: 302, headers: {
      Location: 'main_mail.html?targetTxn=EB500250', 'Set-Cookie': 'JSESSIONID=redirected; Path=/pstmail',
    } });
    Object.defineProperty(redirected, 'url', { value: 'https://postserv.post.gov.tw/pstmail/webview' });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(redirected)
      .mockResolvedValueOnce(new Response('<html>mobile</html>')).mockResolvedValueOnce(new Response(''))
      .mockResolvedValueOnce(Response.json(init())).mockResolvedValueOnce(Response.json(history()));
    const solveCaptcha = vi.fn();
    await expect(new ChunghwaPostTracker({ fetcher, solveCaptcha }).fetch(NUMBER)).resolves.toMatchObject({ current_stage: 'accepted' });
    expect(fetcher.mock.calls[0]![1]?.redirect).toBe('manual');
    expect(String(fetcher.mock.calls[1]![0])).toBe('https://postserv.post.gov.tw/pstmail/main_mail.html?targetTxn=EB500250');
    expect(new Headers(fetcher.mock.calls[1]![1]?.headers).get('Cookie')).toContain('JSESSIONID=redirected');
    expect(solveCaptcha).not.toHaveBeenCalled();
  });

  it('never follows another origin or transaction from a bootstrap redirect', async () => {
    for (const location of ['https://other.example/main_mail.html?targetTxn=EB500250', 'main_mail.html?targetTxn=EB500150', 'http://[']) {
      const verified = history(); (verified[0]!.body as { cptCheck: boolean }).cptCheck = true;
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: 302, headers: { Location: location } }))
        .mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('image')).mockResolvedValueOnce(Response.json(verified));
      await new ChunghwaPostTracker({ fetcher, solveCaptcha: async () => '1234' }).fetch(NUMBER);
      expect(String(fetcher.mock.calls[1]![0])).toBe('https://postserv.post.gov.tw/pstmail/SessionServlet');
      expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).hostname === 'postserv.post.gov.tw')).toBe(true);
    }
  });

  it('requires completion, whole identity and valid dates on mobile results', () => {
    expect(() => parseChunghwaPostMobile(history().slice(0, 1), NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseChunghwaPostMobile([...history(), end], NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseChunghwaPostMobile(history(), 'EA000000005TW')).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    const bad = JSON.parse(JSON.stringify(history())); bad[0].body.host_rs.ITEM[0].DATIME = '20260231090000';
    expect(() => parseChunghwaPostMobile(bad, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    expect(() => parseChunghwaPostMobile([{ header: { OutputType: 'Screen' }, body: { cptCheck: false } }, end], NUMBER))
      .toThrow(expect.objectContaining({ kind: 'indeterminate' }));
  });

  it('keeps explicit whole-bound absence and rate limits terminal', async () => {
    const missing = [{ header: { OutputType: 'Message' }, body: { msgData: `${NUMBER}|CH|Z993|資料不存在！` } }, end];
    const fetcher = mockFlow(missing); const solveCaptcha = vi.fn();
    await expect(new ChunghwaPostTracker({ fetcher, solveCaptcha }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'not_found' });
    expect(fetcher).toHaveBeenCalledTimes(4); expect(solveCaptcha).not.toHaveBeenCalled();
    fetcher.mockReset().mockResolvedValue(new Response('limit', { status: 429 }));
    await expect(new ChunghwaPostTracker({ fetcher, solveCaptcha }).fetch(NUMBER)).rejects.toMatchObject({ kind: 'rate_limited' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls back with a separate cookie jar when the mobile bootstrap binds another item', async () => {
    const verified = history(); (verified[0]!.body as { cptCheck: boolean }).cptCheck = true;
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(opened('mobile-only'))
      .mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(Response.json(init('EA000000005TW')))
      .mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('image')).mockResolvedValueOnce(Response.json(verified));
    await expect(new ChunghwaPostTracker({ fetcher, solveCaptcha: async () => '1234' }).fetch(NUMBER)).resolves.toMatchObject({ current_stage: 'accepted' });
    expect(new Headers(fetcher.mock.calls[3]![1]?.headers).get('Cookie')).toBeNull();
    expect(JSON.parse(String(fetcher.mock.calls[5]![1]?.body)).header.BizCode).toBe('query');
    expect(fetcher.mock.calls.some(([, request]) => String(request?.body).includes('queryFromWebview'))).toBe(false);
  });

  it('does not continue or start OCR after cancellation', async () => {
    const controller = new AbortController(); const solveCaptcha = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort(); return new Response('');
    });
    await expect(new ChunghwaPostTracker({ fetcher, solveCaptcha }).fetch(NUMBER, { signal: controller.signal })).rejects.toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(solveCaptcha).not.toHaveBeenCalled();
  });

  it('reserves the short lookup budget for OCR', async () => {
    const payload = history(); (payload[0]!.body as { cptCheck: boolean }).cptCheck = true;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('')).mockResolvedValueOnce(new Response('image'))
      .mockResolvedValueOnce(Response.json(payload));
    await new ChunghwaPostTracker({ fetcher, solveCaptcha: async () => '1234' }).fetch(NUMBER, { budgetMs: 7_000 });
    expect(String(fetcher.mock.calls[0]![0])).toContain('SessionServlet');
  });
});
