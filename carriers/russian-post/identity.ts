import type { SameInstantIdentityPolicy } from '../../core/catalog/eventIdentity.js';
import { matchesRereadLocation } from '../../core/catalog/locationIdentity.js';
import { translatedScanPolicy } from '../../core/status/english.js';
import { russianPostEnglish, russianPostPlace } from './status.js';

// The English feed gives some acceptance labels in Russian. At one instant, the
// scan shown in English takes over the row stored with the Russian label, and
// the scan without a city given as a number alone the row stored with it.
const translated = translatedScanPolicy('russian-post', russianPostEnglish);
export const sameInstantIdentityPolicy: SameInstantIdentityPolicy = {
  ...translated,
  matches: (incoming, stored) => translated.matches!(incoming, stored) || matchesRereadLocation(incoming, stored, russianPostPlace),
};
