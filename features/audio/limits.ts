/**
 * features/audio/limits.ts — THE resolution point for every audio and
 * transcription CEILING in this repo.
 *
 * Until 2026-09-17 these numbers were literals in `features/audio/constants.ts`:
 * 100 MB and 60 minutes, refusing a 9-hour audiobook at the door while
 * `aidream/aidream/services/audio/file_transcription.py` had for months been
 * splitting arbitrarily long audio into provider-sized windows and stitching
 * the timestamps back together. The client gate was a stale constant guarding
 * a capability the server already had.
 *
 * Every value here is a `platform.feature_knob` row under the feature
 * `media.transcription`, seeded by `migrations/audio_transcription_limits_knobs.sql`
 * and resolved through THE settings ladder (`platform.knob_resolve`:
 * organization → user → device, nearest wins) via `lib/scoped-config/sessionKnob`.
 * An admin turns them at Users & Access → Limits & Knobs
 * (`/administration/users/limits`); an organization overrides them at
 * Organization settings → Configuration.
 *
 * TWO LANES, and they are never the same number:
 *   `uploadLimits()`    — a file the person hands us. The server chunks it,
 *                         so the ceiling only catches an obviously wrong file.
 *   `recordingLimits()` — a LIVE browser capture, held in tab memory until it
 *                         is saved. A genuinely smaller practical ceiling —
 *                         and a knob, not a constant, for the same reason.
 *
 * 🚨 THERE IS NO CODE FALLBACK CEILING. When a knob cannot be resolved (no
 * active organization, an offline browser, a deleted row) the resolver returns
 * `resolved: false` with a `reason`, and the caller must SAY SO rather than
 * quietly applying a number nobody set. `lib/knobs/featureKnobs.ts` raises for
 * the same reason; on this client lane the answer is announced instead, because
 * a person mid-recording must never lose their capture to a failed read.
 */

import { resolveSessionKnob } from "@/lib/scoped-config/sessionKnob";
import { formatFileSize } from "@ai-matrx/kit/format";

/** The one feature namespace these rows live under. */
export const AUDIO_LIMITS_FEATURE = "media.transcription";

/**
 * Every knob this module reads, by its bare key. The full address a resolver
 * takes is `${AUDIO_LIMITS_FEATURE}.${key}`; `audioLimitKnobKey` builds it so
 * no call site ever hand-types one.
 */
export const AUDIO_LIMIT_KNOBS = {
  /** Upload lane — the longest file someone may hand us. */
  UPLOAD_MAX_DURATION_SECONDS: "upload_max_duration_seconds",
  /** Upload lane — the largest file someone may hand us. */
  UPLOAD_MAX_FILE_SIZE_BYTES: "upload_max_file_size_bytes",
  /** Recording lane — when a live browser capture stops itself. */
  RECORDING_MAX_DURATION_SECONDS: "recording_max_duration_seconds",
  /** Recording lane — when a live browser capture starts warning. */
  RECORDING_WARN_DURATION_SECONDS: "recording_warn_duration_seconds",
  /** Recording lane — the blob ceiling a live capture stops itself at. */
  RECORDING_MAX_FILE_SIZE_BYTES: "recording_max_file_size_bytes",
  /** Live dictation — audio carried by each interim transcription request. */
  RECORDING_CHUNK_ROTATION_MS: "recording_chunk_rotation_ms",
  /** Live dictation — how long one chunk request may hang before abandonment. */
  CHUNK_FETCH_TIMEOUT_MS: "chunk_fetch_timeout_ms",
  /** The expensive-click line: audio at least this long is priced and confirmed. */
  ESTIMATE_CONFIRM_MIN_DURATION_SECONDS: "estimate_confirm_min_duration_seconds",
  /** The rate an estimate quotes, in USD per hour of audio. */
  ESTIMATED_COST_PER_AUDIO_HOUR_USD: "estimated_cost_per_audio_hour_usd",
  /** The rate an estimate quotes, in wall-clock seconds per hour of audio. */
  ESTIMATED_SECONDS_PER_AUDIO_HOUR: "estimated_seconds_per_audio_hour",
  /** Audio upload — retry attempts after a retryable failure. */
  UPLOAD_RETRY_MAX_ATTEMPTS: "upload_retry_max_attempts",
  /** Audio upload — first backoff delay. */
  UPLOAD_RETRY_BASE_DELAY_MS: "upload_retry_base_delay_ms",
  /** Audio upload — backoff ceiling. */
  UPLOAD_RETRY_MAX_DELAY_MS: "upload_retry_max_delay_ms",
} as const;

