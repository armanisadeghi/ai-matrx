/**
 * Mermaid Workbench surface.
 *
 * Declared values an agent bound to `matrx-user/mermaid-editor` receives at
 * launch when the user invokes "Edit with AI" from the workbench. The agent's
 * job is to return ONE full updated ```mermaid fence; the workbench captures
 * the streamed output and applies it as a new version (see
 * components/mermaid/hooks/useMermaidAgentEdit.ts).
 */

import type { SurfaceManifest, SurfaceScopePayload, SurfaceValue } from "@/features/surfaces/types";
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

export const mermaidEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/mermaid-editor",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "diagram_editor",
      label: "Diagram editor",
      description:
        "Agent that edits the current mermaid diagram. Receives the diagram source + editor state and returns ONE full updated ```mermaid fence; the workbench previews it and saves it as a new version.",
      kind: "multi",
      defaultAgentId: null,
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
