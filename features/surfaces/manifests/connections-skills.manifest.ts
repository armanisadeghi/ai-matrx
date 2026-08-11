/**
 * Surface manifest — Connections Skills (`matrx-user/connections-skills`).
 *
 * Drives `/agent-connections/skills` — the Skills vertical of the Agent
 * Connections hub (`features/agent-connections` → `SkillsSection`, backed by
 * the skills registry in `features/skills`). The vertical mode-routes between
 * the skills browser (list), the detail/create editor, the admin filesystem
 * ingest panel, and the category tree.
 *
 * Inherits `matrx-user/agent-connections`: the hub's guaranteed vocabulary
 * (active_section, view_scope, available_sections) flows down and stays
 * required in the scope helper — this vertical can never launch without the
 * hub's navigation identity.
 *
 * Runtime emitter: `features/agent-connections/components/sections/
 * SkillsSection.tsx` — a nested SurfaceRuntimeProvider that out-depths the
 * hub shell's provider while the Skills vertical is mounted.
 *
 * AGENT-WRITABLE (2026-08-11) — the skill DRAFT, never the registry row.
 * Every target stages into `SkillDetailEditor`'s local `draft` state through
 * the same `set(key, value)` helper each input's `onChange` calls, so an
 * applied write is exactly a keystroke the agent typed: the field goes dirty,
 * the Save/Create button lights up, and NOTHING reaches the database until the
 * user presses it. That is why all five are `mode: "draft"`. Their read twins
 * are the `skill_draft` group, which reflects the staged buffer — distinct
 * from `selected_skill_summary`, which is the SAVED registry row.
 *
 * DELIBERATELY NOT WRITABLE, and the reasons:
 *   - `skill_id` — the registry identity. Immutable after create (the input is
 *     `disabled` once a row exists) and the key every agent inclusion resolves
 *     against; renaming it silently detaches the skill from its consumers.
 *   - Deletion — `doDelete` is destructive (soft-deletes and hides the skill
 *     from every agent that included it) and stays behind the human's trash
 *     button plus its confirm dialog.
 *   - `is_system` / `is_public` — visibility and blast radius, not content.
 *     `is_system` is an admin-only promotion that publishes a row to every
 *     user on every account; both are governance decisions, not drafting.
 *   - `disable_auto_invocation`, `version`, `model_preference`, `icon_name` —
 *     release bookkeeping, infrastructure choice and cosmetics. Nobody asks an
 *     agent to flip them and none is authored content.
 *   - The ingest panel and the category tree — separate sub-modes with their
 *     own write paths; nothing here reaches them.
 * A system skill viewed by a non-admin renders the whole form `readOnly`;
 * every handler throws in that state rather than staging into a form the user
 * cannot save.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";
import {
  AGENT_CONNECTIONS_SURFACE_NAME,
  type AgentConnectionsSectionEntry,
} from "./agent-connections.manifest";

export const CONNECTIONS_SKILLS_SURFACE_NAME = "matrx-user/connections-skills";

const groups: SurfaceValueGroup[] = [
  {
    key: "skills_registry",
    label: "Skills registry",
    sortOrder: 100,
    description:
      "The loaded skills list: load state, summaries, and type breakdown.",
  },
  {
    key: "skill_selection",
    label: "Selected skill",
    sortOrder: 200,
    description: "The skill the user drilled into, when any.",
  },
  {
    key: "skill_draft",
    label: "Skill draft (unsaved)",
    sortOrder: 300,
    description:
      "The live contents of the open skill editor form — the STAGED buffer, which differs from the saved registry row whenever the user (or an agent) has edited a field and not yet pressed Save. Emitted only while the detail/create editor is mounted.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Skills registry ───────────────────────────────────────────────────
  {
    name: "skills_view_mode",
    label: "Skills view mode",
    description:
      'Which sub-UI of the Skills vertical is showing: "list" (browser), "detail" (editor on an existing skill), "create" (editor on a new skill), "ingest" (admin filesystem ingest), or "categories" (category tree). Always present — defaults to "list".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "skills_registry",
  },
  {
    name: "skills_status",
    label: "Skills load status",
    description:
      'Load state of the skills registry: "idle" (not fetched yet), "loading", "ready", or "error". Always present. When not "ready", the list values below may be empty for loading reasons rather than emptiness.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 310,
    group: "skills_registry",
  },
  {
    name: "skills_count",
    label: "Skills count",
    description:
      "Number of skills currently loaded into the registry list. Zero before the first fetch completes (check skills_status) or when the user genuinely has none.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 320,
    group: "skills_registry",
  },
  {
    name: "skills_list_summary",
    label: "Skills list",
    description:
      "One entry per loaded skill with { id, skill_id, label, skill_type, is_active, is_system }, in registry order. Always present — empty array before the list loads (check skills_status) or when the user has no skills.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2500,
    sortOrder: 330,
    group: "skills_registry",
  },
  {
    name: "skills_by_type_counts",
    label: "Skills by type",
    description:
      "Count of loaded skills per skill_type (e.g. { workflow: 4, reference: 2 }). Always present — empty object before the list loads or when there are no skills. Derivable from skills_list_summary, so bindable-only by default.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 120,
    autoContext: false,
    sortOrder: 340,
    group: "skills_registry",
  },

  // ── Selected skill ────────────────────────────────────────────────────
  {
    name: "selected_skill_id",
    label: "Selected skill ID",
    description:
      "UUID of the skill open in the detail editor (mirrors the hub's selected_item_id while this vertical owns it). Empty in list/create/ingest/categories modes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "skill_selection",
  },
  {
    name: "selected_skill_summary",
    label: "Selected skill",
    description:
      "Composite of the selected skill's registry row: { id, skill_id, label, description, skill_type, is_active, is_system, is_public }. Absent when no skill is selected or its row is not in the loaded list.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 410,
    group: "skill_selection",
  },

  // ── Skill draft (the staged editor buffer) ────────────────────────────
  {
    name: "skill_draft_label",
    label: "Draft label",
    description:
      "The display name currently TYPED IN the open editor's Label field. Differs from selected_skill_summary.label whenever the field is edited and unsaved. Absent unless the detail/create editor is mounted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 500,
    group: "skill_draft",
  },
  {
    name: "skill_draft_description",
    label: "Draft description",
    description:
      "The one-line summary currently typed in the open editor's Description field — the text that drives skill discovery. Differs from the saved row whenever it is edited and unsaved. Absent unless the editor is mounted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 510,
    group: "skill_draft",
  },
  {
    name: "skill_draft_type",
    label: "Draft skill type",
    description:
      'The value selected in the open editor\'s Type dropdown: one of "reference", "convention", "workflow", "task", "render_block", "mode", "agent_behavior" (an unrecognised value loaded from the backend is preserved and shown as an extra option). Absent unless the editor is mounted.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 520,
    group: "skill_draft",
  },
  {
    name: "skill_draft_body",
    label: "Draft body",
    description:
      "The full markdown in the open editor's Body field — the text inlined into an agent's system prompt when the skill is included. This is the whole document and can be long, so it is bindable-only. Empty string on a new skill. Absent unless the editor is mounted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 530,
    group: "skill_draft",
  },
  {
    name: "skill_draft_trigger_patterns",
    label: "Draft trigger patterns",
    description:
      "The chips currently in the open editor's Trigger patterns field, in order — the phrases that auto-invoke this skill. Empty array when none. Absent unless the editor is mounted.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 540,
    group: "skill_draft",
  },
  {
    name: "skill_draft_unsaved_fields",
    label: "Unsaved draft fields",
    description:
      "Names of the draft fields edited since the form was last seeded or saved (the dirty set behind the Save button, e.g. [\"label\",\"body\"]). Empty array means the form matches the saved row and Save is disabled. On a new skill everything is unsaved until Create. Absent unless the editor is mounted.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 550,
    group: "skill_draft",
  },
  {
    name: "skill_draft_read_only",
    label: "Draft is read-only",
    description:
      "True when the open skill is a SYSTEM skill and the viewer is not an admin — the whole form is disabled and nothing can be staged or saved. Absent unless the editor is mounted.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 560,
    group: "skill_draft",
  },
];

/**
 * Agent-writable targets — all five stage into the open editor's draft via
 * the same `set()` the user's own typing calls. See the file header for what
 * is deliberately excluded and why.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "skill_label",
    label: "Label",
    description:
      "Sets the skill's display name in the OPEN EDITOR FORM. Value is a plain non-empty string (a name, not a sentence) — leading/trailing whitespace is rejected as a bad shape rather than trimmed. This only STAGES the value: the field goes dirty and the user must press Save (or Create, on a new skill) before anything is written to the registry. Fails if no skill editor is open, or if the skill is a system skill the viewer cannot edit.",
    valueType: "string",
    updatesValue: "skill_draft_label",
    mode: "draft",
    applyPolicy: "ask",
    group: "skill_draft",
    sortOrder: 500,
  },
  {
    name: "skill_description",
    label: "Description",
    description:
      "Sets the skill's one-line discovery summary in the OPEN EDITOR FORM — the text agents match against when deciding whether to load this skill, so it should say WHEN to use the skill, not just what it is. Value is a plain non-empty string; it REPLACES the existing description rather than appending to it (read skill_draft_description first if you mean to extend it). Only stages the value — the user still presses Save. Fails if no editor is open or the form is read-only.",
    valueType: "string",
    updatesValue: "skill_draft_description",
    mode: "draft",
    applyPolicy: "ask",
    group: "skill_draft",
    sortOrder: 510,
  },
  {
    name: "skill_type",
    label: "Skill type",
    description:
      'Sets the Type dropdown in the OPEN EDITOR FORM. Value must be exactly one of "reference", "convention", "workflow", "task", "render_block", "mode", "agent_behavior" — any other string is rejected. Only stages the value; the user still presses Save. Fails if no editor is open or the form is read-only.',
    valueType: "string",
    updatesValue: "skill_draft_type",
    mode: "draft",
    applyPolicy: "ask",
    group: "skill_draft",
    sortOrder: 520,
  },
  {
    name: "skill_body",
    label: "Body",
    description:
      "Sets the skill's markdown body in the OPEN EDITOR FORM — the document inlined into an agent's system prompt when this skill is included. Value is a markdown string and REPLACES THE ENTIRE BODY; to extend rather than overwrite, read skill_draft_body first and send the full new text including what you kept. Pass real newlines in the string, not escaped ones. Only stages the value — nothing is written to the registry until the user presses Save. Fails if no editor is open or the form is read-only.",
    valueType: "string",
    updatesValue: "skill_draft_body",
    mode: "draft",
    applyPolicy: "ask",
    group: "skill_draft",
    sortOrder: 530,
  },
  {
    name: "skill_trigger_patterns",
    label: "Trigger patterns",
    description:
      "Sets the Trigger patterns chips in the OPEN EDITOR FORM — the phrases that auto-invoke this skill. Value is an ARRAY OF STRINGS and REPLACES THE FULL SET, so include any existing patterns from skill_draft_trigger_patterns that should survive; send [] to clear them all. Entries must be non-empty, whitespace-trimmed and unique. Only stages the value — the user still presses Save. Fails if no editor is open or the form is read-only.",
    valueType: "array",
    updatesValue: "skill_draft_trigger_patterns",
    mode: "draft",
    applyPolicy: "ask",
    group: "skill_draft",
    sortOrder: 540,
  },
];

export const connectionsSkillsManifest: SurfaceManifest = {
  surfaceName: CONNECTIONS_SKILLS_SURFACE_NAME,
  readiness: "verified",
  label: "Connections Skills",
  urlPattern: "/agent-connections/skills",
  inheritsFrom: AGENT_CONNECTIONS_SURFACE_NAME,
  intro: `<surface_intro>
You are on the Skills vertical of Agent Connections: the registry of reusable skills — files of domain knowledge and workflows that agents load with progressive disclosure (description first, body on invocation).
The inherited hub values still apply: view_scope (with view_scope_id) tells you whose skills the list is filtered to. skills_view_mode tells you what the user is doing — browsing the list, editing one skill (selected_skill_id / selected_skill_summary), creating a new one, ingesting from the filesystem, or organizing categories.
skills_list_summary is the loaded registry list; trust skills_status before treating an empty list as "the user has no skills".
When the editor is open you can WRITE the draft: label, description, type, body and trigger patterns. Read the skill_draft_* values first — they are the staged form contents, whereas selected_skill_summary is the last SAVED row. Everything you apply is staged only; the user presses Save. You cannot change the skill_id, delete a skill, or touch is_system/is_public — those stay the user's.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One skills-registry entry as emitted in `skills_list_summary`. */
export interface ConnectionsSkillsListEntry {
  id: string;
  skill_id: string;
  label: string;
  skill_type: string;
  is_active: boolean;
  is_system: boolean;
}

