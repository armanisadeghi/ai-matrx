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
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";

/**
 * Canonical grouping, shared by BOTH document surfaces so the two can never
 * drift into different sections for an identical value set.
 */
export const CONVERSATION_DOCUMENT_GROUPS: SurfaceValueGroup[] = [
  {
    key: "active_scope",
    label: "Working selection",
    sortOrder: 100,
    description:
      "What the user is acting on right now — the selection or the whole body, plus the surrounding heading and cursor.",
  },
  {
    key: "document_identity",
    label: "Document identity",
    sortOrder: 200,
    description:
      "Which document this is and where it durably persists.",
  },
  {
    key: "document_state",
    label: "Document state",
    sortOrder: 300,
    description:
      "Live editor state: unsaved/saving/conflict standing, the concurrency version, and size signals.",
  },
  {
    key: "conversation_link",
    label: "Conversation link",
    sortOrder: 400,
    description:
      "The conversation this document hangs off — a reference plus what the link makes available. Never the conversation's own content.",
  },
];

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
    group: "active_scope",
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
    group: "active_scope",
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
    group: "active_scope",
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
    group: "active_scope",
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
    group: "active_scope",
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
    group: "document_identity",
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
    group: "document_identity",
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
    group: "document_identity",
  },
  {
    name: "binding_kind",
    label: "Document binding",
    description:
      'Where the document persists: "cx_working_document" (the durable per-conversation row, the default), "note" (synced to a `workbench.notes` row), "studio_document" (Scribe\'s source), or "none" (ephemeral). Lets an action know whether/where edits durably land.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 330,
    group: "document_identity",
  },
  {
    name: "binding_id",
    label: "Bound source ID",
    description:
      "UUID of the durable row this document persists into, whatever the binding kind is (working-document row, note, or studio document). Empty when the document is ephemeral (`binding_kind` = none). Broader than `document_id`, which is only the working-document row.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 332,
    group: "document_identity",
    autoContext: false,
  },
  {
    name: "binding_label",
    label: "Bound source label",
    description:
      "Display label of the bound source, latched when the binding was made (e.g. the note's title). Empty when unbound or never labeled.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 334,
    group: "document_identity",
    autoContext: false,
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
    group: "document_state",
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
    group: "document_state",
  },
  {
    name: "char_count",
    label: "Character count",
    description:
      "Character length of the document body. Zero when empty. The cheap size signal an action can check before pulling the whole body.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 352,
    group: "document_state",
    autoContext: false,
  },
  {
    name: "is_saving",
    label: "Save in flight",
    description:
      "True while a persist to the bound durable source is in flight. False when idle. Always emitted — the editor always knows its persist state.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 354,
    group: "document_state",
    autoContext: false,
  },
  {
    name: "is_materialized",
    label: "Durable row exists",
    description:
      "True once the durable row actually exists. False while the document is enabled with a reserved id but no row yet (materialize-on-write). Always emitted. An action that writes the row directly must tolerate false.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 356,
    group: "document_state",
    autoContext: false,
  },
  {
    name: "document_version",
    label: "Document version",
    description:
      "The durable row `version` the local content is based on — the optimistic-concurrency token. Zero while the document has no durable row. Always emitted.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 358,
    group: "document_state",
    autoContext: false,
  },
  {
    name: "has_conflict",
    label: "Unresolved edit conflict",
    description:
      "True when the user's save was refused because a concurrent edit (usually the agent this turn) advanced the row, and the conflict is still unresolved. Auto-save is blocked while true — an agent should not write the document until the user reconciles. Always emitted.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 359,
    group: "document_state",
  },
  {
    name: "editor_mode",
    label: "Editor mode",
    description:
      'Which editing surface the user has open — "plain" (raw markdown textarea) or the rich/preview mode. Always emitted; tells an action whether the user is looking at source or rendered output.',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 357,
    group: "document_state",
    autoContext: false,
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
    group: "conversation_link",
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
    group: "conversation_link",
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
    group: "conversation_link",
  },
];

