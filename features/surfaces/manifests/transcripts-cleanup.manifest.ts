/**
 * Surface manifest — Transcription Cleanup (`matrx-user/transcripts-cleanup`).
 *
 * The high-volume record → clean → refine page at `/transcripts/cleanup`.
 * Three containers: raw transcript, cleaned transcript, and up to three
 * user-custom output slots produced by ANY agent the user picks. Sessions
 * live on the studio data model (`studio_sessions` with `source='cleanup'`).
 *
 * Mapping intent: agents bound to this surface receive the raw transcript as
 * their primary input. `raw_transcript_text` doubles as baseline `content`
 * so name-matched agents that declare a `content` variable also work. For
 * context-menu launches, `content` / `active_pane_text` carry the text of the
 * pane the menu was opened in, and `active_pane` names it.
 *
 * Runtime emitter: `CleanupPad.tsx` (`buildScope` + `menuContextData`).
 * Baseline `selection` / `text_before` / `text_after` are captured by
 * `UnifiedAgentContextMenu` itself at trigger time.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/** Per-slot summary entry inside `custom_slots_summary`. */
export interface CleanupSlotSummary {
  label: string;
  agent_id: string | null;
  agent_name: string | null;
  source: "raw" | "clean";
  auto_run: boolean;
  run_status: string;
  has_output: boolean;
}

/** Structured context block inside `context_items`. */
export interface CleanupContextItemValue {
  key: string;
  label: string;
  value: string;
}

const surfaceSpecific: SurfaceValue[] = [
  // ── Active pane (menu launches only) ──────────────────────────────────────
  {
    name: "active_pane",
    label: "Active pane",
    description:
      "Which pane the action was triggered from: 'transcript', 'clean', or 'custom'. Set for context-menu launches; absent for sidebar/toolbar runs.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 210,
  },
  {
    name: "active_pane_text",
    label: "Active pane text",
    description:
      "Full text of the pane the action was triggered from (same as `content` on menu launches). Absent for sidebar/toolbar runs.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 220,
  },

  // ── Session identity ──────────────────────────────────────────────────────
  {
    name: "session_id",
    label: "Cleanup session ID",
    description:
      "UUID of the active cleanup session (studio_sessions row). Empty before the first content is captured.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "session_title",
    label: "Session title",
    description: "Title of the active cleanup session.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "session_started_at",
    label: "Session started at",
    description:
      "ISO timestamp the active cleanup session was started. Absent before a session exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 315,
  },

  // ── Container texts ───────────────────────────────────────────────────────
  {
    name: "raw_transcript_text",
    label: "Raw transcript",
    description:
      "The full raw transcript as currently visible in the transcript container — recorded chunks plus any manual edits. The primary input for cleanup agents.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 320,
  },
  {
    name: "cleaned_transcript_text",
    label: "Cleaned transcript",
    description:
      "The AI-cleaned transcript currently visible in the Clean container (latest pass, including user edits). Empty before the first cleaning pass.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 330,
  },
  {
    name: "custom_output_text",
    label: "Active custom output",
    description:
      "The ACTIVE custom slot's current text — output of the user's chosen custom agent, including manual edits. Empty when no custom pass has run.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 340,
  },
  {
    name: "all_custom_outputs",
    label: "All custom outputs",
    description:
      "Every custom slot's current text, keyed by slot label (or agent name). Includes empty slots as empty strings.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 8000,
    sortOrder: 345,
  },

  // ── Derived stats ─────────────────────────────────────────────────────────
  {
    name: "raw_word_count",
    label: "Raw word count",
    description: "Word count of the raw transcript. 0 when empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 360,
  },
  {
    name: "raw_char_count",
    label: "Raw character count",
    description: "Character count of the raw transcript. 0 when empty.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 365,
  },
  {
    name: "cleaned_word_count",
    label: "Cleaned word count",
    description:
      "Word count of the cleaned transcript. 0 before the first cleaning pass.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 370,
  },

  // ── Recording state ───────────────────────────────────────────────────────
  {
    name: "is_recording",
    label: "Recording",
    description: "True while the mic is actively recording.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 400,
  },
  {
    name: "is_transcribing",
    label: "Transcribing",
    description:
      "True while a finished recording is being transcribed (post-record, pre-commit).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 410,
  },
  {
    name: "is_transcript_locked",
    label: "Transcript locked",
    description:
      "True while recording or transcribing — the transcript pane is read-only and text writes to it are blocked.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 415,
  },
  {
    name: "live_transcript_text",
    label: "Live transcript",
    description:
      "The in-flight mic transcription streaming in during an active recording. Absent when not recording.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 420,
  },
  {
    name: "pending_insert_start",
    label: "Queued start insert",
    description:
      "Text queued (via 'At start' while recording) to be prepended to the transcript at commit time. Absent when nothing is queued.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 430,
  },
  {
    name: "pending_insert_end",
    label: "Queued end insert",
    description:
      "Text queued (via 'At end' while recording) to be appended to the transcript at commit time. Absent when nothing is queued.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 435,
  },

  // ── Agent wiring ──────────────────────────────────────────────────────────
  {
    name: "clean_agent_id",
    label: "Clean agent ID",
    description:
      "Agent ID assigned to the Clean container. Always set (defaults to the system cleaner).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 500,
  },
  {
    name: "clean_agent_name",
    label: "Clean agent name",
    description:
      "Display name of the Clean container's agent. Absent until name resolution completes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 505,
  },
  {
    name: "clean_run_status",
    label: "Clean run status",
    description:
      "Streaming phase of the Clean container's last run: idle | launching | pending | connecting | streaming | awaiting-tools | complete | error | cancelled | timeout.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 510,
  },
  {
    name: "active_slot_index",
    label: "Active slot index",
    description: "0-based index of the currently visible custom slot.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 1,
    sortOrder: 515,
  },
  {
    name: "active_slot_agent_id",
    label: "Active slot agent ID",
    description:
      "Agent ID assigned to the active custom slot. Absent when the slot has no agent yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 520,
  },
  {
    name: "active_slot_agent_name",
    label: "Active slot agent name",
    description:
      "Display name of the active custom slot's agent. Absent when unassigned or unresolved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 525,
  },
  {
    name: "active_slot_source",
    label: "Active slot input source",
    description:
      "Which text the active custom slot runs over: 'raw' (transcript) or 'clean' (cleaned output).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 530,
  },
  {
    name: "active_slot_auto_run",
    label: "Active slot auto-run",
    description:
      "True when the active custom slot fires automatically (with Clean for source=raw, after Clean for source=clean).",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 535,
  },
  {
    name: "active_slot_run_status",
    label: "Active slot run status",
    description:
      "Streaming phase of the active custom slot's last run (same vocabulary as clean_run_status).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 540,
  },
  {
    name: "custom_slot_count",
    label: "Custom slot count",
    description: "Number of configured custom slots (1-3).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 1,
    sortOrder: 550,
  },
  {
    name: "custom_slots_summary",
    label: "Custom slots summary",
    description:
      "Array describing every custom slot: { label, agent_id, agent_name, source, auto_run, run_status, has_output }.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 400,
    sortOrder: 555,
  },

  // ── Context items ─────────────────────────────────────────────────────────
  {
    name: "context_items",
    label: "Context items",
    description:
      "The session's structured context blocks as an array of { key, label, value }. Empty array when none are filled in.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    sortOrder: 600,
  },
  {
    name: "context_item_count",
    label: "Context item count",
    description: "Number of non-empty context blocks in the sidebar.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 1,
    sortOrder: 610,
  },
];

