import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { DtdcOcr } from './ocr.js';

describe('DTDC OCR', () => {
  it('reads letters that reach the picture\'s sides in capitals, and rejects other image geometry', async () => {
    const worker = new DtdcOcr();
    const picture = (width: number) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="60"><rect width="${width}" height="60" fill="white"/>`
      + '<text x="2" y="46" font-family="sans-serif" font-size="40" textLength="176" lengthAdjust="spacingAndGlyphs">KX7T2M</text></svg>')).png().toBuffer();
    try {
      expect(await worker.solve(await picture(180), AbortSignal.timeout(10_000))).toBe('KX7T2M');
      await expect(worker.solve(await picture(200), AbortSignal.timeout(2000))).rejects.toMatchObject({ kind: 'challenge' });
    } finally { await worker.close(); }
  }, 15_000);
});
