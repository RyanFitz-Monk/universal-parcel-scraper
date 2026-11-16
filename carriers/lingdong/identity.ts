import type { SameInstantIdentityPolicy } from '../../core/catalog/eventIdentity.js';
import { translatedScanPolicy } from '../../core/status/english.js';
import { hualeiIdentityPolicy } from '../gzyl/identity.js';
import { lingdongEnglish } from './status.js';

// Rows stored in Chinese and English before the adapter showed their English half are taken over
// by the English row at the same instant and place, as are the shared client's other rereadings.
const translated = translatedScanPolicy('lingdong', lingdongEnglish);
const shared = hualeiIdentityPolicy('lingdong');
export const sameInstantIdentityPolicy: SameInstantIdentityPolicy = {
  ...shared,
  matches: (incoming, stored) => translated.matches!(incoming, stored) || shared.matches!(incoming, stored),
};