export const transcriptsCleanupManifest: SurfaceManifest = {
  surfaceName: "matrx-user/transcripts-cleanup",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
};

/** Type-safe scope builder for the cleanup page. */
export function createTranscriptsCleanupScope(values: {
  selection?: string;
  text_before?: string;
  text_after?: string;
  /** Baseline alias for the primary input — pass the raw transcript here too. */
  content?: string;
  context?: Record<string, unknown>;
  active_pane?: "transcript" | "clean" | "custom";
  active_pane_text?: string;
  session_id?: string;
  session_title?: string;
  session_started_at?: string;
  raw_transcript_text?: string;
  cleaned_transcript_text?: string;
  custom_output_text?: string;
  all_custom_outputs: Record<string, string>;
  raw_word_count: number;
  raw_char_count: number;
  cleaned_word_count: number;
  is_recording: boolean;
  is_transcribing: boolean;
  is_transcript_locked: boolean;
  live_transcript_text?: string;
  pending_insert_start?: string;
  pending_insert_end?: string;
  clean_agent_id: string;
  clean_agent_name?: string;
  clean_run_status: string;
  active_slot_index: number;
  active_slot_agent_id?: string;
  active_slot_agent_name?: string;
  active_slot_source: "raw" | "clean";
  active_slot_auto_run: boolean;
  active_slot_run_status: string;
  custom_slot_count: number;
  custom_slots_summary: CleanupSlotSummary[];
  context_items: CleanupContextItemValue[];
  context_item_count: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