export type AudioLimitKnob =
  (typeof AUDIO_LIMIT_KNOBS)[keyof typeof AUDIO_LIMIT_KNOBS];

/** The full ladder address of one audio limit — never hand-typed anywhere. */
export function audioLimitKnobKey(knob: AudioLimitKnob): string {
  return `${AUDIO_LIMITS_FEATURE}.${knob}`;
}

/**
 * The answer to "what is this ceiling?", which is allowed to be "we could not
 * find out" — never a number nobody set.
 */
export type ResolvedLimit =
  | { resolved: true; value: number }
  | { resolved: false; reason: string };

const UNRESOLVED_REASON =
  "This organization's audio limits could not be read just now. " +
  "An administrator sets them under Users & Access → Limits & Knobs; " +
  "an organization overrides them under Organization settings → Configuration.";

async function resolveNumber(knob: AudioLimitKnob): Promise<ResolvedLimit> {
  const address = audioLimitKnobKey(knob);
  let raw: unknown;
  try {
    raw = await resolveSessionKnob(address);
  } catch (error) {
    console.error(
      `[audio/limits] ${address} could not be resolved; the ceiling is NOT being applied:`,
      error,
    );
    return { resolved: false, reason: UNRESOLVED_REASON };
  }
  if (raw === undefined || raw === null) {
    console.error(
      `[audio/limits] ${address} resolved to nothing (no active organization, ` +
        `or the knob row is missing). The ceiling is NOT being applied — seed ` +
        `the row with migrations/audio_transcription_limits_knobs.sql.`,
    );
    return { resolved: false, reason: UNRESOLVED_REASON };
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    console.error(
      `[audio/limits] ${address} is not a number: ${String(raw)}. The ceiling is NOT being applied.`,
    );
    return { resolved: false, reason: UNRESOLVED_REASON };
  }
  return { resolved: true, value };
}

/** A pair of ceilings for one lane, each independently resolvable. */
export interface LaneLimits {
  maxDurationSeconds: ResolvedLimit;
  maxFileSizeBytes: ResolvedLimit;
}

/** The upload lane: a file the person hands us; the server chunks it. */
export async function uploadLimits(): Promise<LaneLimits> {
  const [maxDurationSeconds, maxFileSizeBytes] = await Promise.all([
    resolveNumber(AUDIO_LIMIT_KNOBS.UPLOAD_MAX_DURATION_SECONDS),
    resolveNumber(AUDIO_LIMIT_KNOBS.UPLOAD_MAX_FILE_SIZE_BYTES),
  ]);
  return { maxDurationSeconds, maxFileSizeBytes };
}

/** The live browser-recording lane: a separate, deliberately smaller ceiling. */
export async function recordingLimits(): Promise<
  LaneLimits & { warnDurationSeconds: ResolvedLimit }
> {
  const [maxDurationSeconds, maxFileSizeBytes, warnDurationSeconds] =
    await Promise.all([
      resolveNumber(AUDIO_LIMIT_KNOBS.RECORDING_MAX_DURATION_SECONDS),
      resolveNumber(AUDIO_LIMIT_KNOBS.RECORDING_MAX_FILE_SIZE_BYTES),
      resolveNumber(AUDIO_LIMIT_KNOBS.RECORDING_WARN_DURATION_SECONDS),
    ]);
  return { maxDurationSeconds, maxFileSizeBytes, warnDurationSeconds };
}

/** One ceiling, awaited, for call sites that need exactly one. */
export function resolveAudioLimit(knob: AudioLimitKnob): Promise<ResolvedLimit> {
  return resolveNumber(knob);
}

// ── Honest refusals ─────────────────────────────────────────────────────────
//
// "File too large" is a lie of omission: it names neither the limit nor what
// the person can do about it. Every refusal below names the actual number, the
// lane it belongs to, and the remedy.

