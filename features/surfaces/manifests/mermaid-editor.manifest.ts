/**
 * Mermaid Workbench surface.
 *
 * Declared values an agent bound to `matrx-user/mermaid-editor` receives at
 * launch. Two flows read them:
 *   - the workbench's "Edit with AI" rail, where the agent's job is to return
 *     ONE full updated ```mermaid fence and the rail captures the streamed
 *     output (see components/mermaid/hooks/useMermaidAgentEdit.ts); and
 *   - any agent run from the header Agents popover, which reads these values
 *     and writes back through the `writeTargets` below.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { DETECTABLE_DIAGRAM_TYPES } from "@/components/mermaid/diagram-type";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "diagram_source",
    label: "Diagram source",
    description:
      "The full mermaid DSL of the diagram currently in the workbench. This is the primary input — the agent edits this and returns an updated version.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 1500,
    sortOrder: 210,
  },
  {
    name: "diagram_type",
    label: "Diagram type",
    description:
      'The mermaid diagram type, e.g. "flowchart", "sequence", "mindmap", "pie", "timeline", "gantt", "state", "er".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 15,
    sortOrder: 220,
  },
  {
    name: "diagram_title",
    label: "Diagram title",
    description: "The diagram's title (from frontmatter or the canvas item title), when set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 230,
  },
  {
    name: "editor_mode",
    label: "Editor mode",
    description: 'Which workbench view the user is in: "visual", "outline", or "code".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 240,
  },
  {
    name: "validation_state",
    label: "Validation state",
    description: 'Whether the current source renders: "valid", "invalid", or "unknown".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 250,
  },
  {
    name: "validation_errors",
    label: "Validation errors",
    description: "Parser diagnostics for the current source (line + message), empty when it renders.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 260,
  },
  {
    name: "selected_node_text",
    label: "Selected element",
    description:
      "Label text of the node or connection the user has selected in visual mode, when any. Lets the agent scope an edit to what the user is looking at.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 270,
  },
  {
    name: "available_diagram_types",
    label: "Available diagram types",
    description:
      "The mermaid diagram types this platform supports, so the agent can suggest a valid conversion if asked.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 300,
    sortOrder: 280,
  },
  {
    name: "canvas_item_id",
    label: "Artifact id",
    description: "The canvas_items row id of the persisted diagram, when it has been saved.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 290,
  },
  {
    name: "version",
    label: "Version",
    description: "Current persisted version number of the diagram artifact.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 300,
  },
  {
    name: "conversation_id",
    label: "Conversation id",
    description: "Origin chat conversation id, when the diagram was created from a chat.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
  },
];

/**
 * Write targets — and why they are NOT a duplicate of the "Edit with AI" rail.
 *
 * The rail (components/mermaid/workbench/AgentEditRail.tsx) is a modal,
 * user-initiated, single-shot flow: the user opens the panel, picks an agent,
 * types one instruction, and that agent's whole contract is "return ONE full
 * ```mermaid fence" which the rail scrapes out of the stream and previews.
 * It cannot be reached by the agent the user already has open in the header
 * Agents popover, it cannot carry a conversation across turns, and it can only
 * ever produce a whole diagram — never a scoped edit like retitling.
 *
 * These targets serve the other half: the bound conversational agent that
 * already reads this surface's scope can now also land what it drafted, turn
 * after turn ("now add a retry branch off the failure node"). Both paths commit
 * through the SAME editor action the rail's Apply button uses
 * (`APPLY_EXTERNAL_SOURCE` on useMermaidEditor) — one undo stack, one autosave,
 * one version history, no parallel write path.
 *
 * Both are `mode: "entity"`, not `"draft"`, and that is a truth claim rather
 * than a preference: the workbench has no Save button. Its debounced autosave
 * (`useMermaidArtifactSave`) persists a new `canvas_items` version off the same
 * source change a person's typing produces, so the `draft` confirm prose
 * ("nothing is saved until you save") would be a lie in this dialog — verified
 * live, the Save indicator flipped to "Saved" seconds after an agent Apply.
 * `entity` says the true thing ("This is saved immediately") and the
 * descriptions carry the mitigation: versioned, undoable, never destructive.
 *
 * Validation is split deliberately. The handlers reject what is not plausibly a
 * diagram at all (empty, fenced, or an unrecognized opening keyword) because
 * staging that is pure garbage. Deeper mermaid validity stays the workbench's
 * existing job: the fidelity gate and renderer already surface diagnostics in
 * place, and those come straight back to the agent as the `validation_state` /
 * `validation_errors` read values — so a diagram that parses but is wrong is a
 * conversation, not a thrown error. Code-only diagram types legitimately fail
 * the structural adapter while rendering perfectly; a handler-side parse would
 * have refused them.
 *
 * Deliberately NOT targets: `canvas_item_id`, `version`, `conversation_id`
 * (identity and history, never drafting), `validation_state` /
 * `validation_errors` (derived from the source — read-only by construction),
 * and `editor_mode` (which pane a human is looking at is theirs to choose).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "diagram_source",
    label: "Diagram source",
    description:
      `Replaces the ENTIRE mermaid source in the open workbench — send the full diagram, not a patch or a snippet (read diagram_source first and include everything you want kept). Raw DSL only: no \`\`\` code fence, no prose. The first significant line must open a supported diagram type: ${DETECTABLE_DIAGRAM_TYPES.join(" | ")}. It lands exactly as if a person had typed it in Code view: on screen at once, then autosaved as a new artifact version — reversible with ⌘Z or from the workbench's version history, never destructive. Refused while the workbench's "Edit with AI" panel has a run in flight.`,
    valueType: "string",
    updatesValue: "diagram_source",
    mode: "entity",
    applyPolicy: "ask",
    sortOrder: 100,
  },
  {
    name: "diagram_title",
    label: "Diagram title",
    description:
      'Sets the diagram\'s title by writing the `title:` key of its YAML frontmatter, adding the frontmatter block when it has none; every other line of the diagram is untouched. Value is a single-line plain string with no quote characters (mermaid frontmatter is YAML and could not read them back). This is the name in the workbench header, the exported file name, and the saved artifact title. Like any edit here it autosaves as a new version and is reversible with ⌘Z or from version history. Write it AFTER diagram_source if you are changing both — a full source replacement carries its own frontmatter and would drop a title set first. Refused while the workbench\'s "Edit with AI" panel has a run in flight.',
    valueType: "string",
    updatesValue: "diagram_title",
    mode: "entity",
    applyPolicy: "ask",
    sortOrder: 110,
  },
];

export const mermaidEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/mermaid-editor",
  readiness: "partial",
  readinessNote: "Bound-agent flow live; completeness not audited",
  label: "Mermaid Editor",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "diagram_editor",
      label: "Diagram editor",
      description:
        "Agent that edits the current mermaid diagram. Receives the diagram source + editor state and returns ONE full updated ```mermaid fence; the workbench previews it and saves it as a new version.",
      kind: "multi",
      // Builtin "Diagram Editor" agent (agent.definition, agent_type='builtin'),
      // seeded 2026-07-07 with the mermaid-diagrams skill via skill_config.included.
      defaultAgentId: "bdaf5ee0-b490-46a4-884c-3786121bb126",
      maxAgents: 5,
      allowCustom: true,
      autoRun: "never",
      sortOrder: 10,
    },
  ],
};

/** Type-safe scope builder for the Mermaid Workbench. */
export function createMermaidEditorScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  diagram_source: string;
  diagram_type: string;
  diagram_title?: string;
  editor_mode: string;
  validation_state: string;
  validation_errors?: Array<{ line: number; message: string }>;
  selected_node_text?: string;
  available_diagram_types: string[];
  canvas_item_id?: string;
  version?: number;
  conversation_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