/**
 * Shared `SurfaceWriteTarget[]` for BOTH conversation-document surfaces — the
 * write half of the set above. ONE editor (`WorkingDocumentEditor`) renders both
 * surfaces and ONE handler block services them, so the targets live here for the
 * same reason the values do: two copies would drift, and a target that drifted
 * from its handler is a loud runtime defect by design.
 *
 * WHY THE SAME FOUR TARGETS ARE RIGHT ON BOTH SURFACES:
 * The read/write asymmetry between these two surfaces is about the CLOUD agent
 * in the chat outside — it reads the scratchpad and writes the working document.
 * That asymmetry is enforced where it lives: in the context values the chat
 * publishes (`user_scratchpad` is a read-only context entry) and in the agent's
 * `ctx_patch` path. It says nothing about an agent the user RUNS FROM INSIDE the
 * document, which is the only agent these targets are offered to. Inside either
 * document, acting on the user's own explicit request and behind a per-target
 * confirm, it is just text — so the writable parts are identical, and so are the
 * safety rules below.
 *
 * MODE IS A TRUTH CLAIM, NOT A PREFERENCE — all four are `"entity"`:
 * There is no Save button on this editor. `useWorkingDocument.onChange` (the
 * SAME function every keystroke goes through) writes the canonical slice at once
 * and its 700ms debounce commits to the durable row; the panel chrome literally
 * reads "Auto-saved". So `mode: "draft"` would put "staged — review and save" in
 * a dialog where the user has nothing to save and no way to decline afterwards —
 * a lie, exactly as the `mermaid-editor` adopter found on its own autosaving
 * workbench. `"entity"` says the true thing ("done"), and the descriptions carry
 * the mitigation instead: the commit is optimistic-concurrency checked and every
 * commit is captured in `history.row_versions`, so the previous text is
 * recoverable from the document's version history.
 *
 * Deliberately NOT claimed anywhere below: ⌘Z. This editor mounts no undo stack
 * (unlike `code-editor`'s Monaco or the mermaid workbench's reducer), and a
 * programmatic React value change does not enter the textarea's native undo
 * history. Version history is the real recovery path, so it is the one named.
 *
 * SAFETY RULE EVERY HANDLER ENFORCES — `has_conflict`:
 * True means a save was already refused because a concurrent edit advanced the
 * row, and `useWorkingDocument`'s commit deliberately returns early while it is
 * unresolved. Staging over that is worse than useless: the text would land in
 * the editor, never persist, and enlarge the very merge the user is about to
 * reconcile. Handlers refuse loudly with that reason instead.
 *
 * Deliberately NOT targets:
 * - `document_version` — the optimistic-concurrency token. It is a fact about
 *   which row version the buffer is based on, not a value anyone authors;
 *   writing it would forge the concurrency check the safety story rests on.
 * - `conversation_id` / `conversation_context` / `active_scope_ids` — the
 *   conversation is a REFERENCE, not this surface's content (see the header).
 * - `document_id` / `binding_kind` / `binding_id` / `binding_label` — identity
 *   and where the document persists. Re-pointing a document at a different
 *   durable row is a human gesture with its own picker and merge dialog.
 * - `is_dirty` / `is_saving` / `is_materialized` / `word_count` / `char_count` /
 *   `active_scope_kind` / `current_heading` / `current_section_text` — all
 *   DERIVED from the body. An agent moves them by writing the text; that IS the
 *   evidence loop.
 * - `document_title` — the document auto-names itself from its own content
 *   (`useAutoLabel`) while unnamed, and a non-empty title means the user named
 *   it by hand. A title target would either duplicate the auto-namer or
 *   overwrite a deliberate human choice.
 * - `editor_mode` / `cursor_offset` — which pane a human is looking at, and
 *   where their caret is, are theirs. `cursor_offset` is READ (it aims
 *   `insert_at_cursor`), never written.
 */
export const CONVERSATION_DOCUMENT_WRITE_TARGETS: SurfaceWriteTarget[] = [
  {
    name: "document_content",
    label: "Document content",
    description:
      "REPLACES the ENTIRE document body with the plain text you pass. This is a full replacement, not a merge: read `content` first and include every line that should survive, or use `append_document_content` / `replace_selection` when you only mean to change part of it. Pass the markdown itself — no ``` code fence and no commentary. Must be non-empty; clearing the document is a human gesture, so an empty string is refused. It lands exactly as if the user had typed it — on screen at once, then autosaved to the document about a second later. There is no Save step. Refused while an unresolved edit conflict is pending.",
    valueType: "string",
    updatesValue: "content",
    mode: "entity",
    applyPolicy: "ask",
    group: "active_scope",
    sortOrder: 100,
  },
  {
    name: "append_document_content",
    label: "Added content",
    description:
      "APPENDS the plain text you pass to the END of the document, separated by a blank line. Nothing already in the document is touched or re-sent — pass ONLY the new text, never the whole body. Use this to add a section, an example, or a closing paragraph; use `document_content` when the whole document is being rewritten. No ``` code fence, no commentary. Must be non-empty. It lands exactly as if the user had typed it — on screen at once, then autosaved about a second later, with no Save step. Refused while an unresolved edit conflict is pending.",
    valueType: "string",
    updatesValue: "content",
    mode: "entity",
    applyPolicy: "ask",
    group: "active_scope",
    sortOrder: 110,
  },
  {
    name: "replace_selection",
    label: "Selected text",
    description:
      "REPLACES exactly the user's highlighted range with the plain text you pass — nothing outside the selection is touched. This is the precise target: prefer it whenever `active_scope_kind` is \"selection\", so a rewrite of one paragraph does not resend the whole document. Pass the replacement text only, with no ``` code fence and no commentary. REFUSED when nothing is selected — a select-aware request needs a real selection, and guessing a range would silently overwrite the wrong text; ask the user to highlight the passage instead. Autosaved about a second after it lands; no Save step. Refused while an unresolved edit conflict is pending.",
    valueType: "string",
    updatesValue: "selection",
    mode: "entity",
    applyPolicy: "ask",
    group: "active_scope",
    sortOrder: 120,
  },
  {
    name: "insert_at_cursor",
    label: "Inserted text",
    description:
      "INSERTS the plain text you pass at the user's caret (`cursor_offset`), or immediately AFTER the highlighted range when there is a selection — nothing existing is removed or re-sent. Use this to add a paragraph, a list, or a table at the point the user is working, rather than rewriting what is already there. A blank line is placed around the insertion, so pass the text alone without leading or trailing newlines. No ``` code fence, no commentary. Must be non-empty. Autosaved about a second after it lands; no Save step. Refused while an unresolved edit conflict is pending.",
    valueType: "string",
    updatesValue: "content",
    mode: "entity",
    applyPolicy: "ask",
    group: "active_scope",
    sortOrder: 130,
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
  is_saving: boolean;
  is_materialized: boolean;
  document_version: number;
  has_conflict: boolean;
  editor_mode: string;
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
  binding_id?: string;
  binding_label?: string;
  is_dirty?: boolean;
  word_count?: number;
  char_count?: number;
  conversation_context?: Record<string, unknown>;
  active_scope_ids?: string[];
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
