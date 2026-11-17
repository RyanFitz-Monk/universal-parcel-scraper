import { OcrWorker } from '../../core/transport/ocrWorker.js';

export class BestFreightCnOcr extends OcrWorker {
  constructor() { super('BEST Freight China', new URL('./ocr-worker.mjs', import.meta.url)); }
}
