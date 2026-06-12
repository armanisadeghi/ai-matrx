/**
 * features/transcript-studio/service/assistantContextBuilder.ts
 *
 * Builds the `setContextEntries` payload that turns a session's transcripts
 * into named context objects for the audio-first assistant.
 *
 * Naming contract (so the model understands the relationships):
 *   - `recording_NN_raw`     — verbatim transcript of recording cycle NN.
 *   - `recording_NN_clean`   — AI-cleaned transcript of recording cycle NN
 *                              (recording-aligned). Same content as
 *                              recording_NN_raw, just tidied. Only present once
 *                              that recording has been cleaned.
 *   - `all_raw`              — every recording's raw transcript concatenated in
 *                              order. Convenience aggregate of recording_NN_raw.
 *   - `session_cleaned`      — full-session AI-cleaned transcript = ordered
 *                              concatenation of every recording_NN_clean. This
 *                              is THE clean version of the whole session; prefer
 *                              it for quoting/summarizing.
 *   - `working_document`     — the mutable, persisted document the assistant
 *                              builds with the user. Edited via `ctx_patch`;
 *                              writes land in `studio_documents` server-side.
 *
 * The raw + clean entries group by `recordingSegmentId` (reliable, not
 * time-based) so each entry maps to exactly one card the user recorded.
 */

import type { RootState } from "@/lib/redux/store";
import {
  selectCleanedSegmentForRecording,
  selectRawSegmentsForRecording,
  selectRecordingSegments,
  selectSessionCleanedText,
  selectSessionRawText,
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
    const n = pad2(idx + 1);

    const raws = selectRawSegmentsForRecording(sessionId, rec.id)(state);
    const rawText = raws
      .map((r) => r.text)
      .join(" ")
      .trim();
    if (rawText) {
      entries.push({
        key: `recording_${n}_raw`,
        value: rawText,
        type: "text",
        label: `Recording ${idx + 1} — raw transcript`,
      });
    }

    // Recording-aligned clean (same content as the raw above, just tidied).
    const cleanSeg = selectCleanedSegmentForRecording(sessionId, rec.id)(state);
    const cleanText = cleanSeg?.text?.trim() ?? "";
    if (cleanText) {
      entries.push({
        key: `recording_${n}_clean`,
        value: cleanText,
        type: "text",
        label: `Recording ${idx + 1} — AI-cleaned transcript`,
      });
    }
  });

  // Aggregate raw across all recordings — convenience over recording_NN_raw.
  const allRaw = selectSessionRawText(sessionId)(state);
  if (allRaw) {
    entries.push({
      key: "all_raw",
      value: allRaw,
      type: "text",
      label: "All recordings — raw transcript (concatenated)",
    });
  }

  // Full-session clean = ordered concatenation of every recording_NN_clean.
  // THE clean version of the whole session; prefer it for quoting/summarizing.
  const sessionCleaned = selectSessionCleanedText(sessionId)(state);
  if (sessionCleaned) {
    entries.push({
      key: "session_cleaned",
      value: sessionCleaned,
      type: "text",
      label:
        "Session — full AI-cleaned transcript (same content as the recordings, " +
        "tidied). Prefer this when quoting or summarizing; fall back to all_raw " +
        "only when you need exact verbatim wording.",
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
