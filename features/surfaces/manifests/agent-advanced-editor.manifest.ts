/**
 * Surface manifest — Agent advanced editor (`matrx-user/agent-advanced-editor`).
 *
 * The full-screen / advanced editing overlays opened from the agent builder
 * for large fields: the system instruction, message content, and output schema.
 *
 * This is a text-heavy surface — the user is editing a single large field at a
 * time. Agents bound here are "improve this prompt", "restructure this schema",
 * "rewrite this section" — they need the field being edited plus selection
 * context. The `getTextarea` callback on the context menu supplies
 * selection / text_before / text_after; this manifest adds the field
 * identity and the surrounding agent context.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent whose field is being edited. Empty when no agent context exists.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "editor_field",
    label: "Editor field",
    description:
      'Which agent field is open in the editor: "system_instruction", "message", "output_schema", etc. Empty when unknown.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 310,
  },
  {
    name: "editor_content",
    label: "Editor content",
    description:
      "Full current text of the field being edited. Empty when the editor is empty. Can be large for system instructions / schemas.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 320,
  },
  {
    name: "agent_variable_definitions",
    label: "Agent variable definitions",
    description:
      "Array of the agent's variable definitions — useful for actions that insert or validate variable placeholders. Empty array when none or no agent context.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 330,
  },
  {
    name: "is_dirty",
    label: "Has unsaved changes",
    description:
      "True when the editor has unsaved local edits. False when clean.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
  },
];

export const agentAdvancedEditorManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-advanced-editor",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
};

export function createAgentAdvancedEditorScope(values: {
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  agent_id?: string;
  editor_field?: string;
  editor_content?: string;
  agent_variable_definitions?: unknown[];
  is_dirty?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
