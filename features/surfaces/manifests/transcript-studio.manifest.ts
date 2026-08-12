/**
 * Surface manifest — Transcript Studio (`matrx-user/transcript-studio`).
 *
 * The 4-column live transcription studio. Lives BOTH as a route
 * (`/transcripts/studio`, `StudioView` with containerVariant "page") and as
 * a floating window (overlay `transcriptStudioWindow`,
 * `TranscriptStudioWindow`, containerVariant "window"). Recording survives
 * window close — the recorder lives in `GlobalRecordingProvider` at the app
 * shell; `activeSessionId` comes from `features/transcript-studio` Redux.
 *
 * THE VOCABULARY HERE IS ADOPTED, NOT INVENTED. The studio has driven three
 * agent pipelines since 2026-05-15 through hand-coded scope keys, and the
 * previous version of this manifest was a deliberate one-value stub whose
 * `readinessNote` warned that a full pass must PRESERVE that vocabulary
 * rather than fork a parallel one. Every pipeline key is now declared with
 * its existing meaning and emitted by calling the pipelines' own builders:
 *
 *   cleaning pass (Column 2) → `prior_cleaned_suffix`, `raw_window`,
 *                              `session_title`, `module_id`
 *   concept pass  (Column 3) → `raw_window`, `prior_concepts`,
 *                              `session_title`, `module_id`
 *   module pass   (Column 4) → `cleaned_window`, `prior_summary`,
 *                              `session_title`
 *
 * — see `features/transcript-studio/service/agentScopeBuilder.ts` and
 * `features/transcript-studio/modules/_lib/buildModuleScope.ts`. A
 * header-launched agent therefore reads exactly what the column agents are
 * fed. The emitter is
 * `features/transcript-studio/lib/transcript-studio-scope.ts`, mounted by
 * `StudioView` (which backs BOTH the route and the window).
 *
 * WRITE HALF — two targets, deliberately not more. See the `writeTargets`
 * block below for the per-target reasoning and
 * `features/transcript-studio/FEATURE.md` for what was rejected and why.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { CONCEPT_KINDS } from "@/features/transcript-studio/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/** Concept entry emitted in `concept_items`. */
export interface StudioConceptItemValue {
  id: string;
  kind: string;
  label: string;
  description: string | null;
  t_start: number | null;
  t_end: number | null;
}

/** Time-anchored text entry emitted in `raw_segments` / `cleaned_segments`. */
export interface StudioSegmentValue {
  id: string;
  text: string;
  t_start: number;
  t_end: number;
}

/** Column-4 module output entry emitted in `module_segments`. */
export interface StudioModuleSegmentValue {
  id: string;
  module_id: string;
  block_type: string;
  payload: unknown;
  t_start: number | null;
  t_end: number | null;
}

