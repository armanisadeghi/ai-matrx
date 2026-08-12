/**
 * Surface manifest — Agent advanced editor (`matrx-user/agent-advanced-editor`).
 *
 * The windowed advanced editor for ONE agent (`agent-advanced-editor-window`,
 * route `/agents/edit`), opened from the agent builder and from the floating
 * windows tray. It is a whole-agent editor behind tabs — Overview, System
 * Instructions, Messages, Settings (which hosts the Output Schema editor),
 * Variables, Tools, Context, Share, Run, History, Versions, JSON — not the
 * single-field overlay an earlier draft of this docblock described.
 *
 * Emitter + handlers: `AgentContentWindow` mounts the surface's
 * `SurfaceRuntimeProvider` via `useAgentAdvancedEditorSurface`
 * (`features/window-panels/windows/agents/useAgentAdvancedEditorSurface.ts`).
 * Before that hook existed this surface had NO runtime provider at all, so
 * nothing it declared ever resolved.
 *
 * It edits the SAME Redux record as `matrx-user/agent-builder`
 * (`agent-definition` slice) through the SAME actions, and shares its commit
 * line: the footer Save button (or a tab's own inline save). Nothing here
 * reaches the database.
 *
 * ── Why every target name is prefixed `editor_` ─────────────────────────────
 *
 * NOT cosmetic, and not negotiable: this is a floating WINDOW, so its provider
 * registers at whatever depth the overlay host sits at and a ROUTE's provider
 * can out-depth it. `applySurfaceWrite` resolves a bare target NAME against
 * the deepest surface that DECLARES it — so a target here spelled
 * `system_instruction`, the name `matrx-user/agent-builder` already uses,
 * would be captured by the builder behind the window whenever the user opens
 * this editor on `/agents/[id]/build`. That is not harmless even though both
 * write the same Redux slice: this window has its own agent picker and
 * multi-agent tab strip, so the agent open HERE is frequently not the agent
 * the builder route has open, and the write would land in the wrong record —
 * one the user who just confirmed the dialog cannot see. `matrx-user/
 * quick-tasks` hit exactly this and answered it with `panel_*`; this surface
 * answers it with `editor_*`, and each description names the window out loud
 * so the agent knows which of two open editors it is writing into.
 *
 * ── Write half: why these four targets, in this shape ───────────────────────
 *
 * ONE composite + three singles, decided per target rather than by habit:
 *
 * - `editor_catalog_profile` is ONE object ({description, category, tags})
 *   because those three are re-derived together in a single act — the category
 *   and the tags ARE the classification OF the description — and they are
 *   consumed by one commit and one catalog row. Same reasoning as
 *   `image-generate`'s `generation_request` and `quick-note-save`'s
 *   `note_draft`. Atomicity is also a correctness property here: an agent that
 *   stages several targets in one turn has every handler resolved BEFORE the
 *   user confirms the first dialog, so three sibling targets could each land
 *   against a different intermediate description. One object cannot.
 *   Its contract — accepted keys, per-field bounds, and the prose the model
 *   reads — is NOT defined here: it lives in
 *   `features/agents/surface-catalog-profile.ts`, because
 *   `matrx-user/agent-settings` writes the same three columns on the same
 *   agent from the Agent Settings window and two definitions over the same
 *   fields is a defect. The two keep separate target NAMES on purpose (see
 *   that file) but share ONE contract, so they cannot drift. That lift also
 *   moved this target onto the canonical bounds in
 *   `agent-identity-metadata.ts` — lengths, tag count, duplicate and comma
 *   rules it previously did not enforce, and now states in its description.
 * - `system_instruction` and `append_system_instruction` stay separate from
 *   the profile and from each other: a different decision with a different
 *   consumer (the model's preamble, not the catalog listing), and the
 *   replace/append pair is the `agent-builder` / `markdown-editor` precedent —
 *   append is what saves an agent from re-sending 4,000 characters to add one
 *   paragraph.
 * - `output_schema` stays separate: an independent decision consumed by the
 *   provider's response format and by Content-IR kind binding.
 *
 * A fifth shape was considered and REJECTED: one polymorphic target that
 * writes "whatever field is currently open". This window has twelve tabs, so
 * "the field being edited" is genuinely ambiguous, and because handlers
 * resolve before the user confirms, such a target would land text in whichever
 * tab happened to be open at resolve time rather than the one the user was
 * looking at when they pressed Apply. Named targets cannot miss.
 *
 * ── What is deliberately NOT writable ───────────────────────────────────────
 *
 * Identity and ownership (`agent_id`, user/org, lineage, version records),
 * governance (`is_public`, `is_active`, `is_archived`, favorites, the Share
 * tab's access grants), and capability/wiring (model, model tiers, tools,
 * custom tools, MCP servers, skill config, Matrx-action policy, context slots,
 * variable definitions, UI gates) are all human-only: changing what an agent
 * may REACH, or who may see it, is not a copy edit. Message templates
 * (`agent_messages`) are excluded too — they are nested block arrays with no
 * single canonical field-level write path, and a malformed array silently
 * destroys priming turns.
 *
 * And NO target commits. Save, publish-a-version, refresh-from-server and the
 * agent-switch discard guard stay the user's press, the same line
 * `image-generate` draws at Generate, `scraper` at Scrape and
 * `quick-note-save` at Save Note.
 *
 * `agent_name` is writable on `agent-builder` but NOT here — a deliberate
 * narrowing, not an oversight. On this window the name is navigation chrome:
 * the footer EntityRef, the multi-agent tab strip, and the sidebar row the
 * user is steering by. Renaming the thing someone is navigating by is a
 * different act from improving its prose.
 *
 * `output_schema` is the one place this surface is BROADER than
 * `agent-builder`, whose docblock lists output schema among its exclusions.
 * That grouping reads as over-broad: the output schema is the shape the agent
 * EMITS, not a capability it reaches — authored structured content, the
 * closest thing to a prompt in JSON form — and restructuring it is a job this
 * window exists to do. It lands through `setAgentOutputSchema`, the same
 * action the Output Schema tab's own Apply button dispatches, it is gated by
 * the product's real validator (`validateOutputSchema`), and it is staged, not
 * saved. Clearing the schema is still not offered. Worth reconciling the two
 * manifests in one direction later; flagged rather than silently diverged.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { agentCatalogProfileTargetDescription } from "@/features/agents/surface-catalog-profile";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "agent_identity",
    label: "Agent identity",
    sortOrder: 100,
    description: "Which agent is open in the window and how it is catalogued.",
  },
  {
    key: "agent_definition",
    label: "Agent definition",
    sortOrder: 200,
    description:
      "The authored body of the agent — its system instruction, output contract, and declared variables.",
  },
  {
    key: "editor_state",
    label: "Editor state",
    sortOrder: 300,
    description:
      "Which tab of the advanced editor is open, what is in it, and whether anything is unsaved.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Agent identity (300-339) ──────────────────────────────────────────
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent open in the editor. Empty when the window is showing the agent picker instead.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "agent_identity",
    sortOrder: 300,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Display name of the agent open in the editor. Empty when no agent is open. Read-only from this surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "agent_identity",
    sortOrder: 310,
  },
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "The agent's stored description — the prose shown in agent lists and the catalog. Empty when unset or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "agent_identity",
    sortOrder: 320,
  },
  {
    name: "agent_category",
    label: "Agent category",
    description:
      "Catalog category the agent is filed under. Empty when uncategorised or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "agent_identity",
    sortOrder: 325,
  },
  {
    name: "agent_tags",
    label: "Agent tags",
    description:
      "Array of tag strings on the open agent. Empty array when the agent has no tags or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 100,
    group: "agent_identity",
    sortOrder: 330,
  },

  // ── Agent definition (340-379) ────────────────────────────────────────
  {
    name: "system_instruction",
    label: "System instruction",
    description:
      "The agent's full system prompt as it currently stands in the editor, including unsaved edits. Empty when the agent has no system instruction. Can be several thousand characters.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    group: "agent_definition",
    sortOrder: 340,
  },
  {
    name: "agent_output_schema",
    label: "Agent output schema",
    description:
      "Structured-output envelope ({name, description?, schema, strict?}) describing what the agent emits. Empty when the agent returns unstructured text.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    group: "agent_definition",
    sortOrder: 350,
  },
  {
    name: "agent_variable_definitions",
    label: "Agent variable definitions",
    description:
      "Array of the agent's variable definitions — useful for actions that insert or validate variable placeholders in the system instruction. Empty array when none or no agent context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "agent_definition",
    sortOrder: 360,
  },

  // ── Editor state (400-440) ────────────────────────────────────────────
  {
    name: "editor_field",
    label: "Open editor tab",
    description:
      'Which tab of the advanced editor is open: "overview", "system", "messages", "settings", "variables", "tools", "context", "share", "run", "history", "versions" or "json". Act on this part of the agent unless asked otherwise.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "editor_state",
    sortOrder: 400,
  },
  {
    name: "editor_content",
    label: "Open editor content",
    description:
      "Full text of the large field the open tab edits: the system instruction on the System Instructions tab, the serialized agent definition on the JSON tab. Empty on tabs that have no single large text field.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    group: "editor_state",
    sortOrder: 410,
  },
  {
    name: "is_dirty",
    label: "Has unsaved changes",
    description:
      "True when the editor holds local edits that have not been persisted to the agent row. False when the saved and in-editor states match.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "editor_state",
    sortOrder: 420,
  },
  {
    name: "dirty_fields",
    label: "Unsaved field names",
    description:
      "Array of agent-definition field names with unsaved local edits. Empty array when the editor is clean.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 120,
    group: "editor_state",
    sortOrder: 430,
  },
  {
    name: "agent_is_read_only",
    label: "Editor is read-only",
    description:
      "True when the current user cannot save this agent (view-only share, or a frozen version snapshot). Propose changes instead of applying them when this is true.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "editor_state",
    sortOrder: 440,
  },
];

/**
 * Every target is `mode: "draft"` + `applyPolicy: "ask"`: the value is staged
 * into the same Redux record the user's own typing edits (marking the window
 * dirty), the confirm dialog names the target before anything moves, and
 * NOTHING reaches the database until the user presses Save. See the file
 * docblock for the composite-vs-separate reasoning and the exclusion list.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "editor_system_instruction",
    label: "System instruction",
    description:
      "REPLACES the entire system prompt of the agent open in the Agent Advanced Editor WINDOW with the text you pass. Value: plain text — not JSON, not JSON-encoded, no surrounding quotes, real newlines. This is a full replacement, not a merge: read the `system_instruction` value first and include everything you want kept, or use `editor_append_system_instruction` when you only mean to add. Files and images attached to the system message are preserved. Staged into the editor as unsaved changes; the user reviews and presses Save.",
    valueType: "string",
    updatesValue: "system_instruction",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_definition",
    sortOrder: 100,
  },
  {
    name: "editor_append_system_instruction",
    label: "Added system instruction",
    description:
      "APPENDS the text you pass to the end of the existing system prompt of the agent open in the Agent Advanced Editor WINDOW, separated by a blank line. Nothing already in the prompt is touched or re-sent — pass ONLY the new text. Use this for adding a rule, a constraint or a section; use `editor_system_instruction` when the whole prompt is being rewritten. Value: plain text, not JSON and not JSON-encoded. Staged into the editor as unsaved changes; the user reviews and presses Save.",
    valueType: "string",
    updatesValue: "system_instruction",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_definition",
    sortOrder: 110,
  },
  {
    name: "editor_output_schema",
    label: "Output schema",
    description:
      'REPLACES the agent\'s structured-output schema. Value: a JSON OBJECT (not a string of JSON) shaped {"name": "snake_or_dash_name", "description": "optional", "strict": true, "schema": {"type": "object", "additionalProperties": false, "properties": {...}, "required": [...]}}. Read the `agent_output_schema` value first — this is a full replacement, and every downstream consumer keys off the property names. Rejected with the reason if `name` is missing/malformed, `schema` is absent, or the root schema type is not "object". The schema cannot be cleared from here.',
    valueType: "object",
    updatesValue: "agent_output_schema",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_definition",
    sortOrder: 120,
  },
  {
    name: "editor_catalog_profile",
    label: "Agent catalog profile",
    // Prose from the SHARED contract (`features/agents/surface-catalog-profile.ts`)
    // — `matrx-user/agent-settings` declares the same contract under its own
    // target name, and one builder is what stops the two drifting apart.
    description: agentCatalogProfileTargetDescription({
      tagsReadTwin: "agent_tags",
      landing:
        "Staged into the editor as unsaved changes; the user reviews and presses Save.",
    }),
    valueType: "object",
    mode: "draft",
    applyPolicy: "ask",
    group: "agent_identity",
    sortOrder: 200,
  },
];

export const agentAdvancedEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-advanced-editor",
  readiness: "verified",
  label: "Agent Advanced Editor",
  // No `urlPattern`: this is a floating WINDOW, opened over whatever route the
  // user is on, so the provider — not the URL — is what puts the surface live.
  // `route-to-surface.ts` still maps the `/agents/edit` prefix here, but no
  // page is mounted at that path today, so claiming it as the pattern would be
  // a lie the Surface Context panel would repeat.
  intro: `<surface_intro>
The Agent Advanced Editor is a windowed, whole-agent editor for ONE agent,
opened over whatever page the user was on. Its tabs cover the agent's system
instruction, message templates, settings and output schema, variables, tools,
context slots, sharing, run, history and versions.

Read the values this way:
- \`editor_field\` is the tab the user has open and \`editor_content\` is the
  large field inside it — act on that part of the agent unless asked
  otherwise.
- The \`agent_*\` values are the definition as it currently stands INCLUDING
  unsaved edits; \`is_dirty\` and \`dirty_fields\` tell you what has not been
  saved.
- \`agent_is_read_only\` being true means the user cannot save — propose, do
  not promise to apply.

You can WRITE here, but only to the authored body: the system instruction
(\`editor_system_instruction\` to replace, \`editor_append_system_instruction\`
to add), the output schema, and the catalog profile (description,
category, tags). Everything that decides what this agent can REACH or who can
see it — model, tools, MCP servers, skills, variables, context slots,
visibility, sharing — is human-only, so propose those in your answer instead
of trying to apply them. The agent's name is not writable from this window
either.

Every write you apply is STAGED in the editor and reaches the database only
when the user presses Save, so a rewrite is always reviewable and always
reversible. You never press Save — that is the user's.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline(
      "selection",
      "text_before",
      "text_after",
      "content",
      "context",
    ),
    surfaceSpecific,
  ),
  writeTargets,
};

export function createAgentAdvancedEditorScope(values: {
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  agent_id?: string;
  agent_name?: string;
  agent_description?: string;
  agent_category?: string;
  agent_tags?: string[];
  system_instruction?: string;
  agent_output_schema?: Record<string, unknown>;
  agent_variable_definitions?: unknown[];
  editor_field?: string;
  editor_content?: string;
  is_dirty?: boolean;
  dirty_fields?: string[];
  agent_is_read_only?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
