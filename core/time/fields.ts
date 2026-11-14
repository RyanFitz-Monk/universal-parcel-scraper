/**
 * Day, month and hour fields printed without their leading zero.
 *
 * A culture's short date and time can drop it: Turkish "5.11.2026", Dutch
 * "5-1-2026 9:05", American "1/5/2026 9:05 AM". Samples dated from the 10th, in
 * October to December or from 10:00 hide that, so a reader built from them
 * takes two digits and fails on the 1st to the 9th. Pad a field before matching
 * it against a two-digit pattern, and loosen a Luxon format before parsing.
 */
import { DateTime, type DateTimeOptions } from 'luxon';

const DAY_FIRST = /(?<!\d)(\d{1,2})([./-] ?)(\d{1,2})\2(\d{4}|\d{2})(?!\d)/g;
const YEAR_FIRST = /(?<!\d)(\d{4})([./-] ?)(\d{1,2})\2(\d{1,2})(?!\d)/g;
const HOUR = /(?<![\d:])(\d)(?=:[0-5]\d(?!\d))/g;
const DAY_BEFORE_MONTH = /(?<![\p{L}\p{N}])(\d)(?=[ -]\p{L}{3,}\.?,?[ -]\d{4}(?!\d))/gu;
const DAY_AFTER_MONTH = /(?<=(?<![\p{L}])\p{L}{3,}\.? )(\d)(?=,? \d{4}(?!\d))/gu;
const PADDED_TOKEN = /(?<![A-Za-z0-9])(dd|MM|HH|hh)(?![A-Za-z0-9])/g;

const two = (field: string) => field.padStart(2, '0');

/**
 * `value` with each one-digit day, month and hour padded to two digits:
 * "5.1.2026 9:05" reads "05.01.2026 09:05" and "Nov 5, 2026" reads
 * "Nov 05, 2026". Numeric dates print the day and month either way round; the
 * order is kept. A value already padded comes back unchanged.
 */
export function paddedDate(value: string): string {
  return value
    .replace(DAY_FIRST, (_, first: string, separator: string, second: string, year: string) => `${two(first)}${separator}${two(second)}${separator}${year}`)
    .replace(YEAR_FIRST, (_, year: string, separator: string, month: string, day: string) => `${year}${separator}${two(month)}${separator}${two(day)}`)
    .replace(HOUR, '0$1')
    .replace(DAY_BEFORE_MONTH, '0$1')
    .replace(DAY_AFTER_MONTH, '0$1');
}

/**
 * A Luxon format whose `dd`, `MM`, `HH` and `hh` also take one digit. A token
 * run into a letter or a digit keeps its width, so `yyyyMMdd` stays fixed, and
 * quoted literals are kept.
 */
export function looseFormat(format: string): string {
  return format.split(/('(?:[^']|'')*')/).map((part) => (part.startsWith("'") ? part : part.replace(PADDED_TOKEN, (token) => token[0]!))).join('');
}

/** `DateTime.fromFormat` under {@link looseFormat}, so an unpadded day, month or hour still reads. */
export function fromLooseFormat(text: string, format: string, options?: DateTimeOptions): ReturnType<typeof DateTime.fromFormat> {
  return DateTime.fromFormat(text, looseFormat(format), options);
}
