import { translatedScanPolicy } from '../../core/status/english.js';
import { russianPostEnglish } from './status.js';

// The English feed gives some acceptance labels in Russian. At one instant, the
// scan shown in English takes over the row stored with the Russian label.
export const sameInstantIdentityPolicy = translatedScanPolicy('russian-post', russianPostEnglish);
