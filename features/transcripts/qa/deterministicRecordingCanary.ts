import { encodeWavFromFloat32 } from "@/lib/audio/wav";

export const TRANSCRIPT_RECORDING_CANARY = {
  version: "transcript-recording-canary-v1",
  durationSeconds: 2,
  titlePrefix: "Agent Review Recording Canary",
  description:
    "Deterministic non-transmitting QA recording. No microphone or speech-to-text provider was used.",
  transcriptText: "Deterministic non-transmitting recording canary.",
} as const;

/**
 * Build a short, audible WAV fixture without opening a microphone or sending
 * any source audio to a provider. The alternating tones make playback failure
 * distinguishable from a silent media element while keeping every run exact.
 */
export function createDeterministicRecordingCanary(): Blob {
  const sampleRate = 16_000;
  const sampleCount = sampleRate * TRANSCRIPT_RECORDING_CANARY.durationSeconds;
  const samples = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const pulseTime = time % 0.5;
    if (pulseTime >= 0.35) continue;

    const frequency = Math.floor(time / 0.5) % 2 === 0 ? 660 : 880;
    const fadeIn = Math.min(pulseTime / 0.02, 1);
    const fadeOut = Math.min((0.35 - pulseTime) / 0.02, 1);
    const envelope = Math.max(0, Math.min(fadeIn, fadeOut));
    samples[index] = Math.sin(2 * Math.PI * frequency * time) * 0.18 * envelope;
  }

  return encodeWavFromFloat32(samples, sampleRate, { targetRate: sampleRate });
}