/** `h:mm:ss` / `m:ss` — the length format a person reads next to a cost. */
export function formatClock(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const mm = String(minutes).padStart(hours > 0 ? 2 : 1, "0");
  const ss = String(seconds).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function overSizeMessage(
  actualBytes: number,
  limitBytes: number,
  lane: "upload" | "recording",
): string {
  const where =
    lane === "upload"
      ? "An administrator can raise the uploaded-audio size limit under Users & Access → Limits & Knobs, or your organization can raise it under Organization settings → Configuration."
      : "A live browser recording is held in this tab's memory, so its limit is deliberately lower than the upload limit. Record to a file and upload it instead, or ask an administrator to raise the browser-recording size limit.";
  return (
    `This audio is ${formatFileSize(actualBytes)}, and the current limit is ` +
    `${formatFileSize(limitBytes)}. ${where}`
  );
}

export function overDurationMessage(
  actualSeconds: number,
  limitSeconds: number,
  lane: "upload" | "recording",
): string {
  const where =
    lane === "upload"
      ? "An administrator can raise the uploaded-audio length limit under Users & Access → Limits & Knobs, or your organization can raise it under Organization settings → Configuration."
      : "A live browser recording is held in this tab's memory, so its limit is deliberately lower than the upload limit. Record to a file and upload it instead, or ask an administrator to raise the browser-recording length limit.";
  return (
    `This audio runs ${formatClock(actualSeconds)}, and the current limit is ` +
    `${formatClock(limitSeconds)}. ${where}`
  );
}

// ── The estimate behind the expensive click ─────────────────────────────────

export interface TranscriptionEstimate {
  durationSeconds: number;
  /** `h:mm:ss`, ready to show. */
  durationLabel: string;
  /** USD, an ESTIMATE — never presented as a charge. */
  costUsd: number;
  costLabel: string;
  /** Wall-clock seconds this is expected to take. */
  processingSeconds: number;
  processingLabel: string;
  /** False when a rate knob could not be read; the labels then say so. */
  rated: boolean;
}

function humanDuration(totalSeconds: number): string {
  const whole = Math.max(0, Math.round(totalSeconds));
  if (whole < 60) return `${whole} second${whole === 1 ? "" : "s"}`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = whole / 3600;
  return `about ${hours.toFixed(1)} hours`;
}

/**
 * Length, estimated cost, estimated time — the three facts the expensive-click
 * law requires a person to SEE before transcription spends anything. Both rates
 * are knobs; when one cannot be read the estimate says it could not be priced
 * rather than inventing a number.
 */
export async function estimateTranscription(
  durationSeconds: number,
): Promise<TranscriptionEstimate> {
  const [rate, speed] = await Promise.all([
    resolveNumber(AUDIO_LIMIT_KNOBS.ESTIMATED_COST_PER_AUDIO_HOUR_USD),
    resolveNumber(AUDIO_LIMIT_KNOBS.ESTIMATED_SECONDS_PER_AUDIO_HOUR),
  ]);
  const hours = durationSeconds / 3600;
  const rated = rate.resolved && speed.resolved;
  const costUsd = rate.resolved ? hours * rate.value : 0;
  const processingSeconds = speed.resolved ? hours * speed.value : 0;
  return {
    durationSeconds,
    durationLabel: formatClock(durationSeconds),
    costUsd,
    costLabel: rate.resolved
      ? costUsd < 0.01
        ? "under $0.01"
        : `about $${costUsd.toFixed(2)}`
      : "could not be priced — the transcription rate could not be read",
    processingSeconds,
    processingLabel: speed.resolved
      ? humanDuration(processingSeconds)
      : "could not be estimated — the processing-rate setting could not be read",
    rated,
  };
}

/** Whether this length crosses the confirm-before-spending line. */
export async function transcriptionNeedsConfirmation(
  durationSeconds: number,
): Promise<boolean> {
  const threshold = await resolveNumber(
    AUDIO_LIMIT_KNOBS.ESTIMATE_CONFIRM_MIN_DURATION_SECONDS,
  );
  // An unreadable threshold CONFIRMS. Skipping the dialog would be a silent
  // spend, which is the one outcome this line exists to prevent.
  if (!threshold.resolved) return true;
  return durationSeconds >= threshold.value;
}
