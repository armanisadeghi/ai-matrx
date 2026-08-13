/**
 * Surface manifest — Agent Settings (`matrx-user/agent-settings`).
 *
 * The floating Agent Settings window (overlay `agentSettingsWindow`,
 * `AgentSettingsWindow`): a tabbed agent editor — sidebar to open agents,
 * tabs across the top, and per-agent panes. When opened WITH a surface
 * context (`surfaceName` passed by surface-context openers) it gains a
 * Surface pane (`SurfaceAgentBindPanel`) editing that agent's bindings and
 * value mappings for that surface.
 *
 * ── Emitter (2026-08-12) ────────────────────────────────────────────────────
 *
 * `AgentSettingsWindow` mounts the surface's FIRST `SurfaceRuntimeProvider`
 * via `useAgentSettingsSurface`
 * (`features/window-panels/windows/agents/useAgentSettingsSurface.ts`). Before
 * that this manifest was `readiness: "stub"`: it declared a vocabulary nothing
 * ever emitted, so no agent could read it and no write target could have
 * resolved against it.
 *
 * The window owns the tab strip and the view mode; the AGENT's own fields live
 * two levels down in `AgentSettingsForm`, in component state rather than in
 * Redux. So the read half is assembled from two places — the Redux record for
 * everything stored, and the form's live draft (published through
 * `agentSettingsDraftRegistry`) for the four authored fields the user may have
 * edited without saving. `agent_description` / `agent_category` / `agent_tags`
 * therefore mean "what is in the box right now", which is what makes them
 * honest read twins for the write target below.
 *
 * ── Write half: ONE composite target ────────────────────────────────────────
 *
 * `settings_catalog_profile` — `{description?, category?, tags?}` in one
 * atomic write, staged into the form's own `draft` / `tagsInput` state so the
 * Save button arms itself exactly as it does for a human edit and the USER
 * still presses it. Nothing here reaches the database.
 *
 * The three fields are ONE target rather than three because they are re-derived
 * together in a single act — the category and the tags ARE the classification
 * OF the description — and because handlers resolve BEFORE the user confirms
 * the first dialog, so three sibling targets staged in one turn could each land
 * against a different intermediate description. One object cannot.
 *
 * ── The shared contract, and why the NAME is still its own ──────────────────
 *
 * `matrx-user/agent-advanced-editor` already ships `editor_catalog_profile`
 * over these same three columns on the same `agent.definition` row. Two target
 * definitions over the same fields is a defect (the `matrx-user/lists` /
 * `matrx-user/list-manager` precedent), so the CONTRACT is defined once in
 * `features/agents/surface-catalog-profile.ts` — accepted keys, per-field
 * bounds (from the canonical `agent-identity-metadata.ts` validators), the
 * replace-vs-patch semantics, and the prose below — and BOTH manifests import
 * it.
 *
 * What is NOT shared is the target name and the handler, and that is
 * structural rather than lazy:
 *
 *  - The two mounts have DIFFERENT draft containers. The advanced editor stages
 *    into the `agent-definition` Redux slice and commits on its own footer
 *    Save; this form stages into React component state and commits by
 *    dispatching `saveAgentField` per changed field. There is no one handler
 *    that serves both. (The lists precedent shares a handler because both of
 *    its mounts are literally the same component driving the same server
 *    actions.)
 *  - A shared NAME would land the write in the wrong window. Both are floating
 *    windows and they can be open at once — this form's own Messages /
 *    Variables / Tools tiles OPEN the advanced editor — each with its own agent
 *    picker, so the agent open in one is frequently not the agent open in the
 *    other. `applySurfaceWrite` resolves a bare name DEEPEST-FIRST across the
 *    mounted stack, so one shared name would be captured by whichever window
 *    was on top and stage the rewrite into a record the user who pressed Apply
 *    cannot see. That is the exact hazard the `editor_` prefix was invented
 *    for; `settings_` answers it the same way.
 *
 * For the same reason `AgentSettingsForm` registers its handler only when the
 * `writeSurfaceName` prop is passed — `AgentContentWindow` renders that SAME
 * form on the advanced editor's Overview tab, and an ungated registration would
 * let the deeper mount answer for this surface.
 *
 * ── What is deliberately NOT writable ───────────────────────────────────────
 *
 * - **The agent's name.** Doctrine, and consistent with
 *   `agent-advanced-editor`, which excludes it because the name is the
 *   navigation chrome the user is steering by — the tab strip and the sidebar
 *   row are literally rendered from it in this window too.
 * - **`isActive` / `isPublic` / `isFavorite` / `isArchived`.** Visibility and
 *   lifecycle. Publishing an agent to everyone, or archiving it out of
 *   existence, is a permissions/destructive act, not a copy edit.
 * - **The Surface pane** (`SurfaceAgentBindPanel`) — agent↔surface bindings and
 *   value mappings. Changing what an agent may REACH is a capability change;
 *   the same rule `agent-builder` and `agent-advanced-editor` state.
 * - **Hierarchy scopes** (`organizationId` / `taskId`) — they exist to RESTRICT
 *   an agent's visibility and context, so they are permissions-shaped for the
 *   same reason.
 * - **`defaultRagBoost`** — a retrieval-ranking multiplier. Nobody asks an
 *   agent to pick one, and it changes how this agent's content ranks against
 *   everyone else's rather than what it says.
 * - **Save.** The commit stays the user's press, the same line every draft-mode
 *   adopter draws.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import {
  AGENT_SETTINGS_SURFACE_NAME,
  SETTINGS_CATALOG_PROFILE_TARGET,
} from "@/features/agents/constants/agent-settings-surface";
import { agentCatalogProfileTargetDescription } from "@/features/agents/surface-catalog-profile";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "window_state",
    label: "Window state",
    sortOrder: 100,
    description:
      "Which agents the window has open and which pane the user is looking at.",
  },
  {
    key: "agent_catalog",
    label: "Agent catalog copy",
    sortOrder: 200,
    description:
      "The authored fields the Info pane edits — including unsaved changes.",
  },
  {
    key: "agent_status",
    label: "Agent status",
    sortOrder: 300,
    description:
      "Lifecycle and visibility flags, and whether the form has unsaved edits.",
  },
  {
    key: "agent_makeup",
    label: "Agent makeup",
    sortOrder: 400,
    description:
      "Read-only facts about the open agent: model, ownership, and how much it is built out.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "active_agent_id",
    label: "Active agent ID",
    description:
      "UUID of the agent open in the active tab. Empty when no agent tab is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "window_state",
    sortOrder: 300,
  },
  {
    name: "open_agent_ids",
    label: "Open agent tabs",
    description:
      "Array of agent UUIDs open as tabs, in open order. Empty array when none are open.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 150,
    group: "window_state",
    sortOrder: 310,
  },
  {
    name: "panel_view",
    label: "Panel view",
    description:
      '"info" when the agent info editor pane is showing, "surface" when the surface-binding pane is. Always one of the two; "surface" only ever appears when bound_surface_name is set.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    group: "window_state",
    sortOrder: 320,
  },
  {
    name: "bound_surface_name",
    label: "Bound surface",
    description:
      "Canonical name of the surface whose agent bindings are being edited (passed by surface-context openers). Empty when the window was opened without surface context.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "window_state",
    sortOrder: 330,
  },

  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Display name currently in the Name box of the active tab, including unsaved edits. Empty when no agent is open. Not writable from this surface — it is the label the tab strip and sidebar are navigated by.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "agent_catalog",
    sortOrder: 400,
  },
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "Prose currently in the Description box of the active tab, including unsaved edits. Empty when no agent is open or the field has never been filled in.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "agent_catalog",
    sortOrder: 410,
  },
  {
    name: "agent_category",
    label: "Agent category",
    description:
      "Category label currently in the Category picker of the active tab, including unsaved edits. Empty when no agent is open or the agent is uncategorised.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    group: "agent_catalog",
    sortOrder: 420,
  },
  {
    name: "agent_tags",
    label: "Agent tags",
    description:
      "Tags currently in the comma-separated Tags box of the active tab, split and trimmed the way Save will split them, including unsaved edits. Empty array when no agent is open or the agent has no tags.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "agent_catalog",
    sortOrder: 430,
  },
  {
    name: "agent_category_options",
    label: "Categories in use",
    description:
      "Every DISTINCT category already used by the agents loaded in this session, sorted — the same suggestions the Category picker offers. Read this before setting a category so an existing one is reused rather than a near-duplicate invented. Empty array before the agent list has loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "agent_catalog",
    sortOrder: 440,
  },

  {
    name: "agent_is_dirty",
    label: "Has unsaved changes",
    description:
      "True when the Info pane holds edits the user has not saved yet (the Save button is armed). Absent when no agent is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_status",
    sortOrder: 500,
  },
  {
    name: "agent_is_read_only",
    label: "Read-only to this user",
    description:
      "True when the agent is shared with this user as view-only, so nothing in the form can be saved. Absent while access metadata is still loading, or when no agent is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_status",
    sortOrder: 510,
  },
  {
    name: "agent_is_active",
    label: "Active",
    description:
      "State of the Active switch for the open agent. Absent when no agent is open. Not writable from this surface — lifecycle stays a human decision.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_status",
    sortOrder: 520,
  },
  {
    name: "agent_is_favorite",
    label: "Favorite",
    description:
      "State of the Favorite switch for the open agent. Absent when no agent is open.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_status",
    sortOrder: 540,
  },
  {
    name: "agent_is_archived",
    label: "Archived",
    description:
      "State of the Archived switch for the open agent. Absent when no agent is open. Not writable from this surface — archiving is destructive-shaped.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "agent_status",
    sortOrder: 550,
  },

  {
    name: "agent_model_name",
    label: "Model",
    description:
      "Human name of the model the open agent runs on, as shown in the read-only info block. Falls back to the raw model id, and is empty when the agent has no model selected or none is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    group: "agent_makeup",
    sortOrder: 600,
  },
  {
    name: "agent_ownership",
    label: "Ownership",
    description:
      'How the open agent relates to this user, exactly as the info block labels it: the public-agents label for built-in agents, otherwise "Mine" or "Shared". Empty when no agent is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "agent_makeup",
    sortOrder: 610,
  },
  {
    name: "agent_default_rag_boost",
    label: "Default RAG boost",
    description:
      "Retrieval-ranking multiplier applied to this agent's extracted content in RAG search; 0 means no boost and negative values demote. Absent when no agent is open. Not writable from this surface.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "agent_makeup",
    sortOrder: 620,
  },
  {
    name: "agent_message_count",
    label: "Message count",
    description:
      "Number of message templates on the open agent, as shown on the Messages tile. Absent when no agent is open. The messages themselves are edited in the Agent Advanced Editor, not here.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "agent_makeup",
    sortOrder: 630,
  },
  {
    name: "agent_variable_count",
    label: "Variable count",
    description:
      "Number of variable definitions on the open agent, as shown on the Variables tile. Absent when no agent is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "agent_makeup",
    sortOrder: 640,
  },
  {
    name: "agent_tool_count",
    label: "Tool count",
    description:
      "Number of tools plus custom tools on the open agent, as shown on the Tools tile. Absent when no agent is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    group: "agent_makeup",
    sortOrder: 650,
  },
  {
    name: "agent_organization_id",
    label: "Organization scope",
    description:
      "UUID of the organization the open agent is scoped to in the Hierarchy Scopes picker, including unsaved edits. Empty when unscoped or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "agent_makeup",
    sortOrder: 660,
  },
  {
    name: "agent_task_id",
    label: "Task scope",
    description:
      "UUID of the task the open agent is scoped to in the Hierarchy Scopes picker, including unsaved edits. Empty when unscoped or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "agent_makeup",
    sortOrder: 670,
  },
];

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: SETTINGS_CATALOG_PROFILE_TARGET,
    label: "Agent catalog profile",
    // Prose from the SHARED contract — `matrx-user/agent-advanced-editor`
    // declares the same contract under its own target name, and one builder is
    // what stops the two drifting apart. See the file docblock.
    description: agentCatalogProfileTargetDescription({
      tagsReadTwin: "agent_tags",
      landing:
        "Staged into the Agent Settings window's Info pane as unsaved changes; the user reviews and presses Save.",
    }),
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_catalog",
    sortOrder: 400,
  },
];

export const agentSettingsManifest: SurfaceManifest = {
  surfaceName: AGENT_SETTINGS_SURFACE_NAME,
  readiness: "verified",
  overlayId: "agentSettingsWindow",
  label: "Agent Settings",
  intro: `<surface_intro>
You are on Agent Settings — a floating tabbed editor for agent definitions.
active_agent_id is the agent in focus; open_agent_ids are the other open tabs.
When bound_surface_name is set, the window is editing that agent's bindings and
value mappings for that surface (panel_view "surface"); otherwise it edits the
agent's own info (panel_view "info").

Read the values this way:
- The \`agent_*\` values describe the agent open in the ACTIVE tab and reflect
  what is IN THE FORM right now, unsaved edits included — \`agent_is_dirty\`
  tells you whether anything is waiting to be saved.
- \`agent_is_read_only\` being true means the user cannot save at all — propose,
  do not promise to apply.
- \`agent_category_options\` is the live list of categories already in use. Reuse
  one rather than inventing a near-duplicate.

You can WRITE one thing here: \`settings_catalog_profile\`, the agent's catalog
copy — its description, its category and its tags, in one atomic patch. The
agent's NAME is not writable (it is the label the tab strip and sidebar are
navigated by), and neither is anything that decides what this agent can REACH or
who can see it — the Active / Public / Favorite / Archived switches, the
hierarchy scopes, the RAG boost, and the Surface pane's bindings and value
mappings are all human-only. Propose those in your answer instead of trying to
apply them.

Anything you do apply is STAGED in the form and reaches the database only when
the user presses Save, so it is always reviewable and always reversible. You
never press Save — that is the user's.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export function createAgentSettingsScope(values: {
  // Required — the window emits these on every launch, open agent or not.
  open_agent_ids: string[];
  panel_view: string;

  active_agent_id?: string;
  bound_surface_name?: string;

  agent_name?: string;
  agent_description?: string;
  agent_category?: string;
  agent_tags?: string[];
  agent_category_options?: string[];

  agent_is_dirty?: boolean;
  agent_is_read_only?: boolean;
  agent_is_active?: boolean;
  agent_is_favorite?: boolean;
  agent_is_archived?: boolean;

  agent_model_name?: string;
  agent_ownership?: string;
  agent_default_rag_boost?: number;
  agent_message_count?: number;
  agent_variable_count?: number;
  agent_tool_count?: number;
  agent_organization_id?: string;
  agent_task_id?: string;

  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
