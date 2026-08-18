/**
 * Surface manifest — Agent Shortcuts (`matrx-user/agent-shortcuts`).
 *
 * The shortcut LIBRARY and its editor: `/agents/shortcuts` (mine),
 * `/agents/shortcuts/all` (the directory), `/agents/shortcuts/edit/[id]`, and
 * the per-agent panel at `/agents/[id]/shortcuts/**`. A shortcut row IS a
 * persisted `AgentExecutionConfig` bundle plus identity and scope
 * (`features/agents/redux/agent-shortcuts/types.ts`), so the vocabulary here is
 * about AUTHORING and organizing those bundles — not about running one.
 *
 * Declared 2026-08-17 to close a phantom: `route-to-surface.ts` has mapped ten
 * live routes to `matrx-user/agent-shortcuts` while no manifest and no
 * `ui_surface` row existed anywhere, so every one of those routes resolved to a
 * surface that could not be bound, could not emit, and could not be audited.
 *
 * Curated groups (band 0-899):
 *   library          Which shortcut collection the user is looking at
 *   active_shortcut  The one shortcut being edited or acted on
 *   agent_context    The agent whose shortcuts are on screen (per-agent panel)
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "library",
    label: "Shortcut library",
    sortOrder: 100,
    description:
      "Which collection of shortcuts is on screen and how it is organized.",
  },
  {
    key: "active_shortcut",
    label: "Active shortcut",
    sortOrder: 200,
    description:
      "The single shortcut the user is editing, duplicating, or promoting.",
  },
  {
    key: "agent_context",
    label: "Owning agent",
    sortOrder: 300,
    description:
      "Present on the per-agent panel (`/agents/[id]/shortcuts`): the agent whose shortcuts are listed.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Library ───────────────────────────────────────────────────────────
  {
    name: "shortcut_scope",
    label: "Shortcut scope",
    description:
      '"user" on the personal library, "org" on an organization\'s library, "global" on the admin/system directory. Tells an agent whose shortcuts these are and therefore what it may propose changing.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 100,
    group: "library",
  },
  {
    name: "shortcut_category_names",
    label: "Category names",
    description:
      "Names of every shortcut category in the current scope, in display order. Always populated — empty array when the scope has no categories yet.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 200,
    sortOrder: 110,
    group: "library",
  },
  {
    name: "shortcut_count",
    label: "Shortcut count",
    description:
      "How many shortcuts are loaded in the current scope across all categories. Always populated — zero on an empty library.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 4,
    sortOrder: 120,
    group: "library",
  },
  {
    name: "shortcuts_summary",
    label: "Shortcuts summary",
    description:
      "One entry per loaded shortcut with { id, label, category_name, agent_name, surface_name }, in display order. Always populated — empty array on an empty library. Lets an agent reason about the whole library (duplicates, gaps, naming) without a lookup per row.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2400,
    autoContext: false,
    sortOrder: 130,
    group: "library",
  },

  // ── Active shortcut ───────────────────────────────────────────────────
  {
    name: "shortcut_id",
    label: "Active shortcut ID",
    description:
      "UUID of the shortcut being edited or acted on. Empty on the list and directory routes, where no single shortcut is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "active_shortcut",
  },
  {
    name: "shortcut_label",
    label: "Shortcut label",
    description:
      "Display label of the active shortcut — the text the user clicks in a menu. Empty when no shortcut is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 210,
    group: "active_shortcut",
  },
  {
    name: "shortcut_description",
    label: "Shortcut description",
    description:
      "The active shortcut's description text. Empty when no shortcut is active or the shortcut has no description.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 160,
    sortOrder: 220,
    group: "active_shortcut",
  },
  {
    name: "shortcut_category_name",
    label: "Category",
    description:
      "Name of the category the active shortcut belongs to. Empty when no shortcut is active.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 230,
    group: "active_shortcut",
  },
  {
    name: "shortcut_keyboard_shortcut",
    label: "Keyboard shortcut",
    description:
      "Key combination bound to the active shortcut (e.g. \"cmd+shift+k\"). Empty when no shortcut is active or none is bound.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 240,
    group: "active_shortcut",
  },
  {
    name: "shortcut_agent_id",
    label: "Target agent ID",
    description:
      "UUID the active shortcut executes against — the agent id when it tracks latest, the pinned version id when it does not (`resolvedId`). Empty when no shortcut is active or the shortcut has no agent yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 250,
    group: "active_shortcut",
  },
  {
    name: "shortcut_agent_name",
    label: "Target agent name",
    description:
      "Name of the agent the active shortcut runs, as snapshotted on the shortcut row. Empty when no shortcut is active or the agent name was never captured.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 260,
    group: "active_shortcut",
  },
  {
    name: "shortcut_uses_latest",
    label: "Tracks latest agent version",
    description:
      "True when the active shortcut always runs the agent's latest version; false when it is pinned to a frozen version. Absent when no shortcut is active.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 270,
    group: "active_shortcut",
  },
  {
    name: "shortcut_surface_name",
    label: "Target surface",
    description:
      "Registered `ui_surface.name` the active shortcut targets, whose declared values its mappings resolve against. Empty when no shortcut is active or the shortcut still relies on legacy `enabledFeatures` instead of a surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 280,
    group: "active_shortcut",
  },
  {
    name: "shortcut_enabled_features",
    label: "Enabled features",
    description:
      "Legacy `enabledFeatures` contexts the active shortcut appears in (chat, notes, code-editor, …). Always populated when a shortcut is active — empty array once the shortcut has moved to `shortcut_surface_name`.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 290,
    group: "active_shortcut",
  },
  {
    name: "shortcut_value_mappings",
    label: "Value mappings",
    description:
      "The active shortcut's canonical mapping map, keyed by agent variable / context-policy name, each value naming the surface value it draws from. Absent when no shortcut is active or nothing is mapped. Bindable-only: large and only meaningful to mapping-aware agents.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 700,
    autoContext: false,
    sortOrder: 300,
    group: "active_shortcut",
  },
  {
    name: "shortcut_summary",
    label: "Active shortcut summary",
    description:
      "Composite of the active shortcut as one object: { id, label, description, category_name, keyboard_shortcut, agent_id, agent_name, uses_latest, surface_name }. Mirrors the individual active-shortcut values. Absent when no shortcut is active.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 310,
    group: "active_shortcut",
  },

  // ── Owning agent (per-agent panel) ────────────────────────────────────
  {
    name: "agent_id",
    label: "Owning agent ID",
    description:
      "UUID of the agent whose shortcuts are listed. Populated only on `/agents/[id]/shortcuts/**`; empty on the standalone library routes.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 400,
    group: "agent_context",
  },
  {
    name: "agent_name",
    label: "Owning agent name",
    description:
      "Name of the agent whose shortcuts are listed. Populated only on the per-agent panel; empty elsewhere.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 410,
    group: "agent_context",
  },
  {
    name: "agent_variable_names",
    label: "Agent variable names",
    description:
      "Names of the variables the owning agent declares — the left-hand side any new shortcut mapping must satisfy. Populated only on the per-agent panel; empty array when the agent declares none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 420,
    group: "agent_context",
  },
];

export const agentShortcutsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-shortcuts",
  readiness: "stub",
  readinessNote:
    "Vocabulary declared to close a phantom route mapping (ten routes resolved to a surface with no manifest and no DB row). Not yet audited field-by-field against the pages, and no runtime emitter is wired — no page calls createAgentShortcutsScope yet.",
  label: "Agent Shortcuts",
  urlPattern: "/agents/shortcuts",
  intro: `<surface_intro>
You are on the Agent Shortcuts library: where a user builds, organizes, and edits shortcuts. A shortcut is a saved way to run one agent — a label, a category, the agent it targets (latest or a pinned version), and the mappings that fill that agent's variables from a surface's values. Nothing here runs a shortcut; this surface is about authoring them.
Read the values in tiers: the Shortcut library group tells you whose collection this is and what is in it; the Active shortcut group describes the single shortcut being edited (empty on the list and directory routes); the Owning agent group is populated only on an agent's own shortcuts panel and tells you which variables a new mapping must satisfy.
When shortcut_surface_name is empty but shortcut_enabled_features is not, the shortcut still uses the legacy feature list rather than a registered surface — that is a gap worth naming, not an error.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
};

/** One entry as emitted in `shortcuts_summary`. */
export interface AgentShortcutSummaryEntry {
  id: string;
  label: string;
  category_name: string;
  agent_name: string | null;
  surface_name: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 */
export function createAgentShortcutsScope(values: {
  // alwaysAvailable: true → required
  shortcut_scope: "user" | "org" | "global";
  shortcut_category_names: string[];
  shortcut_count: number;
  shortcuts_summary: AgentShortcutSummaryEntry[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  shortcut_id?: string;
  shortcut_label?: string;
  shortcut_description?: string;
  shortcut_category_name?: string;
  shortcut_keyboard_shortcut?: string;
  shortcut_agent_id?: string;
  shortcut_agent_name?: string;
  shortcut_uses_latest?: boolean;
  shortcut_surface_name?: string;
  shortcut_enabled_features?: string[];
  shortcut_value_mappings?: Record<string, unknown>;
  shortcut_summary?: {
    id: string;
    label: string;
    description: string | null;
    category_name: string;
    keyboard_shortcut: string | null;
    agent_id: string | null;
    agent_name: string | null;
    uses_latest: boolean;
    surface_name: string | null;
  };
  agent_id?: string;
  agent_name?: string;
  agent_variable_names?: string[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
