import { load } from 'cheerio';
import { ChallengeError, IndeterminateError, InvalidInputError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus } from '../../core/status/index.js';
import { calendarDay } from '../../core/time/index.js';
import { paxelScan } from './status.js';

export const PROVIDER = 'Paxel';
export const PAGE = 'https://paxel.co/id/lacak-pengiriman';
export const MAX_BYTES = 2_000_000;
const MAX_SCANS = 500;
const HIDDEN = '[hidden],[aria-hidden="true"],.hidden,.hide,.d-none,[style*="display:none"],[style*="display: none"],[style*="visibility:hidden"],[style*="visibility: hidden"]';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const compact = (value: string): string => value.replace(/\s+/g, ' ').trim();
const schema = (reason: string): never => { throw new SchemaError(PROVIDER, 'Paxel returned malformed tracking HTML', { reason }); };

/** Accepted for a parcel already filed to Paxel; this is not an issuer rule. */
export function normalizePaxelNumber(raw: string): string {
  const value = raw.trim().toUpperCase();
  const tspx = /^TSPX-?(\d{11})$/.exec(value);
  if (tspx) return 'TSPX-' + tspx[1];
  const em = /^(?:EM\.([A-Z0-9]{10})-(20\d{6})-(\d)-([A-Z0-9]{6})|EM([A-Z0-9]{10})(20\d{6})(\d)([A-Z0-9]{6}))$/.exec(value);
  if (em) return `EM.${em[1] ?? em[5]}-${em[2] ?? em[6]}-${em[3] ?? em[7]}-${em[4] ?? em[8]}`;
  throw new InvalidInputError(PROVIDER, 'Paxel needs its whole AWB');
}

export function sourceClock(value: string): string {
  const match = /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2}) \| ((?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  // Leap day remains possible: this reply supplies neither a year nor a time zone.
  if (!match || !calendarDay(2000, MONTHS.indexOf(match[1]!) + 1, Number(match[2]))) return schema('scan_clock_schema');
  return value;
}

export function parsePaxel(html: string, raw: string): CarrierResult {
  const number = normalizePaxelNumber(raw);
  if (html.length > MAX_BYTES || new TextEncoder().encode(html).byteLength > MAX_BYTES) return schema('body_limit');
  // A framework exception is a changed/broken payload, not proof of a CAPTCHA.
  if (/TokenMismatchException|_ignition|Stack trace:|APP_KEY\s*=|Whoops! There was an error|Illuminate\\\\/i.test(html)) {
    return schema('upstream_debug_html');
  }
  if (/<title>\s*(?:Just a moment|Access Denied|Attention Required|403 Forbidden|Request Rejected)|_cf_chl_opt|cf-mitigated|\/cdn-cgi\/challenge-platform\/|["'](?:challenge-form|cf-challenge-running)["']|>\s*Verify (?:that )?you are human|class=["'][^"']*(?:cf-turnstile|g-recaptcha|h-captcha)|<input[^>]+name=["'](?:captcha|captcha_code|verification_code)["']/i.test(html)) {
    throw new ChallengeError(PROVIDER, 'Paxel returned browser verification');
  }
  const $ = load(html);
  $('script,style,template,input,textarea,select,iframe,meta,link,img,a[href],.proof-of-delivery,.address,.hero-name,.staff-name,.courier-name,.driver-name').remove();
  const visible = (node: ReturnType<typeof $>): boolean => !node.closest(HIDDEN).length && !node.find(HIDDEN).length;
  const details = $('.awb-detail');
  if (!details.length) {
    const tables = $('table'), rows = tables.find('tbody > tr'), cells = rows.children('td');
    if (tables.length === 1 && tables.find('tbody').length === 1 && rows.length === 1 && cells.length === 2
      && visible(tables) && rows.children().length === 2 && compact(cells.eq(0).text()) === number
      && compact(cells.eq(1).text()) === 'AWB Tidak Valid' && cells.eq(1).find('span.tx-red').length === 1
      && compact(cells.eq(1).find('span.tx-red').text()) === 'AWB Tidak Valid') {
      throw new IndeterminateError(PROVIDER, 'Paxel returned AWB Tidak Valid', { reason: 'invalid_awb' });
    }
    return schema('result_not_unique');
  }
  if (details.length !== 1 || details.closest(HIDDEN).length) return schema('result_not_unique');
  const headings = details.find('h5,h6');
  if (headings.length !== 2 || details.find('h5').length !== 1 || details.find('h6').length !== 1
    || !visible(headings) || headings.toArray().some(node => compact($(node).text()) !== number)) {
    return schema('whole_identity_mismatch');
  }
  const timelines = details.find('.delivery-timeline');
  if (timelines.length !== 1 || $('.delivery-timeline').length !== 1 || !visible(timelines)) return schema('timeline_not_unique');
  const children = timelines.children();
  if (!children.length || children.length % 2 || children.length > MAX_SCANS * 2
    || timelines.contents().toArray().some(node => node.nodeType === 3 && 'data' in node && compact(node.data))) return schema('timeline_pair_schema');
  const events: CarrierEvent[] = [];
  for (let index = 0; index < children.length; index += 2) {
    const row = children.eq(index), description = children.eq(index + 1);
    if (!row.hasClass('row') || !description.hasClass('description')) return schema('timeline_pair_schema');
    const clocks = row.find('.col-3'), places = row.find('.district');
    if (clocks.length !== 1 || places.length !== 1 || !visible(clocks) || !visible(places) || !visible(description)) return schema('scan_fields_schema');
    const clock = sourceClock(compact(clocks.text())), wording = compact(description.text()), location = compact(places.text());
    if (!wording || wording.length > 500 || location.length > 200
      || /@|https?:|\b(?:tel|phone|whatsapp)\b|\d{7}/i.test(location)) return schema('scan_fields_schema');
    const scan = paxelScan(wording);
    events.push({ provider_time_text: clock, description: scan.description, ...(location ? { location } : {}),
      ...(scan.stage ? { stage: scan.stage, stage_source: 'carrier_map' } : {}) });
  }
  // Preserve the native newest-first order. The yearless clocks cannot establish instants.
  const newest = events[0]!, stage = newest.stage as ReturnType<typeof paxelScan>['stage'];
  return { status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: newest.description, last_update: null, expected_delivery: null,
    history_truncated: true, events };
}
