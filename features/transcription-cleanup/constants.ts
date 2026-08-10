// features/transcription-cleanup/constants.ts
//
// Tiny, dependency-free constants shared by CleanupPad (heavy, code-split) and
// external hosts that must address the pad's VoicePad slice keys WITHOUT
// importing the pad's component graph (e.g. the War Room room-level recording
// controller committing a finalized transcript while the pad is unmounted).
// Keep this file free of component imports so it never drags the pad bundle
// into a host chunk.

/** The pad family's voicePad slice `overlayId` (page + every embedded pad). */
export const CLEANUP_OVERLAY_ID = "transcriptionCleanupPage" as const;

/**
 * VoicePad slice `instanceId` for a pad — isolates each pad's transcript
 * draft/entries. Embedded pads are keyed by their pinned session id so two
 * tiles never collide on the "main" key; the standalone page keeps "main".
 * MUST stay in lockstep with CleanupPad's INSTANCE_ID derivation.
 */
export function cleanupVoicePadInstanceId(
  sessionId?: string | null,
): string {
  return sessionId ? `embedded:${sessionId}` : "main";
}

/**
 * How a text write target folds a new value into a pane that already has
 * text — the vocabulary for the `mode` field of the `cleaned_transcript_text`
 * and `custom_output_text` surface write targets.
 *
 * Canonical here (not a bare local literal in the handler) so the pad's
 * validation and the manifest prose that advertises it to agents can never
 * drift apart. `transcripts-cleanup.manifest.ts` spells these out in its
 * target descriptions; `CleanupPad` validates against THIS array.
 */
export const CLEANUP_TEXT_WRITE_MODES = ["replace", "append"] as const;

export type CleanupTextWriteMode = (typeof CLEANUP_TEXT_WRITE_MODES)[number];

/** Mode assumed when a write target omits `mode`. */
export const CLEANUP_TEXT_WRITE_MODE_DEFAULT: CleanupTextWriteMode = "replace";
