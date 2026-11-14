import { describe, expect, it } from 'vitest';
import { fromLooseFormat, looseFormat, paddedDate } from './fields.js';

describe('unpadded date fields', () => {
  it('pads a one-digit day, month and hour and keeps the field order', () => {
    expect(paddedDate('5.1.2026 9:05')).toBe('05.01.2026 09:05');
    expect(paddedDate('5.11.2026 09:05:00')).toBe('05.11.2026 09:05:00');
    expect(paddedDate('1/5/2026 9:05 AM')).toBe('01/05/2026 09:05 AM');
    expect(paddedDate('5-1-26')).toBe('05-01-26');
    expect(paddedDate('5. 11. 2026.')).toBe('05. 11. 2026.');
    expect(paddedDate('2026/1/5 0:00')).toBe('2026/01/05 00:00');
    expect(paddedDate('Nov 5, 2026')).toBe('Nov 05, 2026');
    expect(paddedDate('5 Nov 2026')).toBe('05 Nov 2026');
    expect(paddedDate('le 5/1/2026.')).toBe('le 05/01/2026.');
  });

  it('returns a padded value, an undelimited one and other numbers unchanged', () => {
    for (const value of ['05.11.2026 09:05:00', '2026-11-05T09:05:00+01:00', '20261105', '12:5:30', 'v1.2.3', 'Gate 15:30']) {
      expect(paddedDate(value)).toBe(value);
    }
  });

  it('loosens delimited two-digit tokens and keeps run-together tokens and literals', () => {
    expect(looseFormat('dd.MM.yyyy HH:mm:ss')).toBe('d.M.yyyy H:mm:ss');
    expect(looseFormat('dd MMM yyyy hh:mm a')).toBe('d MMM yyyy h:mm a');
    expect(looseFormat("yyyy-MM-dd'T'HH:mm")).toBe("yyyy-M-d'T'H:mm");
    expect(looseFormat("dd.MM.yyyy 'HH' HH")).toBe("d.M.yyyy 'HH' H");
    expect(looseFormat('yyyyMMdd HHmmss')).toBe('yyyyMMdd HHmmss');
    expect(looseFormat('MMMM dd, yyyy')).toBe('MMMM d, yyyy');
  });

  it('reads an unpadded and a padded value under the same format', () => {
    const format = 'dd.MM.yyyy HH:mm:ss';
    expect(fromLooseFormat('5.1.2026 9:05:00', format, { zone: 'Europe/Istanbul' }).toISO()).toBe('2026-01-05T09:05:00.000+03:00');
    expect(fromLooseFormat('05.01.2026 09:05:00', format, { zone: 'Europe/Istanbul' }).toISO()).toBe('2026-01-05T09:05:00.000+03:00');
    expect(fromLooseFormat('20260105', 'yyyyMMdd').isValid).toBe(true);
    expect(fromLooseFormat('2026015', 'yyyyMMdd').isValid).toBe(false);
  });
});
