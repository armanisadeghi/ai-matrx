/**
 * WidgetHandle — the single contract a widget uses to expose capabilities to
 * a model-driven agent turn.
 *
 * A widget registers a handle once via `useWidgetHandle(handle)`. The launch
 * path stores only the returned id on the invocation (keeping Redux state
 * serializable). On every turn the submit-body assembler looks up the handle
 * via `callbackManager.get(id)`, derives the subset of `widget_*` tool names
 * the handle can service (`deriveClientToolsFromHandle`), and sends those as
 * `client_tools`. The server delegates matching tool calls back via
 * `tool_delegated`; the dispatcher routes each to the handle method whose
 * name is mapped in `WIDGET_TOOL_NAME_TO_HANDLE_METHOD`.
 *
 * Ten canonical tools live in `tool.definition` (category: text or productivity,
 * tag: `widget-capable`). See `WIDGET_TOOLS_SEED.sql` for the authoritative
 * schemas and `CLIENT_SIDE_TOOLS.md` for the stream/POST contract.
 */

// =============================================================================
// Tool name enumeration — drives everything else
// =============================================================================

export const WIDGET_ACTION_NAMES = [
  "widget_text_replace",
  "widget_text_insert_before",
  "widget_text_insert_after",
  "widget_text_prepend",
  "widget_text_append",
  "widget_text_patch",
  "widget_update_field",
  "widget_update_record",
  "widget_attach_media",
  "widget_create_artifact",
] as const;

export type WidgetActionName = (typeof WIDGET_ACTION_NAMES)[number];

// =============================================================================
// Per-action payload types — AUTHOR-FACING
//
// These shapes mirror the `parameters` column of each tool in tool.definition
// exactly. Handle methods receive one of these payloads; the discriminated
// union below is internal to the dispatcher only.
// =============================================================================

export interface TextReplacePayload {
  text: string;
}
export interface TextInsertBeforePayload {
  text: string;
}
export interface TextInsertAfterPayload {
  text: string;
}
export interface TextPrependPayload {
  text: string;
}
export interface TextAppendPayload {
  text: string;
}
export interface TextPatchPayload {
  search_text: string;
  replacement_text: string;
}
export interface UpdateFieldPayload {
  field: string;
  value: unknown;
}
export interface UpdateRecordPayload {
  patch: Record<string, unknown>;
}
export interface AttachMediaPayload {
  url: string;
  mimeType: string;
  title?: string;
  alt?: string;
  position?: "before" | "after" | "inline" | "end";
}
export interface CreateArtifactPayload {
  kind: string;
  data: Record<string, unknown>;
}

/**
 * Internal dispatcher input — the discriminated union the dispatcher narrows
 * on before invoking the correct handle method. Authors should NOT reach for
 * this; use the individual `*Payload` types above or just let TypeScript
 * infer from the handle method signature.
 */
export type WidgetActionInput =
  | { name: "widget_text_replace"; args: TextReplacePayload }
  | { name: "widget_text_insert_before"; args: TextInsertBeforePayload }
  | { name: "widget_text_insert_after"; args: TextInsertAfterPayload }
  | { name: "widget_text_prepend"; args: TextPrependPayload }
  | { name: "widget_text_append"; args: TextAppendPayload }
  | { name: "widget_text_patch"; args: TextPatchPayload }
  | { name: "widget_update_field"; args: UpdateFieldPayload }
  | { name: "widget_update_record"; args: UpdateRecordPayload }
  | { name: "widget_attach_media"; args: AttachMediaPayload }
  | { name: "widget_create_artifact"; args: CreateArtifactPayload };

// =============================================================================
// Result shape — what gets POSTed back to /tool_results
// =============================================================================

export type WidgetActionResult =
  | { ok: true; applied: WidgetActionName }
  | {
      ok: false;
      reason: "unsupported" | "failed" | "not_found";
      message?: string;
      cause?: unknown;
    };

// =============================================================================
// Widget completion payload — what `handle.onComplete` receives
// =============================================================================

export interface WidgetCompletionResult {
  conversationId: string;
  requestId?: string;
  responseText?: string;
}

export interface WidgetErrorPayload {
  reason: string;
  message?: string;
  cause?: unknown;
}

// =============================================================================
// WidgetHandle — the single object the widget registers
//
// All methods OPTIONAL. The subset of action methods that exist determines
// which widget_* tools are offered on each request. Lifecycle methods
// (onComplete/onCancel/onError) are local — they do not show up as tools.
// =============================================================================

export interface WidgetHandle {
  // ── Action methods (one per widget_* tool) ─────────────────────────────
  onTextReplace?: (p: TextReplacePayload) => void | Promise<void>;
  onTextInsertBefore?: (p: TextInsertBeforePayload) => void | Promise<void>;
  onTextInsertAfter?: (p: TextInsertAfterPayload) => void | Promise<void>;
  onTextPrepend?: (p: TextPrependPayload) => void | Promise<void>;
  onTextAppend?: (p: TextAppendPayload) => void | Promise<void>;
  onTextPatch?: (p: TextPatchPayload) => void | Promise<void>;
  onUpdateField?: (p: UpdateFieldPayload) => void | Promise<void>;
  onUpdateRecord?: (p: UpdateRecordPayload) => void | Promise<void>;
  onAttachMedia?: (p: AttachMediaPayload) => void | Promise<void>;
  onCreateArtifact?: (p: CreateArtifactPayload) => void | Promise<void>;

  // ── Lifecycle (non-tool) ───────────────────────────────────────────────
  onComplete?: (result: WidgetCompletionResult) => void;
  onCancel?: () => void;
  onError?: (error: WidgetErrorPayload) => void;
}

// =============================================================================
// Tool-name ↔ handle-method map — used by the dispatcher
// =============================================================================

export const WIDGET_TOOL_NAME_TO_HANDLE_METHOD = {
  widget_text_replace: "onTextReplace",
  widget_text_insert_before: "onTextInsertBefore",
  widget_text_insert_after: "onTextInsertAfter",
  widget_text_prepend: "onTextPrepend",
  widget_text_append: "onTextAppend",
  widget_text_patch: "onTextPatch",
  widget_update_field: "onUpdateField",
  widget_update_record: "onUpdateRecord",
  widget_attach_media: "onAttachMedia",
  widget_create_artifact: "onCreateArtifact",
} as const satisfies Record<WidgetActionName, keyof WidgetHandle>;

export type WidgetHandleMethodKey =
  (typeof WIDGET_TOOL_NAME_TO_HANDLE_METHOD)[WidgetActionName];

// =============================================================================
// Pure helpers
// =============================================================================

/**
 * Derive the subset of widget_* tool names a handle can service.
 * Read per-turn at the submit-body assembler — the handle is the source of
 * truth for current capabilities, so a widget that adds a method between
 * turns starts seeing that capability on the next request.
 */
export function deriveClientToolsFromHandle(
  handle: WidgetHandle | null | undefined,
): WidgetActionName[] {
  if (!handle) return [];
  const out: WidgetActionName[] = [];
  for (const name of WIDGET_ACTION_NAMES) {
    const methodKey = WIDGET_TOOL_NAME_TO_HANDLE_METHOD[name];
    if (typeof handle[methodKey] === "function") {
      out.push(name);
    }
  }
  return out;
}

/**
 * Type guard — tool_delegated events carry an arbitrary string tool_name;
 * this narrows it to our known set before dispatching to the handle.
 */
export function isWidgetActionName(name: string): name is WidgetActionName {
  return (WIDGET_ACTION_NAMES as readonly string[]).includes(name);
}
