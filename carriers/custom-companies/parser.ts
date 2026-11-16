import { load, type CheerioAPI } from 'cheerio';
import { isComment, isText, type AnyNode, type Element } from 'domhandler';
import { normalizeTrackingNumber } from '../../core/detection/index.js';
import { ChallengeError, InvalidInputError, NoHistoryError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { languageStageStatus, type Stage } from '../../core/status/index.js';
import { calendarDay } from '../../core/time/index.js';
import { clean } from '../../core/transport/index.js';
import { customCompaniesStage } from './status.js';

export const PROVIDER = 'The Custom Companies';
// A details page is about twenty kilobytes; a long history adds a few more.
export const CUSTOM_COMPANIES_MAX_BYTES = 512 * 1024;

// A shipment number as the details page and its archived lookups show it: eight digits.
const NUMBER = /^\d{7,10}$/;
// The page's whole answer when it knows no shipment under the number.
const NOT_FOUND = 'Please Enter a Valid BOL Number.';
// A day as the page writes it: "06/05/2024".
const DAY = /^(\d{2})\/(\d{2})\/(\d{4})$/;
// A twelve-hour clock as the page writes it: "05:22 PM", " 5:22 PM", and midnight as "00:29 AM".
const CLOCK = /^(\d{1,2}):(\d{2}) ([AP]M)$/;
// A town and its state: "Castleton on Hudson, NY", "BURLINGTON, VT". Anything else, such as
// "On Local Delivery Truck" or "Customer Care Center", is not a place.
const PLACE = /^(\p{L}[\p{L} .'-]{0,59}), ([A-Z]{2})$/u;
// The code FACTS writes in a comment after each history row: "DISPTCHD|…|Santa Fe Springs, CA".
// Only the code is read; the comment's note can name the staff member who scanned the freight.
const CODE = /^\s*([A-Z][A-Z ]{0,9}[A-Z])\s*\|/;
// Firewall and bot check pages, which could stand in for the details page.
const CHALLENGE = /_cf_chl_opt|cf-turnstile|\/cdn-cgi\/challenge-platform\/|_Incapsula_Resource|g-recaptcha|h-captcha|requested URL was rejected|<title>\s*(?:Just a moment|Attention Required|Access Denied|Request Rejected)/i;
const MAX_ROWS = 200;

/** A Custom Companies shipment number; anything else is not one the adapter asks the details page for. */
export function normalizeCustomCompaniesNumber(raw: string): string {
  const number = raw.length <= 64 ? normalizeTrackingNumber(raw) : '';
  if (!NUMBER.test(number)) throw new InvalidInputError(PROVIDER, 'The Custom Companies shipment numbers are eight digits');
  return number;
}

function invalid(message: string): never {
  throw new SchemaError(PROVIDER, message);
}

/** A history row's day and twelve-hour clock as a wall clock, `2024-06-05T17:22:00`. */
function wallClock(dayText: string, clockText: string): string {
  const day = DAY.exec(clean(dayText, 20));
  const clock = CLOCK.exec(clean(clockText, 20));
  const date = day ? calendarDay(Number(day[3]), Number(day[1]), Number(day[2])) : null;
  const hour = clock ? Number(clock[1]) : NaN;
  if (!date || !clock || hour > 12 || Number(clock[2]) > 59 || (hour === 0 && clock[3] === 'PM')) {
    invalid('The Custom Companies returned an invalid history time');
  }
  const hours = (hour % 12) + (clock[3] === 'PM' ? 12 : 0);
  return `${date}T${String(hours).padStart(2, '0')}:${clock[2]}:00`;
}

/** The value cell beside a label in the page's tables, "Shipment Number:", or null without one. */
function labelled($: CheerioAPI, scope: AnyNode, label: string): string | null {
  const headers = $(scope).find('th').toArray().filter((cell) => clean($(cell).text(), 60) === label);
  if (headers.length > 1) invalid(`The Custom Companies returned ${label} twice`);
  if (!headers.length) return null;
  const value = $(headers[0]).nextAll('td').first();
  return value.length ? clean(value.text(), 120) : null;
}

/** The code in the comment that follows a history row, if it has one. */
function codeAfter(row: Element): string | undefined {
  let node = row.next;
  while (node && isText(node) && !node.data.trim()) node = node.next;
  if (!node || !isComment(node)) return undefined;
  return CODE.exec(node.data)?.[1]?.replace(/ +/g, ' ');
}

/** One history row: wording, place, day and time, in that order. */
function eventOf($: CheerioAPI, row: Element): CarrierEvent {
  const cells = $(row).children('td').toArray().map((cell) => clean($(cell).text(), 200));
  if (cells.length !== 4 || !cells[0]) invalid('The Custom Companies returned an unreadable history row');
  const [description, place, day, clock] = cells as [string, string, string, string];
  const local_time = wallClock(day, clock);
  const location = PLACE.exec(place) ? place : '';
  const provider_code = codeAfter(row);
  const stage = customCompaniesStage(description);
  return {
    local_time, description,
    ...(location ? { location } : {}),
    ...(provider_code ? { provider_code } : {}),
    ...(stage ? { stage, stage_source: 'carrier_map' } : {}),
  };
}

/** The history table's rows, as the page lists them: the delivery first, then the rest newest first. */
function historyOf($: CheerioAPI): CarrierEvent[] {
  const tables = $('table.newtables2').toArray().filter((table) =>
    $(table).find('thead th').toArray().map((cell) => clean($(cell).text(), 40)).join('|') === 'Shipment Status|Location|Date|Time');
  if (tables.length > 1) invalid('The Custom Companies returned several histories');
  if (!tables.length) return [];
  const rows = $(tables[0]).find('tbody > tr').toArray();
  if (rows.length > MAX_ROWS) invalid('The Custom Companies returned an oversized history');
  return rows.map((row) => eventOf($, row));
}

/** The details page's answer for the number, or what the page says instead. */
function pageOf(html: string, number: string): CheerioAPI {
  const $ = load(html);
  const content = $('#topnavmaincontentdiv');
  const shown = content.length ? labelled($, content[0]!, 'Shipment Number:') : null;
  if (shown === null) {
    if (content.length && clean(content.text(), 400) === NOT_FOUND) throw new NotFoundError(PROVIDER);
    if (CHALLENGE.test(html.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'The Custom Companies answered with a block page');
    if (!/Powered by Carrier Logistics/.test($('title').text())) invalid('The Custom Companies did not return its shipment details page');
    invalid('The Custom Companies returned its details page without a shipment');
  }
  // The page names the shipment it shows; one for another number is no answer.
  if (normalizeTrackingNumber(shown) !== number) invalid('The Custom Companies returned a different shipment');
  return $;
}

/**
 * The FACTS details page `scripts/cgiip.exe/boldetail.htm?wbtn=PRO&wpro1={number}` for one
 * shipment number. A delivered shipment's page opens on a delivery details block: the day, the
 * arrival and departure times, who signed and the status. Then come the shipment number, the
 * ship day, the bill of lading and the shipper's references, the origin and destination with
 * their ZIP codes, pieces, pallets, weight, service and dimensions, and the history: wording,
 * place or a note such as "On Local Delivery Truck", day and time. The times are the terminal's
 * wall clock. Only the shipment number, the status and the history are read; who signed, the
 * references, addresses and freight details are not.
 */
export function parseCustomCompanies(html: string, raw: string): CarrierResult {
  const number = normalizeCustomCompaniesNumber(raw);
  const $ = pageOf(html, number);
  const listed = historyOf($);
  const block = $('#bolstatustable');
  const status = block.length ? labelled($, block[0]!, 'Status:') : null;
  const statusStage = status ? customCompaniesStage(status) : undefined;
  if (!listed.length && !statusStage) throw new NoHistoryError(PROVIDER);

  // The page lists the delivery first, before rows a terminal can still scan after it.
  const events = listed.map((event, order) => ({ event, order }))
    .sort((a, b) => (a.event.local_time === b.event.local_time ? a.order - b.order : a.event.local_time! < b.event.local_time! ? 1 : -1))
    .map(({ event }) => event);
  // A delivery settles the shipment, whichever rows follow it.
  const delivery = events.find((event) => event.stage === 'delivered');
  const current = statusStage === 'delivered' || delivery ? delivery : events.find((event) => event.stage);
  const stage: Stage | undefined = statusStage === 'delivered' ? 'delivered' : current?.stage as Stage | undefined;
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: statusStage === 'delivered' && status ? status : current?.description ?? events[0]?.description ?? status ?? null,
    last_update: null,
    ...(events[0]?.local_time ? { last_update_local: (delivery ?? events[0]).local_time } : {}),
    ...(events.length ? {} : { summary_only: true }),
    events,
  };
}
