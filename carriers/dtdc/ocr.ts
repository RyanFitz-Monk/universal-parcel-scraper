import { OcrWorker } from '../../core/transport/ocrWorker.js';

/**
 * The tracking page's six capital letters and digits, read by the shared text model once a picture
 * needs reading. The model also reads small letters, which the page's check refuses.
 */
export class DtdcOcr extends OcrWorker {
  constructor() {
    super('DTDC', new URL('../../core/transport/text-captcha-worker.mjs', import.meta.url), { profile: 'dtdc' });
  }

  override async solve(bytes: Uint8Array, signal: AbortSignal): Promise<string> {
    return (await super.solve(bytes, signal)).toUpperCase();
  }
}
