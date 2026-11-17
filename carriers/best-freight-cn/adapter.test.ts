import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { hasDirectHandoffAdapter } from '../../core/catalog/handoff.js';
import { recognitionAskedCarriers } from '../../core/catalog/recognition.js';
import { detectCarrierMatch } from '../../core/detection/index.js';
import { BestFreightCnTracker } from './adapter.js';
import { normalizeBestFreightCnNumber, parseBestFreightCn } from './parser.js';
import { bestFreightCnConsensus } from './ocr-consensus.mjs';

const NUMBER = '97468251036';
const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/tracking.json', import.meta.url), 'utf8'));
const challenge = (guid = 'synthetic-challenge') => ({ code: 200, success: true, errorCode: null, data: { verifyCodeGuid: guid, imageStream: 'AQID' } });
const solve = async () => '123456';

describe('BEST China freight guest tracking', () => {
  it('binds the whole main waybill and retains both dated main and child-consignment activities', () => {
    const result = parseBestFreightCn(fixture(), NUMBER);
    expect(result).toMatchObject({ status: 'in_transit', current_stage: 'in_transit', last_update: null,
      last_update_local: '2026-11-17T07:54:22', expected_delivery: null });
    expect(result.events).toHaveLength(9);
    expect(result.events!.at(-1)).toMatchObject({ stage: 'accepted', local_time: '2026-11-13T17:45:22' });
    expect(result.events!.every(e => e.local_time && !e.time)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
  });
  it('accepts only the tested native absence envelope and keeps failures distinct', () => {
    expect(() => parseBestFreightCn({ code: 200, success: true, errorCode: null, message: null, data: [] }, NUMBER)).toThrow(expect.objectContaining({ kind: 'not_found' }));
    for (const [code, kind] of [[113, 'challenge'], [111, 'challenge'], [429, 'rate_limited'], [500, 'indeterminate']] as const) {
      expect(() => parseBestFreightCn({ code, success: false, data: [] }, NUMBER)).toThrow(expect.objectContaining({ kind }));
    }
    expect(() => parseBestFreightCn({ code: 200, success: true, errorCode: null, message: 'maintenance', data: [] }, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
    for (const p of [{ code: 200, data: [] }, { code: 200, success: true, data: null }, { code: 200, success: true, data: {} }]) {
      expect(() => parseBestFreightCn(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    expect(() => parseBestFreightCn({ code: 200, success: false, data: [] }, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
  });
  it('rejects extended, shortened or numeric identity, ambiguous lists and impossible clocks', () => {
    for (const mutate of [
      (p: ReturnType<typeof fixture>) => { p.data[0].billCode += '1'; },
      (p: ReturnType<typeof fixture>) => { p.data[0].billCode = NUMBER.slice(0, -1); },
      (p: ReturnType<typeof fixture>) => { p.data[0].billCode = Number(NUMBER); },
      (p: ReturnType<typeof fixture>) => { p.data.push(p.data[0]); },
      (p: ReturnType<typeof fixture>) => { p.data[0].traceList = null; },
      (p: ReturnType<typeof fixture>) => { p.data[0].detailList[0].time = '2026-02-30 10:00:00'; },
      (p: ReturnType<typeof fixture>) => { p.data[0].detailList[0].time = '2026-11-17 24:00:00'; },
      (p: ReturnType<typeof fixture>) => { p.data[0].detailList[0].memo = '<html>denied</html>'; },
    ]) {
      const p = fixture(); mutate(p);
      expect(() => parseBestFreightCn(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
    }
    const empty = fixture(); empty.data[0].detailList = []; empty.data[0].traceList = [];
    expect(() => parseBestFreightCn(empty, NUMBER)).toThrow(expect.objectContaining({ kind: 'indeterminate' }));
  });
  it('never treats a child sign-off or unfamiliar latest type as whole-consignment delivery', () => {
    const p = fixture(); p.data[0].traceList[0].scanType = '签收'; p.data[0].traceList[0].memo = '部分货物已签收';
    const r = parseBestFreightCn(p, NUMBER);
    expect(r.status).toBe('unknown'); expect(r).not.toHaveProperty('current_stage');
    expect(r.events![0]).not.toHaveProperty('stage');
  });
  it('deduplicates exact scans, preserves simultaneous distinct scans and validates beyond the cap', () => {
    const p = fixture(); p.data[0].detailList.push(p.data[0].detailList[0]);
    expect(parseBestFreightCn(p, NUMBER).events).toHaveLength(9);
    p.data[0].detailList = Array.from({ length: 101 }, (_, i) => ({ ...p.data[0].detailList[0], memo: `Activity ${i}` }));
    expect(parseBestFreightCn(p, NUMBER)).toMatchObject({ history_truncated: true });
    expect(parseBestFreightCn(p, NUMBER).events).toHaveLength(100);
    p.data[0].detailList[100].time = 'invalid';
    expect(() => parseBestFreightCn(p, NUMBER)).toThrow(expect.objectContaining({ kind: 'schema' }));
  });
  it('requires three agreeing six-digit OCR results, without case folding, cropping or partial answers', () => {
    expect(bestFreightCnConsensus(['123456', '123456', '123456'])).toBe('123456');
    for (const a of [[], ['123456'], ['123456', '123456', '123457'], ['12345', '12345', '12345'], ['abcdef', 'abcdef', 'abcdef']]) expect(bestFreightCnConsensus(a)).toBe('');
  });
  it('uses the native request builder, supplied transport and fresh lookup-local cookies', async () => {
    let count = 0;
    const fetcher = vi.fn<typeof fetch>(async (url, init) => {
      count++;
      expect(init?.method).toBe('POST'); expect(init?.redirect).toBe('manual'); expect(init?.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(init?.headers);
      if (count % 2 === 1) {
        expect(String(url)).toBe('https://www.800best.com/api/general/imageverifycode'); expect(headers.get('cookie')).toBeNull();
        const response = Response.json(challenge(), { headers: { 'set-cookie': 'guest=synthetic; Path=/; Secure' } });
        Object.defineProperty(response, 'url', { value: String(url) }); return response;
      }
      expect(String(url)).toBe('https://www.800best.com/api/billcode/quickly/list');
      expect(headers.get('cookie')).toBe('guest=synthetic');
      expect(JSON.parse(new URLSearchParams(String(init?.body)).get('req')!)).toEqual({ billCodeList: [NUMBER], verifyCode: '123456', verifyCodeGuid: 'synthetic-challenge' });
      return Response.json(fixture());
    });
    const tracker = new BestFreightCnTracker({ fetcher, solveCaptcha: solve });
    try { for (let i = 0; i < 2; i++) expect((await tracker.fetch(NUMBER)).events).toHaveLength(9); } finally { await tracker.close(); }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('refreshes a refused CAPTCHA once and does not reuse the old GUID', async () => {
    let count = 0;
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      count++;
      if (count % 2) return Response.json(challenge(`generation-${count}`));
      const body = JSON.parse(new URLSearchParams(String(init?.body)).get('req')!);
      expect(body.verifyCodeGuid).toBe(`generation-${count - 1}`);
      return Response.json(count === 2 ? { code: 113, success: false, data: null } : fixture());
    });
    const tracker = new BestFreightCnTracker({ fetcher, solveCaptcha: solve });
    try { expect((await tracker.fetch(NUMBER)).events).toHaveLength(9); } finally { await tracker.close(); }
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('caps unreadable and repeatedly refused challenges at two fresh images', async () => {
    for (const badAnswer of [true, false]) {
      const fetcher = vi.fn<typeof fetch>(async url => Response.json(String(url).includes('imageverifycode') ? challenge() : { code: 113, success: false }));
      const tracker = new BestFreightCnTracker({ fetcher, solveCaptcha: async () => badAnswer ? '' : '123456' });
      try { await expect(tracker.fetch(NUMBER)).rejects.toMatchObject({ kind: 'challenge' }); } finally { await tracker.close(); }
      expect(fetcher).toHaveBeenCalledTimes(badAnswer ? 2 : 4);
    }
  });
  it.each([[403, 'challenge'], [429, 'rate_limited'], [503, 'maintenance'], [302, 'transport']])('does not replay an HTTP %s', async (status, kind) => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response('refused', { status: Number(status) }));
    const tracker = new BestFreightCnTracker({ fetcher, solveCaptcha: solve });
    try { await expect(tracker.fetch(NUMBER)).rejects.toMatchObject({ kind }); } finally { await tracker.close(); }
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps HTML verification and malformed envelopes distinct, and redacts challenge transport diagnostics', async () => {
    for (const [body, kind] of [['<title>Just a moment</title>', 'challenge'], ['{}', 'schema'], ['<html>maintenance</html>', 'schema']]) {
      const fetcher = vi.fn<typeof fetch>(async () => new Response(body));
      const tracker = new BestFreightCnTracker({ fetcher, solveCaptcha: solve });
      try { await expect(tracker.fetch(NUMBER)).rejects.toMatchObject({ kind }); } finally { await tracker.close(); }
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  });
  it('validates before I/O, honors cancellation, and keeps numeric issuer detection and recognition unchanged', async () => {
    const fetcher = vi.fn<typeof fetch>(); const tracker = new BestFreightCnTracker({ fetcher, solveCaptcha: solve });
    try {
      for (const value of ['ABC97468251036', '9746825103', NUMBER + '1']) {
        await expect(tracker.fetch(value)).rejects.toMatchObject({ kind: 'invalid_input' });
        expect(hasDirectHandoffAdapter('best-freight-cn', value)).toBe(false);
      }
      const controller = new AbortController(); controller.abort();
      await expect(tracker.fetch(NUMBER, { signal: controller.signal })).rejects.toBeDefined();
      expect(fetcher).not.toHaveBeenCalled();
    } finally { await tracker.close(); }
    expect(normalizeBestFreightCnNumber(' 97468 251036 ')).toBe(NUMBER);
    expect(hasDirectHandoffAdapter('best-freight-cn', NUMBER)).toBe(true);
    expect(detectCarrierMatch(NUMBER).candidates).not.toContain('best-freight-cn');
    expect(recognitionAskedCarriers(NUMBER, { countryHint: 'CN' })).not.toContain('best-freight-cn');
  });
});
