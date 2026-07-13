/**
 * Fire-and-forget GLiNER2 label for a freshly saved draft transcript.
 *
 * Voice Pad and other FE-direct Supabase saves bypass the prod NOTIFY
 * listener, so we call the Python content-label endpoint explicitly and
 * persist to the transcripts row when the title is still a placeholder.
 */

import { apiPost } from "@/lib/api/typed-client";

const TITLE_MIN_CHARS = 8;
const LABEL_INPUT_MAX_CHARS = 8000;
const LABEL_MAX_CHARS = 50;

export async function autoLabelDraftTranscript(
  transcriptId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length < TITLE_MIN_CHARS) return;

  // Was POSTing to "/api/content-label" — a path that exists on NEITHER the
  // Next app NOR the aidream backend (the real route is "/content-label", no
  // "/api" prefix), so auto-labeling 404'd silently for every FE-direct save.
  // Bound to the contract so the wrong path can't come back (it wouldn't type).
  await apiPost("/content-label", {
    text: trimmed.slice(0, LABEL_INPUT_MAX_CHARS),
    content_type: "transcript",
    label_max_chars: LABEL_MAX_CHARS,
    persist_transcript_id: transcriptId,
    persist_label: true,
  });
}
