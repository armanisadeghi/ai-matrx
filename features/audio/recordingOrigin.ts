// features/audio/recordingOrigin.ts
//
// THE RECORDING ORIGIN — where a dictation came from.
//
// WHY THIS EXISTS (Arman, 2026-08-17):
//   "If any of it was audio — because I transcribed it using the smart agent
//    input or some other mechanism — we should even have the audio… The bottom
//    line is we need that full tracking."
//
// ProTextarea dictation was ALWAYS persisted: the shared recorder uploads the
// full recording through the canonical file handler and writes a
// `transcripts.transcripts` row with `audio_file_path`. What was missing was
// ATTRIBUTION — that row carried no link to the conversation, message, or
// record it was dictated into, so it landed in the Expert's general Recordings
// folder under a topic label with no way back to the thing it belongs to.
//
// This module is the generic stamp. It is NOT a Masterwork type: every
// ProTextarea in the platform can declare an origin, and every surface that
// declares none keeps working exactly as before (origin is always optional).
//
// It is framework-free on purpose (no React, no Redux) so it can be referenced
// from the Redux slice, the recorder hook, and the transcripts service without
// dragging any graph along. The React side is `RecordingOriginProvider.tsx`.

/**
 * Where a recording came from. Every field except `surface` is optional so a
 * surface can declare as much as it honestly knows.
 *
 * Persisted verbatim at `transcripts.transcripts.metadata.origin` (an existing
 * jsonb column — no schema change was needed), which is also what the reading
 * side queries: `metadata->origin->>conversationId`.
 */
export interface RecordingOrigin {
  /**
   * Dotted surface id — who was recording. Use the surface's canonical name,
   * e.g. `"masterwork.interview"`. Required: an origin with no surface is
   * indistinguishable from no origin at all.
   */
  surface: string;
  /** The conversation the dictation was typed into, when there is one. */
  conversationId?: string;
  /**
   * Canonical entity token of the record this belongs to (`"rulebook"`,
   * `"note"`, …) — the same vocabulary `EntityRef` / `platform.associations`
   * use, so a door can be built from it without a per-surface lookup table.
   */
  entityToken?: string;
  /** Id of that record. */
  entityId?: string;
  /**
   * Human name of the thing being worked on ("SEO Keyword Optimization").
   * Used for the honest fallback title and for the door's link text.
   */
  label?: string;
  /**
   * In-app path back to the thing. THE DOOR LAW — a transcript that knows what
   * it belongs to must be able to open it.
   */
  href?: string;
}

/**
 * The title a dictation gets when its origin is known and the auto-labeler has
 * not (yet) replaced it. A generic "Voice Pad Recording" is precisely why
 * Arman's own words were unfindable; this is the honest fallback.
 */
export function recordingTitleFor(
  origin: RecordingOrigin | null | undefined,
  when = new Date(),
): string {
  if (!origin?.label) return "Voice Pad Recording";
  const date = when.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${origin.label} — dictated ${date}`;
}

/** One-line description stamped on the transcript row. Plain, human, honest. */
export function recordingDescriptionFor(
  origin: RecordingOrigin | null | undefined,
): string {
  if (!origin) return "";
  if (origin.label) return `Dictated into ${origin.label}.`;
  return `Dictated on ${origin.surface}.`;
}

/**
 * THE DICTATION ROW — the exact `transcripts.transcripts` payload the shared
 * recorder auto-persists when a recording finishes.
 *
 * Extracted from `useChunkedRecordAndTranscribe` so it is (a) written ONCE
 * instead of once per success/failure branch — the two copies of the literal
 * are how the origin stamp could have applied to only one of them — and (b)
 * callable outside a live MediaRecorder, which is the only way this path can be
 * exercised anywhere the microphone is unavailable.
 *
 * `audio_file_path` is added by the caller once the upload lands; on upload
 * failure the same payload is saved without it, so the words are never lost.
 */
export function buildDictationDraft(args: {
  text: string;
  durationSec: number;
  origin?: RecordingOrigin | null;
  now?: Date;
}) {
  const origin = args.origin ?? null;
  const now = args.now ?? new Date();
  return {
    // An honest fallback name. The GLiNER auto-labeler usually replaces this
    // with a topic label moments later; when it can't, "Voice Pad Recording" is
    // exactly why the Expert could not find their own words.
    title: recordingTitleFor(origin, now),
    description: recordingDescriptionFor(origin),
    segments: [
      {
        id: String(now.getTime()),
        text: args.text,
        seconds: args.durationSec,
        timecode: "0:00",
      },
    ],
    source_type: "audio" as const,
    folder_name: "Recordings",
    // The attribution itself. `metadata` is an existing jsonb column, so this
    // needed no schema change; the reading side queries
    // `metadata->origin->>conversationId`.
    ...(origin ? { metadata: { origin } } : {}),
  };
}

/**
 * Narrow an unknown `metadata.origin` blob back to a `RecordingOrigin`. Reading
 * code must never trust the jsonb shape — a row written before this existed,
 * or by an older client, has no origin at all.
 */
export function parseRecordingOrigin(value: unknown): RecordingOrigin | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (typeof o.surface !== "string" || !o.surface) return null;
  const str = (v: unknown): string | undefined =>
    typeof v === "string" && v.length > 0 ? v : undefined;
  return {
    surface: o.surface,
    conversationId: str(o.conversationId),
    entityToken: str(o.entityToken),
    entityId: str(o.entityId),
    label: str(o.label),
    href: str(o.href),
  };
}
