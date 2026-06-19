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
import { buildWorkingDocumentContextValue } from "@/features/agents/utils/workingDocumentContext";
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

/** mm:ss for a seconds offset (display anchor alongside the raw seconds). */
function clock(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(sec / 60)}:${pad2(sec % 60)}`;
}

/**
 * The instruction that teaches the assistant to cite moments in the session
 * audio. Emitted once whenever the session has any transcript, so the agent can
 * footnote its answers with playable references. `start`/`end` are the same
 * seconds-from-session-start anchors shown inline in every `recording_NN_raw`
 * entry; the UI resolves which session and renders a play button, so the agent
 * never needs an id — just the seconds.
 */
const AUDIO_CITATION_INSTRUCTION =
  "When you refer to something the user said, cite the exact moment in the " +
  "recording with an inline tag: `<audiocite start=\"S\" end=\"E\">short label</audiocite>` " +
  "where S and E are seconds from the start of the session (use the `[t=…s]` " +
  "anchors that prefix each line of the `recording_NN_raw` transcripts). The " +
  "user's app turns this into a button that plays that exact slice of audio — " +
  "like a citation that plays. Prefer a tight span around the relevant words " +
  "(a few seconds to ~30s). Use it whenever pointing to, quoting, or asking " +
  "about a specific part of what was recorded, so the user can hear precisely " +
  "what you mean. Write the tag inline in your sentence; do not invent seconds " +
  "that aren't anchored in the transcript.";

/**
 * Rich context-object value for the working document. Delegates to the shared
 * `buildWorkingDocumentContextValue` (the single working_document value shape
 * across the app) with a `studio_document` binding, so the server still routes
 * `ctx_patch` writes to the studio_document writeback handler and Scribe stays
 * in lockstep with the generic working-document primitive.
 */
export function buildWorkingDocumentValue(documentId: string, content: string) {
  return buildWorkingDocumentContextValue(content, {
    kind: "studio_document",
    id: documentId,
  });
}

/**
 * Build the full set of context entries for the assistant from current Redux
 * state. Returns an empty array when there's nothing to attach yet.
 *
 * `extraEntries` are appended verbatim AFTER the studio entries (recordings,
 * cleaned text, working_document). It defaults to `[]`, so the Scribe studio —
 * which has no extra context — is completely unchanged. The War Room tile panel
 * uses it to merge in the tile's own read-only context objects (its task,
 * notes, files) without polluting the shared studio builder. Caller is
 * responsible for de-duplicating keys; studio keys never collide with the War
 * Room `tile_*` keys.
 */
export function buildAssistantContextEntries(
  state: RootState,
  sessionId: string,
  workingDocumentId: string | null,
  extraEntries: AssistantContextEntry[] = [],
): AssistantContextEntry[] {
  const entries: AssistantContextEntry[] = [];

  const recordings = selectRecordingSegments(sessionId)(state);
  recordings.forEach((rec, idx) => {
    const n = pad2(idx + 1);

    const raws = selectRawSegmentsForRecording(sessionId, rec.id)(state);
    // Prefix each chunk with its session-relative time anchor so the assistant
    // can map words to seconds and emit precise `<audiocite>` references. The
    // plain joined text is unchanged for cleaning (which reads raw via the
    // selector, not this string), so this enrichment is assistant-only.
    const rawWithAnchors = raws
      .filter((r) => r.text?.trim())
      .map(
        (r) =>
          `[t=${r.tStart.toFixed(1)}s ${clock(r.tStart)}] ${r.text.trim()}`,
      )
      .join("\n")
      .trim();
    if (rawWithAnchors) {
      entries.push({
        key: `recording_${n}_raw`,
        value: rawWithAnchors,
        type: "text",
        label: `Recording ${idx + 1} — raw transcript (with [t=…s] time anchors for audio citations)`,
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

  // Teach the assistant to cite audio moments — only once there's something to
  // cite (any raw transcript present means anchors exist).
  if (allRaw) {
    entries.push({
      key: "audio_citations",
      value: AUDIO_CITATION_INSTRUCTION,
      type: "text",
      label: "How to cite audio moments (audiocite)",
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

  // Caller-supplied extras (e.g. War Room tile context). Appended last; empty
  // by default so the Scribe studio is unaffected.
  if (extraEntries.length > 0) {
    entries.push(...extraEntries);
  }

  return entries;
}