const groups: SurfaceValueGroup[] = [
  { key: "studio_session", label: "Session", sortOrder: 100 },
  { key: "studio_columns", label: "Transcript columns", sortOrder: 200 },
  {
    key: "studio_pipelines",
    label: "Agent pipeline windows",
    sortOrder: 300,
    description:
      "The exact inputs the studio's own column agents receive. Reading these tells an agent what the cleaning, concept and module passes are currently working from.",
  },
  { key: "studio_cadence", label: "Pipeline cadence", sortOrder: 400 },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Session ────────────────────────────────────────────────────────
  {
    name: "active_session_id",
    label: "Active session ID",
    description:
      "UUID of the transcription session open in the studio. Empty when no session is selected (the studio's empty state).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "studio_session",
    sortOrder: 300,
  },
  {
    name: "session_title",
    label: "Session title",
    description:
      "Title of the active session, as shown in the studio header and the session sidebar. Auto-derived from the first raw segments until the user renames it. Empty when no session is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "studio_session",
    sortOrder: 310,
  },
  {
    name: "session_status",
    label: "Session status",
    description:
      "Lifecycle state of the active session: idle, recording, paused, stopped or errored. Absent when no session is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    group: "studio_session",
    sortOrder: 320,
  },
  {
    name: "session_source",
    label: "Session origin",
    description:
      "Which surface created the session — 'studio' for the 4-column studio, 'cleanup' for the high-volume cleanup page. Both share the same tables; this only scopes each surface's default list. Absent when no session is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 7,
    autoContext: false,
    group: "studio_session",
    sortOrder: 330,
  },
  {
    name: "session_started_at",
    label: "Session started at",
    description:
      "ISO timestamp when the active session was started. Absent when no session is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    autoContext: false,
    group: "studio_session",
    sortOrder: 340,
  },
  {
    name: "session_duration_ms",
    label: "Recorded duration (ms)",
    description:
      "Total recorded milliseconds for the active session, paused time excluded. 0 before anything is recorded; absent when no session is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 7,
    autoContext: false,
    group: "studio_session",
    sortOrder: 350,
  },
  {
    name: "linked_transcript_id",
    label: "Linked transcript ID",
    description:
      "UUID of the transcript this session was saved into via Save as transcript. Absent when the session is standalone (never promoted).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "studio_session",
    sortOrder: 360,
  },
  {
    name: "session_count",
    label: "Session count",
    description:
      "How many transcription sessions are loaded in the studio's sidebar list. Always emitted, including on the empty state where it may be 0.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    autoContext: false,
    group: "studio_session",
    sortOrder: 370,
  },

  // ── Columns ────────────────────────────────────────────────────────
  {
    name: "raw_transcript_text",
    label: "Raw transcript",
    description:
      "Column 1 — the full unedited transcript of the active session, all raw chunks joined in order. Empty before anything is transcribed; clipped to the most recent 20,000 characters on long sessions.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    group: "studio_columns",
    sortOrder: 400,
  },
  {
    name: "raw_segments",
    label: "Raw segments",
    description:
      "Column 1 as structured rows: { id, text, t_start, t_end } per raw chunk, ordered by start time, seconds from session start. Empty array before anything is transcribed.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 9000,
    autoContext: false,
    group: "studio_columns",
    sortOrder: 410,
  },
  {
    name: "cleaned_transcript_text",
    label: "Cleaned transcript",
    description:
      "Column 2 — the ordered concatenation of the session's active cleaned segments, which IS the canonical clean (there is no separate monolithic clean document). Empty until the cleaning pass has run; clipped to the most recent 20,000 characters.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    group: "studio_columns",
    sortOrder: 420,
  },
  {
    name: "cleaned_segments",
    label: "Cleaned segments",
    description:
      "Column 2 as structured rows: { id, text, t_start, t_end } per active cleaned segment, ordered by start time. Superseded rows and custom per-segment processor output are excluded. Use `id` here to target the `cleaned_segment_text` write. Empty array until the cleaning pass has run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 9000,
    group: "studio_columns",
    sortOrder: 430,
  },
  {
    name: "concept_items",
    label: "Concepts",
    description: `Column 3 — extracted concepts as { id, kind, label, description, t_start, t_end }, where kind is one of ${CONCEPT_KINDS.join(", ")}. Use \`id\` here to target the \`concept_item\` write. Empty array until the concept pass has run.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    group: "studio_columns",
    sortOrder: 440,
  },
  {
    name: "module_segments",
    label: "Module output",
    description:
      "Column 4 — output rows from the active module's agent as { id, module_id, block_type, payload, t_start, t_end }. `payload` shape is module-defined (a markdown checklist for tasks, structured JSON for quiz/flashcards). Empty array until a module pass has run.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 3000,
    group: "studio_columns",
    sortOrder: 450,
  },
  {
    name: "module_id",
    label: "Active module",
    description:
      "Which Column-4 module is active for the session (e.g. tasks, flashcards, decisions, quiz). Determines which agent fills Column 4. Absent when no session is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "studio_columns",
    sortOrder: 460,
  },

  // ── Pipeline windows (the adopted hand-coded vocabulary) ───────────
  {
    name: "raw_window",
    label: "Raw window",
    description:
      "The slice of raw transcript not yet covered by an active cleaned segment — exactly what the cleaning and concept passes receive as their new material. Empty when cleaning has caught up with the recording.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "studio_pipelines",
    sortOrder: 500,
  },
  {
    name: "prior_cleaned_suffix",
    label: "Prior cleaned suffix",
    description:
      "The tail of already-cleaned text (about 1,000 characters) ending with the [[RESUME]] anchor, fed to the cleaning agent so it continues mid-thought instead of restarting. Empty before the first cleaning pass.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    group: "studio_pipelines",
    sortOrder: 510,
  },
  {
    name: "prior_concepts",
    label: "Prior concepts",
    description:
      "The most recent concepts formatted one per line as '- [kind] label', fed to the concept agent so it deduplicates against what it already found. Empty before the first concept pass.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "studio_pipelines",
    sortOrder: 520,
  },
  {
    name: "cleaned_window",
    label: "Module window",
    description:
      "The text the ACTIVE Column-4 module agent receives — cleaned text where cleanup has reached, raw text for the tail beyond it, covering only material newer than the module's last successful pass. Empty when the module has caught up.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "studio_pipelines",
    sortOrder: 530,
  },
  {
    name: "prior_summary",
    label: "Prior module output",
    description:
      "The active module's own previous payloads concatenated (last few passes, budget-capped), fed back so the module agent extends rather than repeats itself. Empty before the module's first pass.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    group: "studio_pipelines",
    sortOrder: 540,
  },

  // ── Cadence ────────────────────────────────────────────────────────
  {
    name: "cleaning_interval_ms",
    label: "Cleaning interval (ms)",
    description:
      "How often the Column-2 cleaning pass fires for this session, in milliseconds. Absent until the session's settings row has been fetched.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    autoContext: false,
    group: "studio_cadence",
    sortOrder: 600,
  },
  {
    name: "concept_interval_ms",
    label: "Concept interval (ms)",
    description:
      "How often the Column-3 concept pass fires for this session, in milliseconds. Absent until the session's settings row has been fetched.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    autoContext: false,
    group: "studio_cadence",
    sortOrder: 610,
  },
  {
    name: "module_interval_ms",
    label: "Module interval (ms)",
    description:
      "How often the Column-4 module pass fires for this session, in milliseconds. Absent when the session uses the active module's default cadence.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    autoContext: false,
    group: "studio_cadence",
    sortOrder: 620,
  },
];

/**
 * WRITE TARGETS — what an agent may change in the studio, and why only these.
 *
 * The judgment bar is "authored content an agent can genuinely draft". Two
 * things on this page clear it, and both are things NEITHER sibling surface
 * can reach:
 *
 *  • `matrx-user/transcripts` (4 targets) writes a STORED transcript record —
 *    title, description, whole body, speaker labels.
 *  • `matrx-user/transcripts-cleanup` (3 targets) writes the cleanup pad's
 *    single Clean/Custom text blob and the session title.
 *
 * Neither has any notion of CONCEPTS, and neither can address ONE
 * time-anchored cleaned segment by id — the cleanup pad's clean is a single
 * blob and the viewer's body is one document. Both targets below are per-row,
 * id-addressed edits inside the studio's live pipeline output.
 *
 * `session_title` is deliberately NOT declared here even though the studio
 * shows it and `updateSessionThunk` would accept it: it is the SAME field on
 * the SAME table already covered by `transcripts-cleanup`'s `session_title`
 * target, and `useStudioAutoLabel` already derives one automatically. A second
 * target for it would be duplication, not coverage.
 *
 * MODE IS `entity` FOR BOTH, and that is a finding rather than a preference.
 * `draft` is only honest where a declared read value actually reflects the
 * staging buffer. Here the buffers are per-row `useState` inside
 * `EditableConceptRow` / `EditableTextSegmentRow` — created only while that
 * one row is in edit mode, unreachable from the provider, and mirrored by no
 * declared value. Staging into them would be invisible to the agent and
 * unverifiable, so both persist immediately through the canonical thunk, the
 * same one the row's own Save button dispatches.
 *
 * NOT DECLARED: every delete (concept, segment, session — destructive stays
 * human), recording transport (mechanical), the interval/shortcut/module
 * settings (mechanical ids), and Column-4 module payloads (the payload shape
 * is module-defined `unknown`, so no single contract could be validated
 * honestly).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "concept_item",
    label: "Concept",
    description: `Refine ONE extracted concept in Column 3 — its kind, its short label, and its longer description, which the user edits together in one form. Value: { id: string, kind?: string, label?: string, description?: string | null }. \`id\` is REQUIRED and must match an \`id\` in the \`concept_items\` value exactly. Supply only the fields you are changing; omitted fields are left untouched. \`kind\` must be one of ${CONCEPT_KINDS.join(" | ")}. \`label\` must be non-empty and at most 200 characters; \`description\` may be null to clear it. Persists IMMEDIATELY through the same updateConceptItem thunk the row's own Edit → Save uses, and the row updates in place on apply.`,
    valueType: "object",
    updatesValue: "concept_items",
    mode: "entity",
    applyPolicy: "ask",
    group: "studio_columns",
    sortOrder: 700,
  },
  {
    name: "cleaned_segment_text",
    label: "Cleaned segment text",
    description:
      "Correct the text of ONE cleaned segment in Column 2 — a targeted fix to a single time-anchored span, not the whole transcript. Value: { id: string, text: string }. `id` is REQUIRED and must match an `id` in the `cleaned_segments` value exactly; `text` REPLACES that segment's text outright and must be non-empty (clearing a segment is a human action). Only that segment changes — its timecodes, every other segment, and the raw transcript are untouched. Persists IMMEDIATELY through the same updateCleanedSegmentText thunk the row's own Edit → Save uses. Note this text also feeds `prior_cleaned_suffix`, so a correction here carries style forward into the next cleaning pass.",
    valueType: "object",
    updatesValue: "cleaned_segments",
    mode: "entity",
    applyPolicy: "ask",
    group: "studio_columns",
    sortOrder: 710,
  },
];

