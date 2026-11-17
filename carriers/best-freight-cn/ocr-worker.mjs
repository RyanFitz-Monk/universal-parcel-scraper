import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import * as ort from 'onnxruntime-web';
import { decodeTextCaptchaLogits } from '../../core/transport/text-captcha-decode.mjs';
import { bestFreightCnConsensus } from './ocr-consensus.mjs';

ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';
let session;
async function solve(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 50_000) throw new Error('unsupported-image');
  const metadata = await sharp(bytes, { limitInputPixels: 10_000, pages: 1, failOn: 'warning' }).metadata().catch(() => { throw new Error('unsupported-image'); });
  if (metadata.format !== 'jpeg' || metadata.width !== 138 || metadata.height !== 30 || (metadata.pages ?? 1) !== 1) throw new Error('unsupported-image');
  session ??= await ort.InferenceSession.create(new Uint8Array(await readFile(new URL('../../core/transport/text-captcha-model/captcha.onnx', import.meta.url))),
    { executionProviders: ['wasm'], graphOptimizationLevel: 'all', logSeverityLevel: 3 });
  const answers = [];
  for (const median of [0, 3, 5]) {
    let image = sharp(bytes, { limitInputPixels: 10_000, pages: 1, failOn: 'warning' }).flatten({ background: '#fff' }).greyscale();
    if (median) image = image.median(median);
    const pixels = await image.resize(256, 64).raw().toBuffer();
    if (pixels.length !== 256 * 64) throw new Error('inference-failed');
    const result = (await session.run({ input1: new ort.Tensor('float32', Float32Array.from(pixels, value => value / 127.5 - 1), [1, 1, 64, 256]) }))['387'];
    if (!result || result.type !== 'float32') throw new Error('inference-failed');
    answers.push(decodeTextCaptchaLogits(result.data, result.dims));
  }
  return bestFreightCnConsensus(answers);
}
parentPort?.on('message', async ({ id, bytes }) => {
  try { parentPort.postMessage({ id, answer: await solve(bytes) }); }
  catch (error) { parentPort.postMessage({ id, error: error?.message === 'unsupported-image' ? 'unsupported-image' : 'inference-failed' }); }
});
