/**
 * Surface manifest — Assistant/user message thread (`matrx-user/assistant-message`).
 *
 * The READ side of chat: the rendered, read-only conversation thread the user
 * right-clicks on (`AgentConversationDisplay` on `/chat`, and any surface using
 * `MarkdownContextMenuProvider`). Distinct from `matrx-user/chat` — that is the
 * composer/runtime surface (input draft, streaming state, all_messages); this is
 * the rendered output, where the meaningful act is right-clicking a specific
 * message or content block.
 *
 * Values are resolved from the DOM at right-click time by `resolveMarkdownContext`
 * (message id / block type / tool name / mermaid source), so every one is
 * `alwaysAvailable: false` — what lands in scope depends on WHERE the user
 * clicked. `content` (baseline) is the clicked block's or message's text and is
 * the primary bindable value for read-only "act on this" agents.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the conversation the message thread belongs to. Always present on this surface.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "message_id",
    label: "Clicked message ID",
    description:
      "ID of the message the user right-clicked. Empty when the click was not on a message.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
  },
  {
    name: "block_type",
    label: "Clicked block type",
    description:
      'Kind of the content block the user right-clicked ("code", "mermaid", "tool", …). Empty when the click was not on a tagged block.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 320,
  },
  {
    name: "tool_name",
    label: "Clicked tool name",
    description:
      "Name of the tool for a right-clicked tool-call block. Empty for non-tool blocks.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 330,
  },
  {
    name: "diagram_source",
    label: "Diagram source",
    description:
      "Raw diagram DSL for a right-clicked mermaid block (the source, not the rendered SVG label text). Empty for non-diagram blocks.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 340,
  },
];

export const assistantMessageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/assistant-message",
  label: "Assistant Message",
  urlPattern: "/chat",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createAssistantMessageScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  conversation_id?: string;
  message_id?: string;
  block_type?: string;
  tool_name?: string;
  diagram_source?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
