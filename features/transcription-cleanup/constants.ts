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
