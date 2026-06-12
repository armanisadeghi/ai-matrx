/**
 * Audio Transcription Constants
 *
 * Single source of truth for all audio recording and transcription limits.
 * Based on Groq Developer Plan + Vercel Pro Plan actual constraints.
 */

// ── Groq Developer Plan limits ──────────────────────────────────────────────
export const GROQ_LIMITS = {
  MAX_DIRECT_UPLOAD_BYTES: 25 * 1024 * 1024, // 25 MB — direct file upload
  MAX_URL_UPLOAD_BYTES: 100 * 1024 * 1024, // 100 MB — via URL parameter
  RPM: 20, // requests per minute
  RPD: 2_000, // requests per day
  AUDIO_SECONDS_PER_HOUR: 7_200, // 2 hours of audio per hour wall-time
  AUDIO_SECONDS_PER_DAY: 28_800, // 8 hours of audio per day
  MIN_BILLED_SECONDS: 10, // minimum billed per request
  OPTIMAL_SEGMENT_SECONDS: 30, // model-optimized segment length
  MODEL: "whisper-large-v3-turbo" as const,
} as const;

// ── Vercel Pro Plan limits ──────────────────────────────────────────────────
export const VERCEL_LIMITS = {
  MAX_BODY_BYTES: 4.5 * 1024 * 1024, // 4.5 MB — hard limit, all plans
  MAX_FUNCTION_DURATION_DEFAULT: 300, // 300s default
  MAX_FUNCTION_DURATION_FLUID: 800, // 800s with Fluid Compute
} as const;

// ── Recording limits (derived from provider constraints) ────────────────────
export const AUDIO_LIMITS = {
  MAX_CHUNK_SIZE_BYTES: 4 * 1024 * 1024, // 4 MB — safely under Vercel 4.5 MB
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100 MB — Groq Developer via URL
  MAX_DURATION_SECONDS: 3_600, // 60 min practical limit
  WARN_DURATION_SECONDS: 3_000, // Warn at 50 min
  CHUNK_DURATION_MS: 2_000, // 2 seconds per streaming chunk
  ESTIMATED_BYTES_PER_SECOND: 16_000, // ~128kbps for webm/opus
  MIN_CHUNK_BYTES: 1_024, // Skip chunks under 1 KB
  CHUNK_FETCH_TIMEOUT_MS: 30_000, // Abort a chunk transcription that hangs (bad network) so finalize never wedges
} as const;

// ── Retry configuration ─────────────────────────────────────────────────────
export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  BASE_DELAY_MS: 1_000,
  MAX_DELAY_MS: 8_000,
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 504] as readonly number[],
} as const;

// ── API routes ──────────────────────────────────────────────────────────────
export const AUDIO_API_ROUTES = {
  TRANSCRIBE: "/api/audio/transcribe",
  TRANSCRIBE_URL: "/api/audio/transcribe-url",
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
