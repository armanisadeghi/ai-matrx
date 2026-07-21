/**
 * features/media-capture/core/capture-types.ts
 *
 * Pure type contracts for the media-capture system. NO DOM side effects.
 *
 * `CaptureMetadata` is the versioned, snake_case discriminated union persisted
 * verbatim as `files.files.metadata.capture` (schema v1 — frozen in the
 * cross-repo system of record: common-docs/media-capture/FEATURE.md).
 *
 * Invariants (docs/media-capture-plan.md §5):
 * - Output width/height/duration_ms live in canonical `files.files` columns —
 *   never duplicated here.
 * - NEVER persisted: deviceId, groupId, device labels (hardware-identifying).
 *   `isCaptureMetadata` rejects them anywhere in the object.
 * - The emitted/final Blob MIME (`recorder_mime_type`) is authoritative.
 */

// ─── Framing + quality (shared with geometry.ts / constraints.ts) ───────────

/** How the capture output relates to the preview the user saw. */
export type FramingMode = "full-frame" | "viewport-crop";

/** Requested quality profile — a stream-selection preference, never a sensor guarantee. */
export type CaptureQualityProfile = "maximum-available" | "1080p" | "720p";

// ─── Capture metadata schema (v1) — EXACTLY as ratified in the plan §2 ──────

export type CaptureSource = "browser-media-devices" | "capture-input" | "import";

export type CaptureMetadataBase = {
  version: 1;
  captured_at: string; // ISO
  source: CaptureSource;
  source_feature: string; // "camera" | "pdf-scanner" | ...
};

export type VisualSourceSettings = {
  width: number;
  height: number;
  frame_rate: number | null;
  facing_mode: "user" | "environment" | null;
};

export type PhotoCaptureMetadata = CaptureMetadataBase & {
  artifact_kind: "photo";
  source_settings: VisualSourceSettings;
  framing: FramingMode;
  mirrored_output: boolean;
};

export type VideoCaptureMetadata = CaptureMetadataBase & {
  artifact_kind: "video";
  source_settings: VisualSourceSettings;
  framing: FramingMode;
  mirrored_output: boolean;
  has_audio: boolean;
  recorder_mime_type: string; // actual emitted/final Blob MIME
};

export type AudioCaptureMetadata = CaptureMetadataBase & {
  artifact_kind: "audio";
  recorder_mime_type: string; // actual emitted/final Blob MIME
};

export type CaptureMetadata =
  | PhotoCaptureMetadata
  | VideoCaptureMetadata
  | AudioCaptureMetadata;

// ─── Capture state contracts (consumed by the Capture Studio) ───────────────

/**
 * Terminal error kinds — every one is explicit and user-visible (invariant 10).
 */
export type CaptureErrorKind =
  | "permission-denied"
  | "device-removed"
  | "stream-ended"
  | "unsupported-codec"
  | "storage-quota"
  | "upload-failure"
  | "mic-conflict"
  | "lock-takeover";

export type CaptureStatus =
  | "idle"
  | "preview"
  | "capturing" // still-photo shutter in flight
  | "recording"
  | "paused"
  | "reviewing"
  | "saving"
  | "saved"
  | "error";

export type CaptureState =
  | { status: Exclude<CaptureStatus, "error"> }
  | { status: "error"; error: CaptureError };

export interface CaptureError {
  kind: CaptureErrorKind;
  /** Human-readable, user-visible explanation. Never empty. */
  message: string;
}

// ─── Runtime validator ───────────────────────────────────────────────────────

/**
 * Keys that must never appear anywhere in persisted capture metadata
 * (hardware-identifying — invariant 8). Both camelCase and snake_case spellings
 * are rejected defensively.
 */
const FORBIDDEN_KEYS = new Set([
  "deviceId",
  "device_id",
  "groupId",
  "group_id",
  "label",
]);

const BASE_KEYS = ["version", "captured_at", "source", "source_feature", "artifact_kind"] as const;

const ALLOWED_KEYS_BY_KIND: Record<string, ReadonlySet<string>> = {
  photo: new Set([...BASE_KEYS, "source_settings", "framing", "mirrored_output"]),
  video: new Set([
    ...BASE_KEYS,
    "source_settings",
    "framing",
    "mirrored_output",
    "has_audio",
    "recorder_mime_type",
  ]),
  audio: new Set([...BASE_KEYS, "recorder_mime_type"]),
};

const VALID_SOURCES: ReadonlySet<string> = new Set([
  "browser-media-devices",
  "capture-input",
  "import",
]);

const VALID_FRAMINGS: ReadonlySet<string> = new Set(["full-frame", "viewport-crop"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  if (!isPlainObject(value)) return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (containsForbiddenKey(nested)) return true;
  }
  return false;
}

function isVisualSourceSettings(value: unknown): value is VisualSourceSettings {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  const allowed = new Set(["width", "height", "frame_rate", "facing_mode"]);
  if (keys.length !== allowed.size || keys.some((k) => !allowed.has(k))) return false;
  const { width, height, frame_rate, facing_mode } = value;
  if (typeof width !== "number" || !Number.isFinite(width)) return false;
  if (typeof height !== "number" || !Number.isFinite(height)) return false;
  if (frame_rate !== null && (typeof frame_rate !== "number" || !Number.isFinite(frame_rate))) {
    return false;
  }
  if (facing_mode !== null && facing_mode !== "user" && facing_mode !== "environment") {
    return false;
  }
  return true;
}

/**
 * Strict runtime validator for persisted capture metadata.
 *
 * Rejects: wrong/missing version, unknown or camelCase keys, invalid variant
 * fields, and ANY hardware-identifying key (deviceId/groupId/label, either
 * casing) anywhere in the object graph.
 */
export function isCaptureMetadata(value: unknown): value is CaptureMetadata {
  if (!isPlainObject(value)) return false;
  if (containsForbiddenKey(value)) return false;

  if (value.version !== 1) return false;
  if (typeof value.captured_at !== "string" || value.captured_at.length === 0) return false;
  if (typeof value.source !== "string" || !VALID_SOURCES.has(value.source)) return false;
  if (typeof value.source_feature !== "string" || value.source_feature.length === 0) return false;

  const kind = value.artifact_kind;
  if (kind !== "photo" && kind !== "video" && kind !== "audio") return false;

  // Strict: no unknown keys for the variant (this also rejects camelCase drift).
  const allowed = ALLOWED_KEYS_BY_KIND[kind];
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return false;
  }
  // All required keys present.
  for (const key of allowed) {
    if (!(key in value)) return false;
  }

  if (kind === "photo" || kind === "video") {
    if (!isVisualSourceSettings(value.source_settings)) return false;
    if (typeof value.framing !== "string" || !VALID_FRAMINGS.has(value.framing)) return false;
    if (typeof value.mirrored_output !== "boolean") return false;
  }
  if (kind === "video") {
    if (typeof value.has_audio !== "boolean") return false;
  }
  if (kind === "video" || kind === "audio") {
    if (typeof value.recorder_mime_type !== "string" || value.recorder_mime_type.length === 0) {
      return false;
    }
  }
  return true;
}
