"use client";

import { useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { NoteEditorCore } from "@/features/notes/components/NoteEditorCore";
import type { ContentSource } from "@/features/rich-document/types";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { useWorkingDocViewState } from "./workingDocumentViewStore";
import { useWorkingDocumentSurfaceScope } from "./useWorkingDocumentSurfaceScope";
import {
  workingDocumentContextMenuProps,
  type WorkingDocumentSurfaceContext,
} from "./workingDocumentSurface";

// Canonical agent context menu (the SAME one /chat and /notes use — one menu
// everywhere). Heavy (MenuBody + modals + Radix), so code-split per the
// surface-pro-rollout pattern in NoteContentEditor: a BARE dynamic() would
// null-render its children while the chunk loads and collapse the editor's flex
// layout, so the `loading` fallback reserves the exact box.
const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UnifiedAgentContextMenu,
    })),
  {
    ssr: false,
    loading: () => <div className="h-full min-h-0 flex flex-col" />,
  },
);

interface WorkingDocumentEditorProps {
  conversationId: string;
  kind: WorkingDocumentKind;
  draft: string;
  onChange: (value: string) => void;
  onFlush: () => void;
  placeholder?: string;
  className?: string;
  /**
   * The working-document content source. Drives the right-click action menu in
   * the rich preview (copy / save-to-notes-or-task / html / print / edit) so it
   * operates on the real document, with parent linking on save-to-task. The
   * panel header carries the always-visible action bar, so the in-body bar is
   * suppressed (`previewActionsVariant="none"`).
   */
  actionsSource?: ContentSource;
  /**
   * Host page context (conversation id + the conversation's context). Carried
   * into the document SURFACE so agents launched from the highlight→agent menu
   * see what the chat agent sees. Defaults to deriving from `conversationId`.
   */
  surfaceContext?: WorkingDocumentSurfaceContext;
}

export function WorkingDocumentEditor({
  conversationId,
  kind,
  draft,
  onChange,
  onFlush,
  placeholder,
  className,
  actionsSource,
  surfaceContext,
}: WorkingDocumentEditorProps) {
  const { editorMode } = useWorkingDocViewState(conversationId);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleChange = useCallback(
    (value: string) => onChange(value),
    [onChange],
  );

  const handleFlush = useCallback(
    (value: string) => {
      onChange(value);
      onFlush();
    },
    [onChange, onFlush],
  );

  // ── Agent-context surface scope (working-document | scratchpad) ──────────
  // ONE builder, shared with the right-click menu's data path. Reads the live
  // textarea selection + Redux at call time (no stale snapshot).
  const buildSurfaceScope = useWorkingDocumentSurfaceScope({
    conversationId,
    kind,
    content: draft,
    textareaRef,
    surfaceContext,
  });

  const getApplicationScope = useCallback(() => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selectedText =
      el && start !== end
        ? el.value.slice(Math.min(start, end), Math.max(start, end))
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData: buildSurfaceScope() as Record<string, unknown>,
    });
  }, [buildSurfaceScope]);

  // Insert agent output at the cursor (before/after the selection). onChange
  // (not flush) avoids the draft-ref race; the 700ms autosave persists it.
  const insertAtCursor = useCallback(
    (text: string, position: "before" | "after") => {
      const ta = textareaRef.current;
      const base = draft;
      if (!ta) {
        onChange(
          position === "before" ? `${text}\n\n${base}` : `${base}\n\n${text}`,
        );
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      onChange(
        position === "before"
          ? base.slice(0, start) + text + "\n\n" + base.slice(start)
          : base.slice(0, end) + "\n\n" + text + base.slice(end),
      );
    },
    [draft, onChange],
  );

  const menuProps = workingDocumentContextMenuProps(kind);

  return (
    <UnifiedAgentContextMenu
      {...menuProps}
      getTextarea={() => textareaRef.current}
      getApplicationScope={getApplicationScope}
      onTextReplace={(t) => onChange(t)}
      onTextInsertBefore={(t) => insertAtCursor(t, "before")}
      onTextInsertAfter={(t) => insertAtCursor(t, "after")}
      onContentInserted={() => {}}
    >
      <div className={className ?? "h-full min-h-0"}>
        <NoteEditorCore
          content={draft}
          onChange={handleChange}
          onChangeFlush={handleFlush}
          editorMode={editorMode}
          textareaRef={textareaRef}
          surfaceName={menuProps.surfaceName}
          getApplicationScope={getApplicationScope}
          placeholder={
            placeholder ??
            "Empty. Ask the agent to draft this — or type here. Your edits and the agent's stay in sync each round."
          }
          className="h-full min-h-0"
          showVoiceButton
          embedded
          resetKey={conversationId}
          actionsSource={actionsSource}
          previewActionsVariant="none"
        />
      </div>
    </UnifiedAgentContextMenu>
  );
}
