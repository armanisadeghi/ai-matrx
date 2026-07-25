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
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
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
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
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
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
