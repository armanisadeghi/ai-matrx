/**
 * features/transcript-studio/service/assistantContextBuilder.ts
 *
 * Builds the `setContextEntries` payload that turns a session's transcripts
 * into named context objects for the audio-first assistant.
 *
 * Naming contract (so the model understands the relationships):
 *   - `recording_NN_raw`     — verbatim transcript of recording cycle NN.
 *   - `session_cleaned`      — Studio auto-cleanup output (column 2) for the
 *                              whole session. Only present when the desktop
 *                              4-column Studio has run cleanup on this session.
 *   - `cleaned_transcripts`  — Scribe one-shot AI-cleaned version of the raw
 *                              recordings. SAME CONTENT as recording_NN_raw —
 *                              the model should treat this as a duplicate, not
 *                              new information. Persisted in studio_documents
 *                              with kind="scribe_cleanup".
 *   - `working_document`     — the mutable, persisted document the assistant
 *                              builds with the user. Edited via `ctx_patch`;
 *                              writes land in `studio_documents` server-side.
 *
 * The raw entries group by `recordingSegmentId` (reliable, not time-based) so
 * each entry maps to exactly one card the user recorded.
 */

import type { RootState } from "@/lib/redux/store";
import {
  selectCleanedSegments,
  selectRawSegmentsForRecording,
  selectRecordingSegments,
  selectScribeCleanupDocument,
  selectWorkingDocument,
} from "../redux/selectors";

export interface AssistantContextEntry {
  key: string;
  value: unknown;
  slotMatched?: boolean;
  type?: "text";
  label?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Rich context-object value for the working document. The backend treats a
 * value as the rich form only when it is a dict with `content` AND every key
 * in the allowed set {content, mutable, persist, source, type, label,
 * description, max_inline_chars, summary_agent_id}. `mutable: true` makes the
 * server inject `ctx_patch`; `source` routes writes to the studio_document
 * writeback handler.
 */
export function buildWorkingDocumentValue(documentId: string, content: string) {
  return {
    content,
    mutable: true,
    persist: "auto",
    type: "text",
    label: "Working Document",
    description:
      "The collaborative document you build with the user. Read it with " +
      "ctx_get(working_document); apply every change with ctx_patch on " +
      "working_document. Never discard the user's content.",
    source: { kind: "studio_document", id: documentId, field: "content" },
    max_inline_chars: 0,
  };
}

/**
 * Build the full set of context entries for the assistant from current Redux
 * state. Returns an empty array when there's nothing to attach yet.
 */
export function buildAssistantContextEntries(
  state: RootState,
  sessionId: string,
  workingDocumentId: string | null,
): AssistantContextEntry[] {
  const entries: AssistantContextEntry[] = [];

  const recordings = selectRecordingSegments(sessionId)(state);
  recordings.forEach((rec, idx) => {
    const raws = selectRawSegmentsForRecording(sessionId, rec.id)(state);
    const text = raws
      .map((r) => r.text)
      .join(" ")
      .trim();
    if (!text) return;
    const n = pad2(idx + 1);
    entries.push({
      key: `recording_${n}_raw`,
      value: text,
      type: "text",
      label: `Recording ${idx + 1} — raw transcript`,
    });
  });

  // Whole-session cleaned transcript (all active cleaned segments in order).
  const cleaned = selectCleanedSegments(sessionId)(state);
  const cleanedText = cleaned
    .map((c) => c.text)
    .join("\n\n")
    .trim();
  if (cleanedText) {
    entries.push({
      key: "session_cleaned",
      value: cleanedText,
      type: "text",
      label: "Session — AI-cleaned transcript (same content as recordings)",
    });
  }

  // Scribe one-shot cleanup output (`scribe_cleanup` studio_documents row).
  // This is explicitly named and labeled as a DUPLICATE of the raw recordings
  // so the model doesn't double-count it as new content. Only attached when
  // the user has actually run a cleanup pass for this session.
  const cleanupDoc = selectScribeCleanupDocument(sessionId)(state);
  const cleanupText = cleanupDoc?.content?.trim() ?? "";
  if (cleanupText) {
    entries.push({
      key: "cleaned_transcripts",
      value: cleanupText,
      type: "text",
      label:
        "Cleaned transcripts — AI-cleaned DUPLICATE of the recording_NN_raw entries " +
        "above. Same content, just tidied. Prefer this over the raw versions when " +
        "quoting or summarizing; only fall back to recording_NN_raw if you need the " +
        "exact verbatim wording.",
    });
  }

  if (workingDocumentId) {
    const doc = selectWorkingDocument(sessionId)(state);
    entries.push({
      key: "working_document",
      value: buildWorkingDocumentValue(workingDocumentId, doc?.content ?? ""),
      type: "text",
      label: "Working Document",
    });
  }

  return entries;
}
