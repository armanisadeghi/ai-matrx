/**
 * Surface wiring for the per-conversation document editors —
 * `matrx-user/working-document` and `matrx-user/scratchpad`.
 *
 * Holds the surface-name + source-feature mapping (by document kind), the
 * `UnifiedAgentContextMenu` prop bundle, the host-context contract a rendering
 * page passes in, and the pure scope-data builder. The live `() => scope`
 * builder is `useWorkingDocumentSurfaceScope`.
 *
 * Models the canonical /notes wiring (`buildNotesEditorContextData` +
 * `NOTES_EDITOR_CONTEXT_MENU_PROPS`) — NOT the deleted bespoke NoteContextMenu.
 */

import { PLACEMENT_TYPES } from "@/features/agent-shortcuts/constants";
import {
  countWords,
  findCurrentHeading,
} from "@/features/notes/utils/markdown-headings";
import { formatEditorSurroundContext } from "@/utils/format-editor-surround-context";
import { createConversationDocumentScope } from "@/features/surfaces/manifests/_conversation-document.manifest";
import type { WorkingDocumentBinding, WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import type { SourceFeature } from "@/features/agents/types/instance.types";

export const WORKING_DOCUMENT_SURFACE_NAME = "matrx-user/working-document" as const;
export const SCRATCHPAD_SURFACE_NAME = "matrx-user/scratchpad" as const;

/** The `ui_surface.name` for a document kind. */
export function surfaceNameForKind(kind: WorkingDocumentKind): string {
  return kind === "scratch"
    ? SCRATCHPAD_SURFACE_NAME
    : WORKING_DOCUMENT_SURFACE_NAME;
}

/** The trace attribution literal for a document kind. */
export function sourceFeatureForKind(kind: WorkingDocumentKind): SourceFeature {
  return kind === "scratch" ? "scratchpad" : "working-document";
}

/** Placements the document surfaces expose in the context menu. */
const DOC_CONTEXT_MENU_PLACEMENTS = [
  PLACEMENT_TYPES.AI_ACTION,
  PLACEMENT_TYPES.CONTENT_BLOCK,
  PLACEMENT_TYPES.QUICK_ACTION,
] as const;

/** `UnifiedAgentContextMenu` prop bundle for a document kind. */
export function workingDocumentContextMenuProps(kind: WorkingDocumentKind) {
  return {
    sourceFeature: sourceFeatureForKind(kind),
    surfaceName: surfaceNameForKind(kind),
    isEditable: true as const,
    enabledPlacements: [...DOC_CONTEXT_MENU_PLACEMENTS],
  };
}

/**
 * Context the host PAGE supplies to the document surface. The document carries
 * the host's conversation state in as props so agents acting inside it see what
 * the chat agent sees. `getHostContext` is read at trigger time (never frozen).
 * When omitted, the scope hook derives the conversation context from Redux by
 * `conversationId` — a document is always conversation-scoped.
 */
export interface WorkingDocumentSurfaceContext {
  /** Where this panel is mounted — for trace attribution. */
  sourceFeature?: SourceFeature;
  /** The conversation the document is attached to (always present). */
  conversationId: string;
  /** Live host context, read at agent-launch time. */
  getHostContext?: () => {
    /** The conversation's assembled context dict (instanceContext entries). */
    conversationContext?: Record<string, unknown>;
    /** Active scope selections (scope UUIDs) in the host conversation. */
    activeScopeIds?: string[];
  };
}

const TEXT_NEIGHBOR_CHARS = 500;

export interface BuildConversationDocumentContextDataArgs {
  conversationId: string;
  kind: WorkingDocumentKind;
  /** Full document body. */
  content: string;
  selectionStart: number;
  selectionEnd: number;
  title?: string;
  binding?: WorkingDocumentBinding;
  isDirty?: boolean;
  /** Host conversation context dict (instanceContext entries by key). */
  conversationContext?: Record<string, unknown>;
  /** Active scope UUIDs selected in the host conversation. */
  activeScopeIds?: string[];
}

/**
 * Canonical `contextData` for the conversation-document surfaces. Pure — the
 * hook and any demo share one shape. The document's PARTS are the context; the
 * conversation enters only as `conversation_id` + the supplied dict.
 */
export function buildConversationDocumentContextData(
  args: BuildConversationDocumentContextDataArgs,
): Record<string, unknown> {
  const {
    conversationId,
    kind,
    content,
    selectionStart,
    selectionEnd,
    title,
    binding,
    isDirty = false,
    conversationContext,
    activeScopeIds,
  } = args;

  const text = content ?? "";
  const hasSelection = selectionEnd > selectionStart;
  const selectedText = hasSelection
    ? text.slice(selectionStart, selectionEnd)
    : "";

  const textBefore = text.slice(
    Math.max(0, selectionStart - TEXT_NEIGHBOR_CHARS),
    selectionStart,
  );
  const textAfter = text.slice(
    selectionEnd,
    Math.min(text.length, selectionEnd + TEXT_NEIGHBOR_CHARS),
  );

  const docHasContent = text.trim().length > 0;
  const activeScopeKind: "selection" | "document" | "empty" = !docHasContent
    ? "empty"
    : hasSelection
      ? "selection"
      : "document";
  const activeText = hasSelection ? selectedText : docHasContent ? text : "";

  const { heading, sectionText } = findCurrentHeading(text, selectionStart);
  const surround = formatEditorSurroundContext(text, {
    selectionStart,
    selectionEnd,
  });

  const documentId =
    binding?.kind === "cx_working_document" && binding.id ? binding.id : undefined;

  const scope = createConversationDocumentScope({
    active_scope_kind: activeScopeKind,
    document_kind: kind,
    conversation_id: conversationId,

    selection: selectedText || undefined,
    text_before: textBefore || undefined,
    text_after: textAfter || undefined,
    content: docHasContent ? text : undefined,
    active_text: activeText || undefined,
    current_heading: heading ?? undefined,
    current_section_text: sectionText ?? undefined,
    cursor_offset: docHasContent ? selectionStart : undefined,

    document_id: documentId,
    document_title: title || undefined,
    binding_kind: binding?.kind || undefined,
    is_dirty: isDirty,
    word_count: docHasContent ? countWords(text) : undefined,

    conversation_context:
      conversationContext && Object.keys(conversationContext).length > 0
        ? conversationContext
        : undefined,
    active_scope_ids:
      activeScopeIds && activeScopeIds.length > 0 ? activeScopeIds : undefined,

    context: surround,
  });

  return scope as Record<string, unknown>;
}
