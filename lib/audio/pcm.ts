// lib/audio/pcm.ts
//
// Generic, framework-free utilities for mono Float32 PCM audio buffers — the raw
// sample arrays that come out of a Web Audio AudioWorklet / ScriptProcessor tap.
// Pure functions, no DOM, no React, no feature knowledge. Reusable by any audio
// feature that captures PCM and needs to concat / resample / slice / mix it.
//
// Convention everywhere here: samples are normalized Float32 in [-1, 1], mono,
// at a known sample rate. Pair with `encodeWavFromFloat32` (./wav) to get a
// durable, universally-decodable WAV blob.

/** Concatenate a list of Float32 chunks into one contiguous buffer.
 *  Pass `totalLength` (running sample count) to skip the length pre-scan. */
export function concatFloat32(
  chunks: readonly Float32Array[],
  totalLength?: number,
): Float32Array {
  const length =
    totalLength ?? chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.length > length) {
      // Defensive: never write past the declared length (a late chunk arriving
      // after the count was snapshotted would otherwise overflow).
      out.set(chunk.subarray(0, length - offset), offset);
      break;
    }
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Copy a sample span `[start, end)` out of a buffer, clamped to its bounds.
 *  Returns an empty buffer if the (clamped) range is non-positive. */
export function sliceFloat32(
  buffer: Float32Array,
  start: number,
  end: number,
): Float32Array {
  const s = Math.max(0, Math.min(Math.floor(start), buffer.length));
  const e = Math.max(s, Math.min(Math.floor(end), buffer.length));
  return buffer.slice(s, e);
}

/** Linear-interpolation resample of mono Float32 from `inputRate` to
 *  `targetRate`. Returns the input untouched when the rates match. Good enough
 *  for speech (graders, transcription); not for music mastering. */
export function resampleLinearFloat32(
  input: Float32Array,
  inputRate: number,
  targetRate: number,
): Float32Array {
  if (inputRate === targetRate || input.length === 0) return input;
  const ratio = targetRate / inputRate;
  const outLength = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i / ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Synthesize a short sine tone as a Float32 buffer (e.g. a boundary beep).
 *  A ~5ms fade in/out avoids clicks. `amplitude` is the peak in [0, 1]. */
export function makeSineFloat32(
  frequency: number,
  durationSec: number,
  sampleRate: number,
  amplitude = 0.3,
): Float32Array {
  const length = Math.max(1, Math.round(durationSec * sampleRate));
  const out = new Float32Array(length);
  const fade = Math.min(Math.round(0.005 * sampleRate), Math.floor(length / 2));
  const twoPiF = (2 * Math.PI * frequency) / sampleRate;
  for (let i = 0; i < length; i++) {
    let env = amplitude;
    if (i < fade) env *= i / fade;
    else if (i > length - fade) env *= (length - i) / fade;
    out[i] = Math.sin(twoPiF * i) * env;
  }
  return out;
}

/** Additively mix `source` into `target` starting at `atSample`, clamping the
 *  result to [-1, 1]. Mutates `target`. Out-of-range writes are dropped.
 *  Additive (not overwrite) so a beep laid over speech preserves the speech. */
export function mixInto(
  target: Float32Array,
  source: Float32Array,
  atSample: number,
): void {
  const start = Math.floor(atSample);
  for (let i = 0; i < source.length; i++) {
    const t = start + i;
    if (t < 0 || t >= target.length) continue;
    const v = target[t] + source[i];
    target[t] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
}
