/**
 * Fire-and-forget GLiNER2 label for a freshly saved draft transcript.
 *
 * Voice Pad and other FE-direct Supabase saves bypass the prod NOTIFY
 * listener, so we call the Python content-label endpoint explicitly and
 * persist to the transcripts row when the title is still a placeholder.
 */

import { postJson } from "@/lib/python-client";

const TITLE_MIN_CHARS = 8;
const LABEL_INPUT_MAX_CHARS = 8000;
const LABEL_MAX_CHARS = 50;

export async function autoLabelDraftTranscript(
  transcriptId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length < TITLE_MIN_CHARS) return;

  await postJson("/api/content-label", {
    text: trimmed.slice(0, LABEL_INPUT_MAX_CHARS),
    content_type: "transcript",
    label_max_chars: LABEL_MAX_CHARS,
    persist_transcript_id: transcriptId,
    persist_label: true,
  });
}
