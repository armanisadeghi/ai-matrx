/**
 * features/media-capture/core/mime-selection.ts
 *
 * Recording-format selection: ladders of CONCRETE codec strings (no wildcards,
 * ever) filtered through `MediaRecorder.isTypeSupported` — injected as a
 * function so this module stays pure and unit-testable.
 *
 * `isTypeSupported()` is a hint, not a guarantee: the runtime recorder
 * controller must still confirm by constructing + starting the recorder with
 * fallthrough. The MIME observed on emitted/final Blob data is AUTHORITATIVE
 * for the stored file and its extension (invariant 12); the requested MIME is
 * diagnostics only.
 *
 * Audio extension mapping is shared with (not forked from)
 * `features/audio/utils/audio-mime.ts` — the single source of truth for
 * audio MIME ↔ extension.
 */

import {
  audioExtensionForType,
  normalizeAudioContentType,
} from "@/features/audio/utils/audio-mime";

export type RecordingKind = "video" | "audio";

/** Concrete candidate ladder, best-first (plan §Phase 2). */
const VIDEO_MIME_LADDER: readonly string[] = [
  "video/mp4;codecs=avc1.42000a,mp4a.40.2",
  "video/mp4;codecs=avc1.42000a,opus",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

const AUDIO_MIME_LADDER: readonly string[] = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
];

/**
 * Walk the concrete ladder for `kind`, returning the first candidate the
 * injected `isTypeSupported` accepts, or `null` when none is — meaning
 * "construct the MediaRecorder with no mimeType and let the browser pick its
 * default". `null` is a valid outcome, not an error; an actual all-fail is
 * only known at recorder construction/start time (loud terminal error there).
 */
export function selectRecordingMime(
  kind: RecordingKind,
  isTypeSupported: (type: string) => boolean,
): string | null {
  const ladder = kind === "video" ? VIDEO_MIME_LADDER : AUDIO_MIME_LADDER;
  for (const candidate of ladder) {
    if (isTypeSupported(candidate)) return candidate;
  }
  return null;
}

/** Container (parameter-free, lowercased) MIME → file extension, for the
 * video/image containers this pipeline emits. Audio is delegated to
 * `features/audio/utils/audio-mime.ts`. */
const CONTAINER_TO_EXT: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/ogg": "ogv",
  "video/quicktime": "mov",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * File extension (no dot) for an emitted/final Blob MIME.
 *
 * Parses the container from the MIME — codecs parameters are ignored
 * (`video/webm;codecs=vp9,opus` → `webm`). Audio types route through the
 * canonical audio-mime map (`audio/mp4` → `m4a`, `audio/webm` → `webm`, …).
 *
 * Throws on an empty/unrecognized non-audio container — an unknown emitted
 * MIME is a real defect to surface loudly, never a silent ".bin".
 */
export function extensionForMime(mime: string): string {
  const container = mime.split(";")[0].trim().toLowerCase();
  if (container.length === 0) {
    throw new Error(
      "extensionForMime: empty MIME. The emitted Blob carried no type — the recorder " +
        "controller must substitute the confirmed recording MIME before naming the file.",
    );
  }
  if (container.startsWith("audio/")) {
    return audioExtensionForType(normalizeAudioContentType(container));
  }
  const ext = CONTAINER_TO_EXT[container];
  if (!ext) {
    throw new Error(
      `extensionForMime: unrecognized container "${container}". Add it to the shared map — ` +
        "never guess an extension for an unknown emitted MIME.",
    );
  }
  return ext;
}
