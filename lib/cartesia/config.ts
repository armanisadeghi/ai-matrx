/**
 * Central Cartesia TTS configuration — the single source of truth for the model,
 * API version, system default voices, speed/volume baselines, and playback
 * buffering used by every in-app TTS surface (chat read-aloud, studio
 * read-aloud, voice playgrounds, the admin tester).
 *
 * Lives in lib/cartesia (the client's domain) so both the low-level client and
 * the feature hooks can import it without an inverted dependency.
 */

import type { Cartesia } from "@cartesia/cartesia-js";

/** Current model + API version for all in-app TTS. */
export const TTS_MODEL_ID = "sonic-3.5";
export const CARTESIA_API_VERSION = "2026-03-01";

/**
 * System default voices, used only when a user has not chosen their own.
 *   - reading   → Skylar (primary female; document / read-aloud)
 *   - assistant → Daniel (primary male; assistant replies)
 */
export const READING_VOICE_ID = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4";
export const ASSISTANT_VOICE_ID = "47c38ca4-5f35-497b-b1a3-415245fb35e1";

/**
 * The pre-2026 hardcoded default voice. Treated as "unset" by resolveVoiceId so
 * users who never explicitly chose a voice transition to the new defaults.
 */
export const LEGACY_DEFAULT_VOICE_ID = "156fb8d2-335b-4950-9cb3-a2d33befec77";

export type VoicePurpose = "reading" | "assistant";

/** generation_config.speed range (1.0 = original). Our chosen baseline is 1.2. */
export const TTS_SPEED_MIN = 0.6;
export const TTS_SPEED_MAX = 1.5;
export const TTS_DEFAULT_SPEED = 1.2;
/** generation_config.volume range (1.0 = original). */
export const TTS_DEFAULT_VOLUME = 1.0;

/**
 * Client-side WebPlayer buffer (seconds). Higher than the old 0.25s, which
 * caused stream underruns heard as choppy "pauses"; tune in one place.
 */
export const TTS_PLAYBACK_BUFFER_SEC = 0.7;

/** A user's explicit voice preference wins; otherwise the purpose default. */
export function resolveVoiceId(
  userVoiceId: string | null | undefined,
  purpose: VoicePurpose,
): string {
  const v = (userVoiceId ?? "").trim();
  if (v && v !== LEGACY_DEFAULT_VOICE_ID) return v;
  return purpose === "reading" ? READING_VOICE_ID : ASSISTANT_VOICE_ID;
}

/** Clamp a stored speed to the valid generation_config range, else the default. */
export function resolveSpeed(userSpeed: number | null | undefined): number {
  if (
    typeof userSpeed === "number" &&
    userSpeed >= TTS_SPEED_MIN &&
    userSpeed <= TTS_SPEED_MAX
  ) {
    return userSpeed;
  }
  return TTS_DEFAULT_SPEED;
}

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
  if (opts?.emotion) cfg.emotion = opts.emotion;
  return cfg;
}
