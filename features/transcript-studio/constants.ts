/**
 * features/transcript-studio/constants.ts
 *
 * Defaults and bounds for the transcript studio. Bounds match the DB CHECK
 * constraints in migrations/transcript_studio_schema.sql — keep in sync.
 */

import type { ModuleId } from "./types";

// Trigger intervals (ms). Cleaning runs every ~30s; concepts every ~200s.
// Min/max are enforced by both UI sliders and DB CHECK constraints.
export const CLEANING_INTERVAL_DEFAULT_MS = 30_000;
export const CLEANING_INTERVAL_MIN_MS = 15_000;
export const CLEANING_INTERVAL_MAX_MS = 120_000;

export const CONCEPT_INTERVAL_DEFAULT_MS = 200_000;
export const CONCEPT_INTERVAL_MIN_MS = 60_000;
export const CONCEPT_INTERVAL_MAX_MS = 600_000;

export const MODULE_INTERVAL_MIN_MS = 15_000;
export const MODULE_INTERVAL_MAX_MS = 1_800_000;

// Silence-detection window for the cleaning trigger (Column 2 only).
// We accept a flush within ±5s of the interval; outside the window we
// flush regardless of silence.
export const CLEANING_SILENCE_WINDOW_MS = 5_000;

// Resume marker injected into the cleaning prompt and stripped from the
// response before persisting. Double-bracket, ASCII-only, very unlikely
// to appear in natural speech.
export const RESUME_MARKER = "[[RESUME]]";

// Budget for the prior cleaned context fed back into the next cleaning run.
export const CLEANING_CONTEXT_CHAR_BUDGET = 1_000;

// Default Column 4 module on a brand-new session.
export const DEFAULT_MODULE_ID: ModuleId = "tasks";

// Resizable column persistence cookie key.
export const COLUMN_WIDTHS_COOKIE = "studio:column-widths";

// Stable column identifiers used across scroll-sync, settings, and persistence.
export const COLUMN_IDS = {
  raw: 1,
  cleaned: 2,
  concepts: 3,
  module: 4,
} as const;
export type ColumnId = (typeof COLUMN_IDS)[keyof typeof COLUMN_IDS];

// Surface name for the studio (`features/surfaces/manifests/transcript-studio.manifest.ts`).
// One constant so the emitter, the dictionary indicator, and the write
// handlers can never drift from `ui_surface.name` — a mismatch silently
// resolves NO bindings at launch.
export const TRANSCRIPT_STUDIO_SURFACE = "matrx-user/transcript-studio";

// Title used when a session is created without one.
export const NEW_SESSION_DEFAULT_TITLE = "New Session";

// Threshold (px from bottom) below which a column auto-scrolls with
// streaming content. Past this gap, autoscroll pauses for that column.
export const AUTOSCROLL_BOTTOM_THRESHOLD_PX = 80;

// ── Default AGENT SHORTCUT ids for the per-column agents ──
//
// These are SHORTCUT ids (`agent.shortcut`), not agent ids and not agent
// slots. Agent Shortcuts are their own first-class system
// (`features/agent-shortcuts/FEATURE.md`): a stored invocation of a specific
// agent version whose variables auto-map from the surrounding UI. That is the
// right primitive here — the studio's columns are user-selectable invocations,
// picked per session in the settings sidebar and persisted as
// `studio_session_settings.cleaning_shortcut_id` / `concept_shortcut_id`, and
// per module as `ModuleDefinition.defaultShortcutId`. The constants below are
// only the DEFAULT the picker starts on. Do not "migrate" them to slot keys.
//
// 🚨 THE CONTRACT BELONGS TO THE AGENT, NOT TO THIS FILE. The shortcut's
// bound agent version owns its variable surface and its output shape; this
// code only maps values in (`buildScope`) and parses what comes back
// (`parseRun`). The per-agent notes below are a reader's aid recorded when the
// shortcuts were authored — nothing keeps them in sync with the DB, so verify
// against the agent before trusting one. If a contract is wrong, fix the agent
// in the builder; never restate or override its definition from this repo.

// "Live Transcription Cleaner" — the resume-marker contract, mapped from
// prior_cleaned_suffix / raw_window / session_title / module_id.
export const DEFAULT_CLEANING_SHORTCUT_ID =
  "e8df1e93-2419-4545-a2d0-935f4958de85";

// Concept extraction. Mapped from raw_window / prior_concepts / session_title
// / module_id; `parseRun` expects one JSON code fence with a
// `concepts: [{ kind, label, description?, t_start?, t_end? }]` array.
export const DEFAULT_CONCEPT_SHORTCUT_ID =
  "633d7da7-e8ec-40b4-bae3-251d2f4a7ee4";

// Tasks module (Column 4 default). Mapped from cleaned_window / prior_tasks /
// session_title; `parseRun` expects a markdown checklist that BlockRenderer's
// `tasks` block renders directly.
export const DEFAULT_TASKS_SHORTCUT_ID =
  "c32f3884-65f1-41dd-b426-727d60cb7d6b";

// V1.5 modules — the all-zero UUID is a DELIBERATE "no shortcut authored yet"
// sentinel, never a real row. Each module still ships its `buildScope` and
// `parseRun`, so authoring the shortcut in the DB and pasting its id here is
// the whole remaining step. Until then these modules cannot run.
export const DEFAULT_FLASHCARDS_SHORTCUT_ID =
  "00000000-0000-0000-0000-000000000000";
export const DEFAULT_DECISIONS_SHORTCUT_ID =
  "00000000-0000-0000-0000-000000000000";
export const DEFAULT_QUIZ_SHORTCUT_ID =
  "00000000-0000-0000-0000-000000000000";

// Default cadence per Column 4 module. Modules can override this in their
// metadata; per-session overrides land in studio_session_settings.
export const MODULE_INTERVAL_DEFAULT_MS = 120_000;

// The audio-first studio assistant — a builtin `agent.definition` row that
// receives the session's transcripts as named context objects and edits the
// working document (studio_documents) via ctx_patch. Seeded in
// migrations/studio_audio_assistant_agent.sql.
//
// 🚨 HARDCODED AGENT ID, READ AT RUN TIME — a known gap, ROLLOUT.md row F7.
// `resolveDefaultAssistantAgentId` (redux/assistantRoster.ts) falls back to it
// below the surface-config `assistant` role, and ensureAssistantConversation
// uses it as the last-resort agent for legacy sessions. So the DB does not
// fully own which agent assists here. The canonical form is a declared slot
// resolved at run time; the surface manifest's `defaultAgentId`
// (features/surfaces/manifests/transcript-scribe.manifest.ts) may keep it as a
// documented SEED MIRROR, but a runtime read is a defect and no new one may be
// added. Law: /Users/armanisadeghi/code/common-docs/systems/agent-slots/FEATURE.md.
export const AUDIO_ASSISTANT_AGENT_ID =
  "86564a0c-fe79-40a7-bf97-6349fb352a9d";

// Tick cadence for the trigger scheduler. 500ms is fine for ~10s+ intervals;
// the scheduler skips ticks where the elapsed-since-last-flush guard
// hasn't expired.
export const TRIGGER_SCHEDULER_TICK_MS = 500;

// Audio level (0..100) below which we count as silence for the cleanup
// trigger's silence-detection window.
export const SILENCE_LEVEL_THRESHOLD = 8;
