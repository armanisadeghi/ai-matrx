/**
 * Surface manifest — Assistant/user message thread (`matrx-user/assistant-message`).
 *
 * The READ side of chat: the rendered, read-only conversation thread the user
 * right-clicks on (`AgentConversationDisplay` on `/chat`, wrapping the thread
 * in the v3 `NonEditableContextMenu`). Distinct from `matrx-user/chat` — that is the
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
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "message_identity",
    label: "Message identity",
    sortOrder: 100,
    description: "Which conversation and which message the user acted on.",
  },
  {
    key: "block_context",
    label: "Block context",
    sortOrder: 200,
    description:
      "The specific rendered content block under the right-click: kind, tool, language, artifact, diagram source.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Message identity ──────────────────────────────────────────────────
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the conversation the rendered thread belongs to. Written unconditionally by the resolver on every right-click — always present on this surface.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "message_identity",
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
    group: "message_identity",
  },

  // ── Block context ─────────────────────────────────────────────────────
  {
    name: "block_type",
    label: "Clicked block type",
    description:
      'Kind of the content block the user right-clicked ("code", "mermaid", "tool", …). Empty when the click was not on a tagged block.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 320,
    group: "block_context",
  },
  {
    name: "block_id",
    label: "Clicked block ID",
    description:
      "Stable id of the content block the user right-clicked (the renderer's block id, not a DB row). Empty when the click was not on a tagged block.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 325,
    group: "block_context",
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
    group: "block_context",
  },
  {
    name: "language",
    label: "Code language",
    description:
      "Language tag of a right-clicked fenced code block (e.g. python, tsx). Empty for non-code blocks or untagged fences.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 335,
    group: "block_context",
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
    group: "block_context",
  },
  {
    name: "artifact_type",
    label: "Artifact type",
    description:
      "Artifact type of the right-clicked block when it renders (or materialized into) an artifact. Empty for non-artifact blocks.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 345,
    group: "block_context",
  },
  {
    name: "artifact_id",
    label: "Artifact ID",
    description:
      "canvas_items row id when the right-clicked block is a materialized artifact. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 350,
    group: "block_context",
  },
];

export const assistantMessageManifest: SurfaceManifest = {
  surfaceName: "matrx-user/assistant-message",
  readiness: "verified",
  label: "Assistant Message",
  urlPattern: "/chat",
  intro: `<surface_intro>
You are on the rendered, read-only conversation thread — the user right-clicked a specific message or content block inside it.
conversation_id is always present; everything else depends on WHERE the click landed. content (baseline) carries the clicked block's or message's text and is the primary thing to act on; for mermaid blocks, diagram_source carries the real DSL (prefer it over the rendered label text).
This surface is for acting ON rendered output (explain, transform, extract, save). Composing the next message belongs to the matrx-user/chat surface.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createAssistantMessageScope(values: {
  // alwaysAvailable: true → required. The resolver writes it unconditionally.
  conversation_id: string;
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  message_id?: string;
  block_type?: string;
  block_id?: string;
  tool_name?: string;
  language?: string;
  diagram_source?: string;
  artifact_type?: string;
  artifact_id?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
