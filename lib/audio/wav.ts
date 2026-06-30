// lib/audio/wav.ts
//
// The reusable WAV-encoding primitive: mono Float32 PCM → a 16-bit PCM WAV blob.
// WAV is sample-accurate (no codec fragments to fail to decode), universally
// decodable on every browser + every audio model, and trivially sliceable —
// which is exactly why the Fast Fire capture core encodes per-card clips and the
// full session as WAV instead of MediaRecorder containers.
//
// Pure + framework-free (no DOM beyond Blob, which exists in browsers + workers).
// Pair with ./pcm for concat / slice / resample / beep-mix.

import { resampleLinearFloat32 } from "./pcm";

export interface EncodeWavOptions {
  /** Resample to this rate before encoding. Default 16000 (speech-optimal:
   *  tiny uploads, ideal for audio graders/transcription). Pass the input rate
   *  (or 0/undefined with a matching input) to keep native fidelity. */
  targetRate?: number;
}

const DEFAULT_TARGET_RATE = 16000;

/**
 * Encode mono Float32 PCM (`samples`, captured at `inputRate`) as a 16-bit PCM
 * WAV blob. Resamples to `opts.targetRate` (default 16 kHz) first.
 */
export function encodeWavFromFloat32(
  samples: Float32Array,
  inputRate: number,
  opts: EncodeWavOptions = {},
): Blob {
  const targetRate = opts.targetRate ?? DEFAULT_TARGET_RATE;
  const pcm =
    targetRate && targetRate !== inputRate
      ? resampleLinearFloat32(samples, inputRate, targetRate)
      : samples;
  const sampleRate = targetRate || inputRate;

  const numSamples = pcm.length;
  const bytesPerSample = 2; // 16-bit
  const dataSize = numSamples * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF header
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");

  // fmt sub-chunk (PCM)
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // audioFormat = 1 (PCM)
  view.setUint16(22, 1, true); // numChannels = 1 (mono)
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byteRate (mono)
  view.setUint16(32, bytesPerSample, true); // blockAlign (mono)
  view.setUint16(34, 16, true); // bitsPerSample

  // data sub-chunk
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Float32 [-1,1] → Int16 LE
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const s = pcm[i] > 1 ? 1 : pcm[i] < -1 ? -1 : pcm[i];
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
