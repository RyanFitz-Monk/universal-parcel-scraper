
import { load, type Cheerio, type CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { DateTime } from 'luxon';
import type { AdapterFactory, TrackingContext } from '../../core/adapter/index.js';
import { IndeterminateError, InvalidInputError, NotFoundError, SchemaError, TransportError, UpstreamHttpError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { runSteps } from '../../core/runner/index.js';
import { paddedDate } from '../../core/time/fields.js';
import { firstOccurrence } from '../../core/time/index.js';
import { clean, decodeText, fetchBounded, userAgentOf } from '../../core/transport/index.js';
import { koreaPostStatus } from './status.js';

const ENDPOINT = 'https://trace.epost.go.kr/xtts/servlet/kpl.tts.common.svl.SttSVL';

const DOMESTIC_ENDPOINT = 'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm';
const DOMESTIC = /^\d{13}$/;
const DOMESTIC_BASIC = '등기번호|보내는 분/접수일자|받는 분|수령인/배달일자|취급구분|배달결과';
const DOMESTIC_HISTORY = '날짜|시간|발생국|처리현황';
const DOMESTIC_MISSING = '현재 고객님이 신청하신 접수번호에 대하여 배달정보를 찾지 못했습니다.';
// Who took an international parcel, as its delivery's details name them.
const RECIPIENT = /^Recipient\s*:\s*(.*)$/i;
// Who took a domestic parcel, as its delivery's status cell names them after the label.
const RECEIVED = /\(\s*수령인\s*:/;

export function normalizeKoreaPostNumber(raw: string): string {
  const number = raw.toUpperCase().replace(/[\s.-]/g, '');
  if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(number) && !DOMESTIC.test(number)) {
    throw new InvalidInputError('Korea Post', 'Korea Post direct tracking supports international postal identifiers and 13-digit domestic numbers');
  }
  return number;
}

function eventTime(raw: string): string {
  const parsed = DateTime.fromFormat(paddedDate(raw), 'HH:mm dd-LLL-yyyy', { zone: 'UTC', locale: 'en-US' });
  if (!parsed.isValid) throw new SchemaError('Korea Post', 'Korea Post returned an invalid scan time');
  // The portal explicitly uses destination-local time after handover. Preserve
  // its sequence and wall clocks; a Korea-wide timezone would corrupt these.
  return parsed.toISO({ suppressMilliseconds: true, includeOffset: false });
}

/** A basic-information cell's first line: the name, above the date the page puts under it. */
function firstLine($: CheerioAPI, cell: Cheerio<Element>): string {
  const parts: string[] = [];
  for (const node of cell.contents().toArray()) {
    if ($(node).is('br')) break;
    parts.push($(node).text());
  }
  return clean(parts.join(' '), 120);
}

export function parse(html: string, trackingNumber: string): CarrierResult {
  const number = normalizeKoreaPostNumber(trackingNumber);
  if (DOMESTIC.test(number)) return parseDomestic(html, number);
  const $ = load(html);
  $('script, style, noscript').remove();
  const basic = $('table').filter((_, element) => $(element).attr('summary') === 'Basic Information');
  const basicRows = basic.find('tbody > tr');
  if (basic.length !== 1 || basicRows.length !== 1 || clean(basicRows.children('td').first().text()) !== number) throw new SchemaError('Korea Post', 'Korea Post returned a different or ambiguous shipment');
  const addressee = firstLine($, basicRows.children('td').eq(2));
  $('br').replaceWith(' ');
  const history = $('table').filter((_, element) => clean($(element).find('thead th').map((__, cell) => clean($(cell).text())).get().join('|')) === 'Date|Status|Post office/Airport|Details');
  if (history.length !== 1) throw new SchemaError('Korea Post', 'Korea Post returned an invalid tracking table');
  const rows = history.find('tbody > tr');
  if (rows.length === 1 && rows.children('td').length === 1 && rows.children('td').attr('colspan') === '4'
    && clean(rows.text()) === `Your item number ${number} is not found. Confirm your item number.`) throw new NotFoundError('Korea Post');
  if (!rows.length) throw new IndeterminateError('Korea Post', 'Korea Post returned no parcel scans');
  if (rows.length > 500) throw new SchemaError('Korea Post');
  const events: CarrierEvent[] = [];
  const recipients = new Map<CarrierEvent, string>();
  const seen = new Set<string>();
  for (const row of rows.toArray().reverse()) {
    const cells = $(row).children('td');
    if (cells.length !== 4 || cells.filter('[colspan]').length) throw new SchemaError('Korea Post');
    const time = eventTime(clean(cells.eq(0).text(), 64));
    const description = clean(cells.eq(1).text(), 500);
    if (!description) throw new SchemaError('Korea Post', 'Korea Post returned an empty scan');
    const location = clean(cells.eq(2).text(), 200);
    const key = JSON.stringify([time, description, location]);
    if (seen.has(key)) continue;
    seen.add(key);
    const classified = koreaPostStatus(description);
    const event: CarrierEvent = { local_time: time, description, location, ...(classified ? { stage: classified.stage } : {}) };
    // The details cell mixes routing notes with a delivery's result; only who
    // took the parcel is read from it.
    const recipient = classified?.stage === 'delivered'
      ? cells.eq(3).children('p').toArray().map((line) => RECIPIENT.exec(clean($(line).text(), 200))?.[1]).find((name) => name !== undefined)
      : undefined;
    const name = clean(recipient?.replace(/\(\s*\)/g, '') ?? '', 120);
    if (name) recipients.set(event, name);
    events.push(event);
  }
  const latest = events[0]!;
  const classified = koreaPostStatus(latest.description!);
  const signedBy = classified?.stage === 'delivered' ? recipients.get(latest) : undefined;
  return { status: classified?.status ?? 'unknown', ...(classified ? { current_stage: classified.stage } : {}),
    last_status_text: latest.description, last_update: null,
    ...(addressee ? { receiver_name: addressee } : {}), ...(signedBy ? { signed_by: signedBy } : {}), events: events.slice(0, 100) };
}

function domesticTable($: CheerioAPI, header: string) {
  return $('table').filter((_, element) => $(element).children('thead').find('th').map((__, cell) => clean($(cell).text())).get().join('|') === header);
}

function parseDomestic(html: string, number: string): CarrierResult {
  const $ = load(html);
  $('script, style, noscript').remove();
  const basic = domesticTable($, DOMESTIC_BASIC);
  const basicRows = basic.children('tbody').children('tr');
  const identity = basicRows.first().children('th[scope="row"]');
  if (basic.length !== 1 || identity.length !== 1 || clean(identity.text()) !== number) throw new SchemaError('Korea Post', 'Korea Post returned a different or ambiguous shipment');
  const history = domesticTable($, DOMESTIC_HISTORY);
  if (history.length !== 1) throw new SchemaError('Korea Post', 'Korea Post returned an invalid tracking table');
  const rows = history.children('tbody').children('tr');
  const notice = basicRows.slice(1);
  if (!rows.length && notice.length === 1 && notice.children('td').length === 1
    && clean(notice.text()).startsWith(DOMESTIC_MISSING)) throw new NotFoundError('Korea Post');
  if (basicRows.length !== 1) throw new SchemaError('Korea Post', 'Korea Post returned an invalid basic-information table');
  if (!rows.length) throw new IndeterminateError('Korea Post', 'Korea Post returned no parcel scans');
  if (rows.length > 500) throw new SchemaError('Korea Post');
  // The basic table names the addressee and who took the parcel, each above a date.
  const parties = basicRows.children('td');
  const addressee = firstLine($, parties.eq(1));
  const receiver = firstLine($, parties.eq(2));
  const events: CarrierEvent[] = [];
  const labels = new Map<CarrierEvent, string>();
  const seen = new Set<string>();
  for (const row of rows.toArray().reverse()) {
    const cells = $(row).children('td');
    if (cells.length !== 4 || cells.filter('[colspan], [rowspan]').length) throw new SchemaError('Korea Post');
    const clock = paddedDate(`${clean(cells.eq(0).text(), 32)} ${clean(cells.eq(1).text(), 32)}`);
    // Every domestic scan happens at a Korean office, and Korea keeps one
    // offset all year.
    const local = firstOccurrence(DateTime.fromFormat(clock, 'yyyy.MM.dd HH:mm', { zone: 'Asia/Seoul' }));
    if (!local.isValid || local.toFormat('yyyy.MM.dd HH:mm') !== clock) throw new SchemaError('Korea Post', 'Korea Post returned an invalid scan time');
    // The office cell goes on with its phone, and the status cell with the
    // courier's name and phone before a delivery; those stay out. A delivery's
    // status cell goes on with who took the parcel, which is kept.
    const status = cells.eq(3).children('span.evtnm');
    const label = status.length === 1 ? clean(status.text(), 100) : '';
    if (!label) throw new SchemaError('Korea Post', 'Korea Post returned an empty scan');
    const classified = koreaPostStatus(label);
    const cell = cells.eq(3).clone();
    cell.find('div, button').remove();
    cell.find('br').replaceWith(' ');
    const description = classified?.stage === 'delivered' && RECEIVED.test(cell.text()) ? clean(cell.text(), 300) : label;
    const office = cells.eq(2).children('a');
    const location = office.length === 1 ? clean(office.text(), 200) : '';
    const time = local.toUTC().toISO({ suppressMilliseconds: true });
    const key = JSON.stringify([time, description, location]);
    if (seen.has(key)) continue;
    seen.add(key);
    const event: CarrierEvent = { time, local_time: local.toFormat("yyyy-MM-dd'T'HH:mm:ss"), description,
      ...(location ? { location } : {}), ...(classified ? { stage: classified.stage } : {}) };
    labels.set(event, label);
    events.push(event);
  }
  const latest = events[0]!;
  const classified = koreaPostStatus(labels.get(latest)!);
  const delivered = classified?.stage === 'delivered';
  return { status: classified?.status ?? 'unknown', ...(classified ? { current_stage: classified.stage } : {}),
    last_status_text: latest.description, last_update: latest.time ?? null, last_update_local: latest.local_time,
    ...(delivered ? { delivered_at: latest.time } : {}), ...(addressee ? { receiver_name: addressee } : {}),
    ...(delivered && receiver ? { signed_by: receiver } : {}), events: events.slice(0, 100) };
}

export class KoreaPostTracker {
  constructor(private readonly options: { fetcher?: typeof fetch; userAgent?: string } = {}) {}

  async fetch(raw: string, context: TrackingContext = {}): Promise<CarrierResult> {
    const number = normalizeKoreaPostNumber(raw);
    const budgetMs = context.budgetMs ?? 15_000;
    if (!Number.isFinite(budgetMs) || budgetMs <= 0) throw new TypeError('Korea Post timeout must be positive');
    context.signal?.throwIfAborted();
    try {
      const accept = { Accept: 'text/html,*/*;q=0.8', 'User-Agent': userAgentOf(this.options.userAgent) };
      const domestic = DOMESTIC.test(number);
      const { bytes } = await fetchBounded(domestic ? `${DOMESTIC_ENDPOINT}?${new URLSearchParams({ sid1: number, displayHeader: 'N' })}` : ENDPOINT, domestic
        ? { method: 'GET', headers: accept }
        : { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...accept },
          body: new URLSearchParams({ target_command: 'kpl.tts.tt.epost.cmd.RetrieveEmsTraceEngCmd',
            JspURI: '/xtts/tt/epost/ems/EmsSearchResultEng.jsp', POST_CODE: number }).toString() },
      { provider: 'Korea Post', timeoutMs: Math.max(1, Math.floor(budgetMs)), maxBytes: 1_000_000,
        fetcher: (input, init) => (this.options.fetcher ?? fetch)(input, { ...init,
          signal: AbortSignal.any([...(context.signal ? [context.signal] : []), ...(init?.signal ? [init.signal] : [])]) }),
      });
      context.signal?.throwIfAborted();
      return parse(decodeText(bytes), number);
    } catch (error) {
      if (error instanceof UpstreamHttpError && [404, 410].includes(error.status)) throw new TransportError('Korea Post', 'Korea Post tracking endpoint is unavailable', { cause: error });
      throw error;
    }
  }
}

export const adapter: AdapterFactory = (environment) => {
  const tracker = new KoreaPostTracker({ fetcher: environment.fetcher, userAgent: environment.userAgent });
  return { id: 'korea-post', recordsSteps: true, steps: ['direct'], track: async (input, context = {}) => {
    // A number of another shape is refused before the lookup starts.
    normalizeKoreaPostNumber(input.number);
    return runSteps({ carrier: 'korea-post', budgetMs: context.budgetMs ?? 15_000, signal: context.signal, recorder: environment.recorder },
      [{ id: 'direct', run: ({ signal, remainingMs }) => tracker.fetch(input.number, { signal, budgetMs: remainingMs }) }]);
  } };
};
