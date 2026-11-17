import { parseHualeiPage, type HualeiTenant } from '../gzyl/hualei.js';
import type { CarrierResult } from '../../core/result/index.js';
import { pwbStage } from './status.js';

export const PROVIDER = 'PWB';
export const PWB_ORIGIN = 'http://www.pwbpost.com:8082';
export const PWB: HualeiTenant = { carrier: 'pwb', provider: PROVIDER, origin: PWB_ORIGIN, stage: pwbStage };

export const parsePwbPage = (html: string, number: string, readAt?: number): CarrierResult => parseHualeiPage(html, number, PWB, readAt);
