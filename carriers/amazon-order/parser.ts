import { load, type CheerioAPI } from 'cheerio';
import { AMAZON_STORE_COUNTRIES } from '../../core/catalog/amazon.js';
import { carrierIdFromName } from '../../core/catalog/hints.js';
import { IndeterminateError, SchemaError } from '../../core/errors/index.js';
import type { CarrierResult } from '../../core/result/index.js';
import { languageStageStatus } from '../../core/status/index.js';
import { clean } from '../../core/transport/index.js';
import { isRecord } from '../../core/types.js';
import { amazonOrderStage } from './status.js';

export const PROVIDER = 'Amazon';
export const MAX_BYTES = 3_000_000;

/** The JSON Amazon renders the shared page from, in its `page-state` script. */
function pageState($: CheerioAPI): Record<string, unknown> {
  const scripts = $('script[type="a-state"]').filter((_index, node) => {
    try {
      const key: unknown = JSON.parse($(node).attr('data-a-state') ?? '');
      return isRecord(key) && key.key === 'page-state';
    } catch { return false; }
  });
  if (scripts.length !== 1) throw new SchemaError(PROVIDER, 'Amazon returned no parcel state');
  let state: unknown;
  try { state = JSON.parse(scripts.first().text()); } catch { throw new SchemaError(PROVIDER, 'Amazon returned an invalid parcel state'); }
  if (!isRecord(state)) throw new SchemaError(PROVIDER, 'Amazon returned an invalid parcel state');
  return state;
}

/** The page's sign-in link carries the share token it was opened with. */
function sharedToken(state: Record<string, unknown>): string | undefined {
  if (state.visitTrigger !== 'SHARED_PACKAGE_TRACKING' || typeof state.signInRedirectUrl !== 'string') return undefined;
  try {
    const url = new URL(state.signInRedirectUrl, 'https://www.amazon.com');
    return url.pathname.startsWith('/progress-tracker/package/share') ? url.searchParams.get('shareToken')?.toLowerCase() : undefined;
  } catch { return undefined; }
}

const text = (value: unknown) => (typeof value === 'string' && value !== 'NOT_APPLICABLE' ? clean(value, 80) : '') || undefined;

/**
 * The third-party carrier the page says delivers the parcel ("Delivery By
 * COLIS PRIVE", "Enviado con Correos Express"). The heading's words before the
 * name are in the page's language, so the carrier is the longest run of words
 * ending the heading that the catalog knows, by itself or in the store's
 * country. A seller's name on a seller-fulfilled order has a heading of its own
 * and is never read.
 */
function namedCarrier($: CheerioAPI, store: string): string | undefined {
  const headings = $('#carrierRelatedInfo-container').find('h1.widgetHeader, h1.carrierRelatedInfo-mfn-carrierNameTitle')
    .map((_index, node) => clean($(node).text(), 120)).get().filter(Boolean);
  if (headings.length !== 1) return undefined;
  const words = headings[0]!.split(' ');
  const country = AMAZON_STORE_COUNTRIES[store];
  for (let size = Math.min(words.length - 1, 4); size > 0; size--) {
    const name = words.slice(-size).join(' ');
    const carrier = carrierIdFromName(name) ?? (country ? carrierIdFromName(`${name} ${country}`) : undefined);
    if (carrier && carrier !== 'unknown' && !carrier.startsWith('amazon')) return carrier;
  }
  return undefined;
}

/**
 * Amazon's shared tracking page for one parcel of an order: its status and the
 * promise line, without scans. The page names a third-party carrier but never
 * its tracking number.
 */
export function parseAmazonOrder(html: string, token: string, store: string): CarrierResult {
  const $ = load(html);
  const state = pageState($);
  if (sharedToken(state) !== token.toLowerCase()) {
    throw new IndeterminateError(PROVIDER, 'Amazon did not confirm this parcel for the tracking link');
  }
  const progress = isRecord(state.progressTracker) ? state.progressTracker : {};
  const exception = text(state.exceptionStateIdentifier);
  const status = text(state.shortStatus);
  const code = exception ?? status;
  const stage = amazonOrderStage(exception) ?? amazonOrderStage(status) ?? amazonOrderStage(text(progress.lastReachedMilestone));
  const promise = isRecord(state.promise) ? clean(state.promise.promiseMessage, 200) : '';
  const headline = promise || clean($('h1.pt-promise-main-slot').first().text(), 200);
  const carrier = namedCarrier($, store);
  return {
    status: stage ? languageStageStatus(stage) : 'unknown',
    ...(stage ? { current_stage: stage, current_stage_source: 'carrier_map' } : {}),
    last_status_text: headline || code || null,
    ...(code ? { provider_code: code } : {}),
    summary_only: true,
    last_update: null,
    ...(carrier ? { delivery_carrier: carrier } : {}),
    events: [],
  };
}
