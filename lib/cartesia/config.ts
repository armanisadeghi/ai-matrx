/**
 * Cartesia TTS configuration. The model, API version, default voices, speed/volume baselines,
 * buffering and the voice/speed resolvers MOVED to @ai-matrx/media/voices (P16) and are
 * re-exported here so importers keep their path. The SDK-typed builder stays with this app's
 * Cartesia client.
 */

import type { Cartesia } from "@cartesia/cartesia-js";
import { resolveSpeed, TTS_DEFAULT_VOLUME } from "@ai-matrx/media/voices";

export {
  TTS_MODEL_ID,
  CARTESIA_API_VERSION,
  READING_VOICE_ID,
  ASSISTANT_VOICE_ID,
  LEGACY_DEFAULT_VOICE_ID,
  TTS_SPEED_MIN,
  TTS_SPEED_MAX,
  TTS_DEFAULT_SPEED,
  TTS_DEFAULT_VOLUME,
  TTS_PLAYBACK_BUFFER_SEC,
  TTS_STREAMING_BUFFER_SEC,
  resolveVoiceId,
  resolveSpeed,
  type VoicePurpose,
} from "@ai-matrx/media/voices";

/** Build a generation_config payload (latest Cartesia format). */
export function buildGenerationConfig(opts?: {
  speed?: number | null;
  volume?: number | null;
  emotion?: string | null;
}): Cartesia.GenerationConfig {
  const cfg: Cartesia.GenerationConfig = {
    speed: resolveSpeed(opts?.speed),
    volume: opts?.volume ?? TTS_DEFAULT_VOLUME,
  };
  if (opts?.emotion) cfg.emotion = opts.emotion.toLowerCase() as Cartesia.Emotion;
  return cfg;
}
