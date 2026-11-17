import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { decodeTextCaptchaLogits } from '../../core/transport/text-captcha-decode.mjs';
import { aaaCooperConsensus } from './ocr-consensus.mjs';

ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';
let session;
async function solve(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new Error('unsupported-image');
  try {
    if (!bytes.length || bytes.length > 65536) throw new Error('unsupported-image');
    const metadata = await sharp(bytes, { limitInputPixels: 10000, pages: 1, failOn: 'warning' }).metadata().catch(() => { throw new Error('unsupported-image'); });
    if (metadata.format !== 'jpeg' || metadata.width !== 180 || metadata.height !== 50 || (metadata.pages ?? 1) !== 1) throw new Error('unsupported-image');
    session ??= await ort.InferenceSession.create(new Uint8Array(await readFile(new URL('../../core/transport/text-captcha-model/captcha.onnx', import.meta.url))),
      { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
    const answers = [];
    for (const threshold of [0, 128, 180]) {
      let image = sharp(bytes, { limitInputPixels: 10000, pages: 1, failOn: 'warning' }).flatten({ background: '#fff' }).greyscale();
      if (threshold) image = image.threshold(threshold);
      const pixels = await image.resize(256, 64).raw().toBuffer();
      const values = Float32Array.from(pixels, value => value / 127.5 - 1);
      try {
        if (pixels.length !== 256 * 64) throw new Error('inference-failed');
        const result = (await session.run({ input1: new ort.Tensor('float32', values, [1, 1, 64, 256]) }))['387'];
        if (!result || result.type !== 'float32') throw new Error('inference-failed');
        answers.push(decodeTextCaptchaLogits(result.data, result.dims));
      } finally { pixels.fill(0); values.fill(0); }
    }
    return aaaCooperConsensus(answers);
  } finally { bytes.fill(0); }
}
parentPort?.on('message', async ({ id, bytes }) => {
  try { parentPort.postMessage({ id, answer: await solve(bytes) }); }
  catch (error) { parentPort.postMessage({ id, error: error?.message === 'unsupported-image' ? 'unsupported-image' : 'inference-failed' }); }
});