export const transcriptStudioManifest: SurfaceManifest = {
  surfaceName: "matrx-user/transcript-studio",
  readiness: "verified",
  overlayId: "transcriptStudioWindow",
  urlPattern: "/transcripts/studio",
  label: "Transcript Studio",
  intro: `<surface_intro>
You are on the Transcript Studio — the live transcription workbench where the user records audio and watches agent pipelines process the transcript in real time.

Four columns, left to right: Column 1 the raw transcript as it is captured (raw_transcript_text / raw_segments); Column 2 the cleaned-up version produced by the cleaning pass (cleaned_transcript_text / cleaned_segments); Column 3 extracted concepts (concept_items); Column 4 the output of whichever module is active (module_segments, module_id).

The studio runs its own agents on a timer, and the window values show you exactly what those agents are working from right now: raw_window is the transcript not yet cleaned, prior_cleaned_suffix is the tail the cleaning agent resumes from, prior_concepts is what the concept agent has already found, cleaned_window and prior_summary are the active module agent's inputs. Read them before proposing changes so you do not duplicate work a pass is about to do.

You can refine two things: one concept at a time (concept_item) and the text of one cleaned segment at a time (cleaned_segment_text). Both address a row by its id from the matching read value, both ask the user before applying, and both persist immediately. Deleting anything, starting or stopping recording, and changing pipeline settings are the user's to do.

Recording continues even if the floating window is closed; only the explicit Stop button ends it.
</surface_intro>`,
  groups,
  writeTargets,
  values: mergeBaselineValues(
    // `selection` — text selected in any column. `content` — back-compat alias
    // carrying the cleaned transcript (falling back to raw), so legacy
    // shortcuts bound to `content` still receive the best transcript
    // available. `context` — escape hatch for surface-shaped extras.
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createTranscriptStudioScope(values: {
  /** Required — `session_count` is the surface's only alwaysAvailable value. */
  session_count: number;

  active_session_id?: string;
  session_title?: string;
  session_status?: string;
  session_source?: string;
  session_started_at?: string;
  session_duration_ms?: number;
  linked_transcript_id?: string;

  raw_transcript_text?: string;
  raw_segments?: StudioSegmentValue[];
  cleaned_transcript_text?: string;
  cleaned_segments?: StudioSegmentValue[];
  concept_items?: StudioConceptItemValue[];
  module_segments?: StudioModuleSegmentValue[];
  module_id?: string;

  raw_window?: string;
  prior_cleaned_suffix?: string;
  prior_concepts?: string;
  cleaned_window?: string;
  prior_summary?: string;

  cleaning_interval_ms?: number;
  concept_interval_ms?: number;
  module_interval_ms?: number;

  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
