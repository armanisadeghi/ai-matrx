/**
 * features/audio/utils/audio-mime.ts
 *
 * THE single source of truth for presenting recorded / uploaded audio to any
 * server (Groq transcription routes, the cld_files upload endpoint, the
 * URL-based fallback). Use it at EVERY boundary where an audio Blob becomes a
 * `File` that leaves the browser.
 *
 * ─── Why this exists ───────────────────────────────────────────────────────
 * WebM and MP4 are *containers* — the same magic bytes carry either audio or
 * video. When a multipart `file` part arrives with no Content-Type, an
 * `application/octet-stream` type, a `video/*` type, or a parameterized type
 * like `audio/webm;codecs=opus`, the server's magic-byte sniffer cannot tell
 * audio from video and defaults WebM → `video/webm` and MP4 → `video/mp4`
 * (the MP4 branch even short-circuits before any disambiguation). The result:
 * every microphone recording lands in cld_files tagged as a VIDEO and renders
 * with a video player in the UI.
 *
 * `MediaRecorder` legitimately needs the `;codecs=opus` suffix to *record*, and
 * `Blob.type` after assembly is frequently empty or the raw codec string — so
 * the recorder MIME is never a safe thing to forward verbatim. The browser sets
 * a multipart part's `Content-Type` header from `File.type`, so a clean
 * `audio/*` `File.type` is the strongest, most portable signal we can send. This
 * module guarantees that signal regardless of how flaky the source blob is.
 *
 * Rule: never hand-build a `new File([audioBlob], name, { type })` for audio at
 * a send/upload site. Call `toAudioFile(blob, ...)` (or, if you only need the
 * string, `normalizeAudioContentType(...)`).
 */

/** Clean, parameter-free audio MIME types the transcription stack accepts. */
export type AudioContentType =
  | "audio/webm"
  | "audio/ogg"
  | "audio/wav"
  | "audio/mpeg"
  | "audio/mp4"
  | "audio/flac";

/** Fallback used when nothing else can be inferred — every recorder we run
 * produces WebM/Opus, so this is the safe default for a typeless recording. */
export const DEFAULT_AUDIO_CONTENT_TYPE: AudioContentType = "audio/webm";

const EXT_TO_AUDIO_MIME: Record<string, AudioContentType> = {
  webm: "audio/webm",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  wave: "audio/wav",
  mp3: "audio/mpeg",
  mpga: "audio/mpeg",
  mpeg: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  flac: "audio/flac",
};

const AUDIO_MIME_TO_EXT: Record<AudioContentType, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/flac": "flac",
};

/**
 * Map any raw type/extension to a clean `audio/*` content type.
 *
 * Handles, in order: parameterized recorder types (`audio/webm;codecs=opus`),
 * already-clean audio types, the ambiguous `video/*` + `application/*`
 * container types our own recorders and the sniffer produce, and finally a
 * filename-extension inference. Always returns a valid `audio/*` string.
 */
export function normalizeAudioContentType(
  rawType?: string | null,
  fileName?: string | null,
): AudioContentType {
  // Strip any parameters (`;codecs=opus`, `; charset=...`) and normalize case.
  const base = (rawType ?? "").split(";")[0].trim().toLowerCase();

  // Already a clean audio type we recognize.
  if (base.startsWith("audio/")) {
    const known = base as AudioContentType;
    if (known in AUDIO_MIME_TO_EXT) return known;
    // Unknown audio subtype (e.g. `audio/x-m4a`, `audio/vnd.wave`) — fall
    // through to extension inference but never below `audio/*`.
    const fromExt = inferFromExtension(fileName);
    return fromExt ?? DEFAULT_AUDIO_CONTENT_TYPE;
  }

  // Ambiguous containers the sniffer mislabels as video — re-claim as audio.
  switch (base) {
    case "video/webm":
    case "application/webm":
      return "audio/webm";
    case "video/ogg":
    case "application/ogg":
      return "audio/ogg";
    case "video/mp4":
    case "application/mp4":
    case "video/quicktime": // .mov audio extraction; Groq accepts mp4 audio
      return "audio/mp4";
    default:
      break;
  }

  // No usable type (empty / `application/octet-stream`) — infer from name.
  return inferFromExtension(fileName) ?? DEFAULT_AUDIO_CONTENT_TYPE;
}

function inferFromExtension(fileName?: string | null): AudioContentType | null {
  if (!fileName) return null;
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return EXT_TO_AUDIO_MIME[ext] ?? null;
}

/** The canonical file extension (no dot) for a clean audio content type. */
export function audioExtensionForType(type: AudioContentType): string {
  return AUDIO_MIME_TO_EXT[type];
}

export interface ToAudioFileOptions {
  /**
   * Exact filename to use. When omitted, a name is derived from `prefix`
   * (or the source `File.name`) plus the normalized extension.
   */
  fileName?: string;
  /** Base name used when no `fileName` and the blob isn't a named `File`. */
  prefix?: string;
}

/**
 * Wrap an audio `Blob` in a `File` that carries a clean `audio/*` MIME type and
 * a matching extension — the form the server can classify unambiguously.
 *
 * - Normalizes the content type (see `normalizeAudioContentType`).
 * - Derives the extension from the normalized type so name and type never
 *   disagree (e.g. a `video/webm` blob becomes `recording.webm` + `audio/webm`).
 * - Preserves a meaningful base name when the source is already a `File`.
 */
export function toAudioFile(
  blob: Blob,
  options: ToAudioFileOptions = {},
): File {
  const sourceName = blob instanceof File && blob.name ? blob.name : undefined;

  const contentType = normalizeAudioContentType(blob.type, sourceName);
  const ext = audioExtensionForType(contentType);

  let fileName = options.fileName;
  if (!fileName) {
    const base = baseNameWithoutExt(sourceName) ?? options.prefix ?? "audio";
    fileName = `${base}.${ext}`;
  } else if (!fileName.toLowerCase().endsWith(`.${ext}`)) {
    // Caller-supplied name without the right extension — append it so the
    // server's extension check agrees with the content type.
    fileName = `${baseNameWithoutExt(fileName) ?? fileName}.${ext}`;
  }

  return new File([blob], fileName, { type: contentType });
}

function baseNameWithoutExt(fileName?: string | null): string | null {
  if (!fileName) return null;
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? fileName : fileName.slice(0, dot);
}
