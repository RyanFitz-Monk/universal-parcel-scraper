import { OcrWorker } from '../../core/transport/ocrWorker.js';

export class AaaCooperOcr extends OcrWorker {
  constructor() { super('AAA Cooper', new URL('./ocr-worker.mjs', import.meta.url)); }
}
