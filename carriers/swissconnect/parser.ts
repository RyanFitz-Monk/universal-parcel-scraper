import { DateTime, IANAZone } from 'luxon';
import { ChallengeError, IndeterminateError, InvalidInputError, NotFoundError, SchemaError } from '../../core/errors/index.js';
import type { CarrierEvent, CarrierResult } from '../../core/result/index.js';
import { windowEstimate } from '../../core/result/window.js';
import { languageStageStatus } from '../../core/status/index.js';
import { explicitOffsetTime, EXPLICIT_OFFSET_PATTERN, firstOccurrence } from '../../core/time/index.js';
import { clean } from '../../core/transport/text.js';
import { isRecord } from '../../core/types.js';
import { SWISSCONNECT_STEPS, swissconnectState } from './status.js';

export const PROVIDER = 'swissconnect';
export const SWISSCONNECT_MAX_BYTES = 256_000;
// The service the tracker's pop-up form posts the number to, as `trackingId`.
export const SWISSCONNECT_ENDPOINT = 'https://swissconnect.ch/api/track-shipment';

/** swissconnect publishes no layout, so a number is one token of letters, digits and hyphens. */
export function normalizeSwissconnectNumber(raw: string): string {
  const number = typeof raw === 'string' ? raw.trim() : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{4,29}$/.test(number)) throw new InvalidInputError(PROVIDER);
  return number;
}

/**
 * The number as the form's placeholder writes one, three digits, a hyphen, a digit, a letter
 * and five digits, for a number that reached the adapter without its hyphen; null otherwise.
 */
export function hyphenatedSwissconnectNumber(number: string): string | null {
  const match = /^(\d{3})(\d[A-Z]\d{5})$/.exec(number.toUpperCase());
  return match ? `${match[1]}-${match[2]}` : null;
}

// A number reaches the adapter in capitals and without separators, so the shipment's own is compared the same way.
const folded = (value: unknown): string => (typeof value === 'string' || typeof value === 'number' ? String(value).toUpperCase().replace(/[\s.-]/g, '') : '');
const CHALLENGE_PAGE = /<title>\s*(?:Just a moment|Attention Required)|_cf_chl_opt|captcha|access denied/i;

export function swissconnectJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (cause) {
    if (CHALLENGE_PAGE.test(body.slice(0, 64_000))) throw new ChallengeError(PROVIDER, 'swissconnect answered with a verification page', { cause });
    throw new SchemaError(PROVIDER, 'swissconnect answered with a page instead of its tracking JSON', { cause });
  }
}

interface Clock {
  /** The wall clock as the service writes it, to the minute. */
  day: string;
  minute: string;
  /** The instant, when the service states the clock's zone or offset. */
  time?: string;
}

/** One of the reply's clocks: a wall clock under `date`, with the zone the service states beside it. */
function clockOf(value: unknown): Clock | null {
  if (value == null) return null;
  const raw = isRecord(value) ? clean(value.date, 64) : '';
  if (EXPLICIT_OFFSET_PATTERN.test(raw)) {
    const stated = explicitOffsetTime(raw);
    if (!stated) throw new SchemaError(PROVIDER, 'swissconnect returned an unreadable clock');
    return { day: stated.iso.slice(0, 10), minute: stated.iso.slice(11, 16), time: stated.iso };
  }
  const digits = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?$/.exec(raw);
  const wall = digits ? `${digits[1]}T${digits[2]}` : '';
  if (!wall || !DateTime.fromISO(wall, { zone: 'UTC' }).isValid) throw new SchemaError(PROVIDER, 'swissconnect returned an unreadable clock');
  const clock: Clock = { day: wall.slice(0, 10), minute: wall.slice(11, 16) };
  const zone = isRecord(value) ? clean(value.timezone, 64) : '';
  if (isRecord(value) && value.timezone_type === 1 && /^[+-]\d{2}:\d{2}$/.test(zone)) {
    const stated = explicitOffsetTime(`${wall}${zone}`);
    return stated ? { ...clock, time: stated.iso } : clock;
  }
  if (!isRecord(value) || value.timezone_type !== 3 || !zone || !IANAZone.isValidZone(zone)) return clock;
  // A named zone gives an instant only for a wall clock that exists once in it.
  const zoned = firstOccurrence(DateTime.fromISO(wall, { zone }));
  if (!zoned.isValid || zoned.toFormat("yyyy-MM-dd'T'HH:mm:ss") !== wall || zoned.getPossibleOffsets().length !== 1) return clock;
  return { ...clock, time: zoned.toISO({ suppressMilliseconds: true }) };
}