/** The composite emitted as `selected_skill_summary`. */
export interface ConnectionsSkillsSelectedSummary
  extends ConnectionsSkillsListEntry {
  description: string;
  is_public: boolean;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above PLUS the
 * inherited alwaysAvailable values from `matrx-user/agent-connections`
 * (active_section / view_scope / available_sections) — inheritance means
 * this vertical guarantees the hub's vocabulary too.
 */
export function createConnectionsSkillsScope(values: {
  // inherited alwaysAvailable: true → required
  active_section: string;
  view_scope: "user" | "organization" | "project" | "task";
  available_sections: AgentConnectionsSectionEntry[];
  // own alwaysAvailable: true → required
  skills_view_mode: "list" | "detail" | "create" | "ingest" | "categories";
  skills_status: "idle" | "loading" | "ready" | "error";
  skills_count: number;
  skills_list_summary: ConnectionsSkillsListEntry[];
  skills_by_type_counts: Record<string, number>;
  // inherited + own optionals
  view_scope_id?: string;
  selected_item_id?: string;
  selected_skill_id?: string;
  selected_skill_summary?: ConnectionsSkillsSelectedSummary;
  // skill_draft group — present only while the detail/create editor is mounted
  skill_draft_label?: string;
  skill_draft_description?: string;
  skill_draft_type?: string;
  skill_draft_body?: string;
  skill_draft_trigger_patterns?: string[];
  skill_draft_unsaved_fields?: string[];
  skill_draft_read_only?: boolean;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

/**
 * The staged editor buffer `SkillDetailEditor` hands up to the emitter so the
 * `skill_draft` read twins reflect what is actually on screen. Absent (null)
 * whenever the editor is not mounted.
 */
export interface ConnectionsSkillsDraftSnapshot {
  skill_draft_label: string;
  skill_draft_description: string;
  skill_draft_type: string;
  skill_draft_body: string;
  skill_draft_trigger_patterns: string[];
  skill_draft_unsaved_fields: string[];
  skill_draft_read_only: boolean;
}
