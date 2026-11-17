import { load } from 'cheerio';
import { isFtdNzReference } from '../../core/detection/ftdNz.js';
import { normalizeTrackingNumber } from '../../core/detection/normalize.js';
import { ChallengeError, IndeterminateError, InvalidInputError, MaintenanceError, NoHistoryError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { ftdNzStage } from './status.js';

export const PROVIDER = 'FTD New Zealand';
export const FTD_NZ_ENTRY = 'https://www.ftd.nz/query/';
export const FTD_NZ_MAX_BYTES = 1024 * 1024;

export function normalizeFtdNzNumber(raw: string): string {
  const number = typeof raw === 'string' && raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (!isFtdNzReference(raw)) throw new InvalidInputError(PROVIDER, 'FTD New Zealand needs its complete three-letter and six-digit reference');
  return number;
}

function text(raw: string, max: number): string {
  if (raw.length > max) throw new SchemaError(PROVIDER, 'FTD New Zealand returned an oversized tracking field');
  return clean(raw, max);
}

function localClock(raw: string): string {
  const value = text(raw, 64), m = /^(\d{4})-(\d{2})-(\d{2}) ((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d)$/.exec(value);
  if (!m || !calendarDay(Number(m[1]), Number(m[2]), Number(m[3]))) throw new SchemaError(PROVIDER, 'FTD New Zealand returned an invalid scan clock');
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}`;
}

function locationOf(title: string): { wording: string; location?: string } {
  const match = /^【([^【】]{1,100})】\s*(.+)$/.exec(title);
  if (!match) return { wording: title };
  const native = match[1]!, location = native === '新西兰-奥克兰' ? 'Auckland, New Zealand' : native === '中国' ? 'China' : native;
  return { wording: match[2]!, location };
}

function officialZtoLink(href: string | undefined): boolean {
  if (!href) return false;
  try {
    const url = new URL(href);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname === 'www.zto.cn' && url.pathname === '/'
      && !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch { return false; }
}

/** One server-rendered guest record; the downstream notice is not a dated scan. */
export function parseFtdNz(html: string, raw: string): CarrierResult {
  const number = normalizeFtdNzNumber(raw);
  if (new TextEncoder().encode(html).byteLength > FTD_NZ_MAX_BYTES) throw new SchemaError(PROVIDER, 'FTD New Zealand returned an oversized tracking page');
  if (/_cf_chl_opt|cf-turnstile|g-recaptcha|h-captcha|<title>\s*(?:Just a moment|Access Denied|Attention Required)|verify (?:that )?you are human|403 Forbidden/i.test(html)) {
    throw new ChallengeError(PROVIDER, 'FTD New Zealand requires browser verification');
  }
  const $ = load(html);
  if (/maintenance|系统维护|网站维护/i.test($('title').text())
    || $('h1,h2,.maintenance,[role="alert"]').toArray().some(node => /^(?:service (?:is )?(?:under|in) maintenance|under maintenance|系统维护中|网站维护中)[.!。\s]*$/i.test(text($(node).text(), 1000)))) {
    throw new MaintenanceError(PROVIDER);
  }
  const form = $('form#query-form'), input = form.find('input#query-sn[name="code"]'), root = $('.query-content');
  if (form.find('[name*="captcha"], .g-recaptcha, .h-captcha').length) throw new ChallengeError(PROVIDER, 'FTD New Zealand requires tracking verification');
  if ($('title').length !== 1 || text($('title').text(), 200) !== '单号查询 - 富腾达国际货运代理'
    || form.length !== 1 || form.attr('action') !== '/query/' || form.attr('method')?.toLowerCase() !== 'get'
    || input.length !== 1 || root.length !== 1) throw new SchemaError(PROVIDER, 'FTD New Zealand returned a changed tracking page');
  const echo = input.attr('value') ?? '';
  if (echo && (echo.length > 64 || normalizeTrackingNumber(echo) !== number)) throw new SchemaError(PROVIDER, 'FTD New Zealand returned another query');
  const timelines = $('ul.timeline');
  if (!timelines.length) {
    // The same unbound “number does not exist” template is rendered for an empty query.
    // Even that generic wording is not a number-bound absence contract.
    if (root.find('.timeline-item, .time-label, .result-image').length) throw new SchemaError(PROVIDER, 'FTD New Zealand returned a malformed result');
    throw new IndeterminateError(PROVIDER, 'FTD New Zealand returned no bound shipment result');
  }
  if (timelines.length !== 1 || root.find('ul.timeline').length !== 1) throw new SchemaError(PROVIDER, 'FTD New Zealand returned ambiguous shipment results');
  const timeline = timelines.first(), id = timeline.attr('id') ?? '';
  const match = /^sn-([A-Z]{3}\d{6})-(\d{14})$/.exec(id);
  if (!match || match[1] !== number || $('[id]').filter((_, node) => $(node).attr('id') === id).length !== 1) {
    throw new SchemaError(PROVIDER, 'FTD New Zealand returned another shipment identity');
  }
  const headingRow = timeline.children('li.time-label'), heading = headingRow.children('span'), screenshot = headingRow.children('a.result-image');
  if (headingRow.length !== 1 || heading.length !== 1 || text(heading.text(), 200) !== `FTD 单号 ${number} 的查询结果：`
    || screenshot.length !== 1 || screenshot.attr('data-sn') !== id) throw new SchemaError(PROVIDER, 'FTD New Zealand returned inconsistent shipment identities');
  const rows = timeline.children('li');
  if (rows.length > 503) throw new SchemaError(PROVIDER, 'FTD New Zealand returned too many timeline rows');
  const events: CarrierEvent[] = [], seen = new Set<string>();
  let partner: string | undefined;
  for (const row of rows.toArray()) {
    const item = $(row);
    if (item.hasClass('time-label')) continue;
    if (item.hasClass('mark-li') && !item.children('.timeline-item').length && !text(item.text(), 100)) continue;
    const record = item.children('.timeline-item'), time = record.children('.time'), titleNode = record.children('.timeline-header'), body = record.children('.timeline-body');
    if (record.length !== 1 || titleNode.length !== 1 || body.length !== 1 || time.length > 1) throw new SchemaError(PROVIDER, 'FTD New Zealand returned a malformed timeline row');
    const title = text(titleNode.text(), 1000), wording = text(body.text(), 2000);
    if (!title || !wording) throw new SchemaError(PROVIDER, 'FTD New Zealand returned a scan without its wording');
    if (!time.length) {
      const header = /^您的货物处理中[，,]\s*中通快递\s+单号为\s+(\d{14})$/.exec(title);
      const bold = body.find('b'), links = record.find('a[href]');
      if (partner || !header || header[1] !== match[2] || bold.length !== 1 || text(bold.text(), 64) !== match[2]
        || links.length !== 2 || !links.toArray().every(node => text($(node).text(), 100) === '中通快递' && officialZtoLink($(node).attr('href')))
        || !wording.includes('由于快递公司网络原因') || !wording.includes(`使用单号 ${match[2]} 进行查询`)) {
        throw new SchemaError(PROVIDER, 'FTD New Zealand returned an unbound or changed downstream notice');
      }
      partner = match[2];
      continue;
    }
    if (partner) throw new SchemaError(PROVIDER, 'FTD New Zealand mixed downstream rows with its own timeline');
    const local = localClock(time.text()), place = locationOf(title), description = `${place.wording} ${wording}`;
    const stage = ftdNzStage(place.wording);
    const event: CarrierEvent = { local_time: local, description,
      ...(place.location ? { location: place.location, original_description: `${title} ${wording}` } : {}),
      ...(stage ? { stage, stage_source: 'carrier_map' } : {}) };
    const key = JSON.stringify(event);
    if (!seen.has(key)) { seen.add(key); events.push(event); }
  }
  if (!partner) throw new SchemaError(PROVIDER, 'FTD New Zealand returned no bound downstream reference');
  if (!events.length) throw new NoHistoryError(PROVIDER, 'FTD New Zealand lists the shipment without dated scans', {
    reason: 'listed', deliveryCarrier: 'zto', deliveryTrackingNumber: partner,
  });
  // Source rows establish progression oldest-first. Their NZ/China wall clocks cannot be sorted as instants.
  events.reverse();
  const newest = events[0]!, stage = newest.stage as Stage | undefined;
  return { status: stage ? languageStageStatus(stage) : 'unknown', ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: newest.description, last_update: null, last_update_local: newest.local_time, expected_delivery: null,
    delivery_carrier: 'zto', delivery_tracking_number: partner, history_truncated: true, events: events.slice(0, 100) };
}