function scan(name: 'pickedUp' | 'delivered', clock: Clock): CarrierEvent {
  const state = swissconnectState(name)!;
  // An event is dated only on the zone or offset the service states; a bare wall clock is not given one.
  if (!clock.time) throw new SchemaError(PROVIDER, 'swissconnect returned an event clock without a zone');
  return { time: clock.time, description: state.wording, provider_code: name, stage: state.stage, stage_source: 'carrier_map' };
}

export function parseSwissconnect(payload: unknown, rawNumber: string): CarrierResult {
  const number = normalizeSwissconnectNumber(rawNumber);
  if (!isRecord(payload) || typeof payload.success !== 'boolean') throw new SchemaError(PROVIDER, 'swissconnect returned no answer');
  if (!payload.success) {
    if (payload.error === 'tracking.error.noresult') throw new NotFoundError(PROVIDER);
    // The page asks the reader to call swissconnect about a number several shipments share.
    if (payload.error === 'tracking.error.nonunique') throw new IndeterminateError(PROVIDER, 'swissconnect has more than one shipment for the number');
    throw new IndeterminateError(PROVIDER, 'swissconnect did not confirm the shipment');
  }
  const { result, list } = payload;
  if (!isRecord(result) || (list != null && !isRecord(list))) throw new SchemaError(PROVIDER, 'swissconnect returned no shipment');
  if (folded(result.fbNumber) !== folded(number)) throw new SchemaError(PROVIDER, 'swissconnect did not identify the requested number');

  // The page lights each step of its bar from `list` and replaces the bar's detail for a cancelled shipment.
  const reached = SWISSCONNECT_STEPS.filter(name => isRecord(list) && Boolean(list[name]));
  const declared = typeof result.state === 'string' ? result.state : '';
  const name = declared === 'annullated' ? declared : reached.at(-1) ?? (list == null && swissconnectState(declared) ? declared : '');
  const state = swissconnectState(name);
  if (!state) throw new SchemaError(PROVIDER, 'swissconnect returned a shipment without a known state');

  const events: CarrierEvent[] = [];
  let estimate: { expected_delivery: string | null; expected_delivery_from?: string } = { expected_delivery: null };
  if (name !== 'annullated') {
    const [pickup, delivery] = [reached.includes('pickedUp') ? clockOf(result.pickupTime) : null, reached.includes('delivered') ? clockOf(result.deliveryTime) : null];
    if (delivery) events.push(scan('delivered', delivery));
    if (pickup) events.push(scan('pickedUp', pickup));
    if (name !== 'delivered') {
      // "Planned delivery": the end's day with the drop window's clocks, or by the end's clock alone.
      const [end, from, to] = [clockOf(result.endTime), clockOf(result.dropFrom), clockOf(result.dropTo)];
      if (end) estimate = from && to ? windowEstimate(`${end.day} ${from.minute}`, `${end.day} ${to.minute}`) : windowEstimate(`${end.day} ${end.minute}`, `${end.day} ${end.minute}`);
    }
  }
  const delivered = name === 'delivered' ? events.find(event => event.provider_code === 'delivered')?.time : undefined;
  const summary = { status: languageStageStatus(state.stage), current_stage: state.stage, current_stage_source: 'carrier_map',
    last_status_text: state.wording, ...(events[0]?.provider_code === name ? {} : { provider_code: name }) };
  if (!events.length) return { ...summary, last_update: null, ...estimate, summary_only: true, events: [] };
  return { ...summary, last_update: events[0]!.time ?? null, ...estimate, ...(delivered ? { delivered_at: delivered } : {}), events };
}
