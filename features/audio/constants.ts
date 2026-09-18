/**
 * Audio Transcription Constants
 *
 * 🚨 NO PRODUCT LIMIT LIVES IN THIS FILE. Every ceiling, quota, threshold and
 * cadence for audio and transcription is a `platform.feature_knob` row under
 * the feature `media.transcription`, read through `features/audio/limits.ts`
 * (`uploadLimits()`, `recordingLimits()`, `resolveAudioLimit()`), seeded by
 * `migrations/audio_transcription_limits_knobs.sql`, and turned by an admin at
 * Users & Access → Limits & Knobs or by an organization under Organization
 * settings → Configuration.
 *
 * WHY, and what it cost (2026-09-17): this file used to carry
 * `MAX_FILE_SIZE_BYTES: 100 MB` and `MAX_DURATION_SECONDS: 3600`. An expert who
 * owns a 9-hour audiobook could not get it into AI Matrx, even though
 * `aidream/aidream/services/audio/file_transcription.py` had for months been
 * splitting arbitrarily long audio into provider-sized windows and reassembling
 * it with shifted timestamps. A literal here was guarding a capability the
 * server already had, and nobody could turn it off without a deploy. Law 6
 * (opinions become knobs) + `common-docs/policies/limits-are-knobs-agents-set-them.md`.
 *
 * What remains below is deliberate, and each entry says why it is NOT a knob:
 * a hard platform limit we do not get to choose, a measured physical property
 * of the codec, or a protocol fact. Adding a product limit back here is the
 * defect `features/audio/__tests__/audio-limits-are-knobs.test.ts` fails on.
 */

// ── Vercel platform limits — HARD, not ours to choose ───────────────────────
// 🚨 NOT KNOBS. `MAX_BODY_BYTES` is Vercel's request-body ceiling: 4.5 MB on
// every plan, enforced by the platform before our code runs. Raising a knob
// past it would change nothing except turn a clear refusal into a 413. The two
// function-duration values are likewise Vercel's, set by the plan and the
// Fluid Compute setting, not by us.
export const VERCEL_LIMITS = {
  MAX_BODY_BYTES: 4.5 * 1024 * 1024, // 4.5 MB — hard limit, all plans
  MAX_FUNCTION_DURATION_DEFAULT: 300, // 300s default
  MAX_FUNCTION_DURATION_FLUID: 800, // 800s with Fluid Compute
} as const;

// ── Physical and platform-derived constants (NOT product limits) ────────────
export const AUDIO_CONSTANTS = {
  /**
   * NOT A KNOB — derived from `VERCEL_LIMITS.MAX_BODY_BYTES` above. A streaming
   * chunk must fit inside a request body Vercel will accept; 4 MB sits safely
   * under the hard 4.5 MB with room for the multipart envelope. It moves only
   * when Vercel's hard limit moves.
   */
  MAX_CHUNK_SIZE_BYTES: 4 * 1024 * 1024,
  /**
   * NOT A KNOB — a measured property of the encoder, not an opinion. webm/opus
   * from `MediaRecorder` runs about 128 kbps ≈ 16 KB/s. It is used to PROJECT
   * a recording's size from its elapsed time; turning it would not change what
   * the browser produces, it would only make the projection wrong.
   */
  ESTIMATED_BYTES_PER_SECOND: 16_000,
  /**
   * NOT A KNOB — a correctness floor, not a ceiling. A `MediaRecorder` slice
   * under 1 KB carries no decodable audio, so sending it costs a request and
   * returns nothing.
   */
  MIN_CHUNK_BYTES: 1_024,
} as const;

/**
 * Back-compat alias. The product limits that used to live under this name
 * (`MAX_FILE_SIZE_BYTES`, `MAX_DURATION_SECONDS`, `WARN_DURATION_SECONDS`,
 * `CHUNK_DURATION_MS`, `CHUNK_FETCH_TIMEOUT_MS`) are gone — they are knobs in
 * `features/audio/limits.ts`. What is left is the non-negotiable remainder.
 */
export const AUDIO_LIMITS = AUDIO_CONSTANTS;

// ── Retry configuration ─────────────────────────────────────────────────────
// The attempt count and the two backoff delays are product opinions about how
// hard we fight a flaky network, so they are knobs
// (`upload_retry_max_attempts`, `upload_retry_base_delay_ms`,
// `upload_retry_max_delay_ms`). What stays here is a protocol fact: which HTTP
// statuses are retryable at all.
export const RETRY_CONFIG = {
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504] as readonly number[],
} as const;

// ── API routes ──────────────────────────────────────────────────────────────
export const AUDIO_API_ROUTES = {
  TRANSCRIBE: "/audio/transcribe",
  TRANSCRIBE_URL: "/audio/transcribe-url",
  LOG_ERROR: "/api/audio/log-error",
} as const;

// ── IndexedDB configuration ─────────────────────────────────────────────────
export const SAFETY_STORE_CONFIG = {
  DB_NAME: "matrx_audio_safety",
  STORE_NAME: "recordings",
  DB_VERSION: 1,
} as const;

// ── Allowed MIME types ──────────────────────────────────────────────────────
export const ALLOWED_AUDIO_TYPES = [
  "audio/flac",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/mpga",
  "audio/m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
] as const;

export type RecordingStatus =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "paused"
  | "stopped"
  | "error";

export const RECORDING_ERROR_CODES = {
  PERMISSION_DENIED: "PERMISSION_DENIED",
  NO_MICROPHONE: "NO_MICROPHONE",
  DURATION_EXCEEDED: "DURATION_EXCEEDED",
  SIZE_EXCEEDED: "SIZE_EXCEEDED",
  BROWSER_NOT_SUPPORTED: "BROWSER_NOT_SUPPORTED",
  TRANSCRIPTION_FAILED: "TRANSCRIPTION_FAILED",
  TRANSCRIPTION_ERROR: "TRANSCRIPTION_ERROR",
  RATE_LIMIT: "RATE_LIMIT",
  UPLOAD_FAILED: "UPLOAD_FAILED",
  UNKNOWN: "UNKNOWN",
} as const;
