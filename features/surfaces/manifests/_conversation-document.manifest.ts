/**
 * Shared SurfaceValue set for the per-conversation document surfaces —
 * `matrx-user/working-document` and `matrx-user/scratchpad`.
 *
 * WHY TWO SURFACES FROM ONE VALUE SET:
 * The working document (agent reads + writes) and the scratchpad (the cloud
 * agent only reads; a local context-menu agent edits it) serve DIFFERENT
 * purposes, so they bind DIFFERENT custom agents — which is exactly what a
 * surface is for. But once you STEP INSIDE either one, it is "just text": the
 * context items are the document's own parts (its body, selection, id, title),
 * identical in shape. So the two surfaces share this one value set + scope
 * helper, and differ only in `surfaceName` (and therefore in which agents are
 * bound). See `features/surfaces/FEATURE.md` → "Surfaces are recursive".
 *
 * THE CONVERSATION IS A REFERENCE, NOT THE CONTEXT:
 * Outside, in chat, the document is a single context item handed to the
 * conversation's agent. Inside the document surface it is no longer that — its
 * PARTS are the context. The conversation it hangs off is exposed as a link
 * (`conversation_id`) plus, made-available-through-the-relationship, the
 * conversation's own context dict (`conversation_context`) and scope selections
 * (`active_scope_ids`). You never attach the whole document, or the whole
 * conversation, as this surface's context — only the individual parts.
 */

import type {
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";

export const CONVERSATION_DOCUMENT_VALUES: SurfaceValue[] = [
  // ── Selection / scope mirror (210-259) ─────────────────────────────────
  {
    name: "active_text",
    label: "Active text",
    description:
      "What the user is acting on: the highlighted selection if any text is selected, otherwise the full document body. Empty when the document is empty. Wire here for an agent that should follow the user's intent — 'run on selection if there is one, run on the whole document otherwise'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 210,
  },
  {
    name: "active_scope_kind",
    label: "Active scope kind",
    description:
      '"selection" when text is highlighted, "document" when no selection but the document has content, "empty" when the document is empty. Lets an agent reason about what `active_text` represents on this run.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 220,
  },
  {
    name: "current_heading",
    label: "Current heading",
    description:
      "Nearest markdown heading above the cursor, with leading hashes stripped. Empty when no heading precedes the cursor. Lets section-aware actions target the surrounding heading without parsing the markdown themselves.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 230,
  },
  {
    name: "current_section_text",
    label: "Current section text",
    description:
      "Text under `current_heading`, from the heading line through to (but not including) the next heading of equal or higher level — or end of document. Empty when no heading precedes the cursor. Wire here for 'rewrite this section' actions that operate on a heading-bounded block.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 240,
  },
  {
    name: "cursor_offset",
    label: "Cursor character offset",
    description:
      "0-indexed character offset of the cursor into the document body. When a selection exists this is `selectionStart`. Useful for 'insert at cursor' actions. Zero when the document is empty.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 250,
  },

  // ── Document identity & metadata (300-359) ─────────────────────────────
  {
    name: "document_id",
    label: "Document ID",
    description:
      "UUID of the durable `cx_working_documents` row backing this document. Empty while the document is ephemeral (Redux-only) or bound to a note instead. Required for any action that writes the durable row directly.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "document_title",
    label: "Document title",
    description:
      "User-given title of the document. Empty when the user hasn't named it yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "document_kind",
    label: "Document kind",
    description:
      '"working" for the shared collaborative document (the cloud agent reads and writes it) or "scratch" for the user\'s private scratchpad (the cloud agent only reads it). Always present — it is fixed per surface.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 320,
  },
  {
    name: "binding_kind",
    label: "Document binding",
    description:
      'Where the document persists: "cx_working_document" (the durable per-conversation row, the default), "note" (synced to a `public.notes` row), "studio_document" (Scribe\'s source), or "none" (ephemeral). Lets an action know whether/where edits durably land.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 330,
  },
  {
    name: "is_dirty",
    label: "Has unsaved changes",
    description:
      "True when the editor has local edits not yet persisted to the durable source. False when clean. Lets an agent prompt to save first or refuse to act on stale state.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 340,
  },
  {
    name: "word_count",
    label: "Word count",
    description:
      "Whitespace-delimited word count of the document body. Zero when empty. Lets actions adapt to content size (summarize-vs-skip thresholds).",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 350,
  },

  // ── Conversation relationship (360-389) ────────────────────────────────
  // The document HANGS OFF a conversation but the conversation is not its
  // context — it's a reference plus the dict made available through the link.
  {
    name: "conversation_id",
    label: "Conversation ID",
    description:
      "UUID of the conversation this document is attached to. Always present (a document is always conversation-scoped). A reference/link — not the conversation's content. Use to relate the document back to its chat.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 360,
  },
  {
    name: "conversation_context",
    label: "Conversation context",
    description:
      "The host conversation's assembled context dict (its instanceContext entries — scope values, working-doc value, ambient context) made available to agents acting inside the document. Empty object when the host supplied none. Bind here when a document-surface agent should also see what the chat agent sees.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 370,
  },
  {
    name: "active_scope_ids",
    label: "Active scope IDs",
    description:
      "Array of scope UUIDs the user has selected as active context in the host conversation (org / department / case / patient, etc.). Empty array when none. Lets a document-surface agent resolve the same scope cells the chat agent uses.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 360,
    sortOrder: 380,
  },
];

/** "working" → working document, "scratch" → scratchpad. */
export type ConversationDocumentKind = "working" | "scratch";

/**
 * Type-safe payload helper shared by both conversation-document surfaces. Required
 * keys (no `?`) mirror every `alwaysAvailable: true` value above; optional keys
 * (`?`) mirror `alwaysAvailable: false`. The surface code calls this so TS
 * catches missing required keys / unknown keys at the callsite.
 */
export function createConversationDocumentScope(values: {
  // alwaysAvailable: true → required
  active_scope_kind: "selection" | "document" | "empty";
  document_kind: ConversationDocumentKind;
  conversation_id: string;
  // alwaysAvailable: false → optional
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown> | string;
  active_text?: string;
  current_heading?: string;
  current_section_text?: string;
  cursor_offset?: number;
  document_id?: string;
  document_title?: string;
  binding_kind?: string;
  is_dirty?: boolean;
  word_count?: number;
  conversation_context?: Record<string, unknown>;
  active_scope_ids?: string[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
