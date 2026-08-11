"use client";

import { useCallback, useRef } from "react";
import { NoteEditorCore } from "@/features/notes/components/NoteEditorCore";
import type { ContentSource } from "@/features/rich-document/types";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import type { WorkingDocumentKind } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.slice";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectWorkingDocConflict } from "@/features/agents/redux/execution-system/instance-working-document/instance-working-document.selectors";
import {
  SurfaceRuntimeProvider,
  type SurfaceWriteHandlers,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { useWorkingDocViewState } from "./workingDocumentViewStore";
import { useWorkingDocumentSurfaceScope } from "./useWorkingDocumentSurfaceScope";
import {
  workingDocumentContextMenuProps,
  type WorkingDocumentSurfaceContext,
} from "./workingDocumentSurface";

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";

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
  /**
   * View-only rendering (a viewer-level sharee): content is selectable and
   * scrollable but never editable — RLS would refuse the write anyway, and a
   * refused write surfaces as a bogus "concurrent edit" conflict loop.
   */
  readOnly?: boolean;
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
  readOnly = false,
}: WorkingDocumentEditorProps) {
  const { editorMode: storedEditorMode } = useWorkingDocViewState(conversationId);
  // The TUI modes (wysiwyg / markdown-split) have NO read-only rendering —
  // coerce them to preview for view-only sharees so a stored rich-mode
  // preference can't reopen an editable surface whose writes are RLS-doomed.
  const editorMode =
    readOnly &&
    (storedEditorMode === "wysiwyg" || storedEditorMode === "markdown-split")
      ? "preview"
      : storedEditorMode;
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

  // ── Surface write handlers (manifest `writeTargets`) ─────────────────────
  // The write half of the 360 loop, for the agent the user runs from the header
  // Agents popover on this document. Every handler lands through the SAME
  // `onChange` a keystroke goes through, so an agent edit joins the identical
  // dirty flag, 700ms autosave, canonical-slice publish and version history as
  // the user's own typing — never a parallel write path.
  //
  // Handlers validate and THROW on a bad shape; `applySurfaceWrite` turns a
  // throw into a safe error envelope the agent reads and can correct from.
  //
  // WHY EVERY READ HERE GOES THROUGH A REF: when an agent stages several targets
  // in ONE turn, the writeback seam resolves every handler closure BEFORE the
  // user confirms the first dialog (`surface-writeback.ts` looks the handler up,
  // then awaits the confirm, then calls it). A handler that read `draft` off its
  // render closure would splice into a snapshot taken before the previous
  // target landed — on a document editor that means replacing the WRONG range.
  // `bodyRef` is therefore updated SYNCHRONOUSLY as each write applies, not just
  // on render, so back-to-back writes in one turn compose correctly no matter
  // when React re-renders between the confirms.
  const bodyRef = useRef(draft);
  bodyRef.current = draft;
  const conflict = useAppSelector(selectWorkingDocConflict(conversationId, kind));
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const readOnlyRef = useRef(readOnly);
  readOnlyRef.current = readOnly;

  const getWriteHandlers = useCallback((): SurfaceWriteHandlers => {
    // `has_conflict` — the ONE hard safety gate. A refused save left a
    // concurrent edit unresolved, and `useWorkingDocument`'s commit deliberately
    // returns early while it stands. Staging over that is worse than a no-op:
    // the text would appear in the editor, never persist, and enlarge the very
    // merge the user is about to reconcile. Refuse loudly, with the reason.
    const assertWritable = (target: string) => {
      if (conflictRef.current)
        throw new Error(
          `${target} was NOT applied. This document has an unresolved edit conflict: a concurrent edit advanced it, auto-save is blocked, and anything written now would sit in the editor unsaved and enlarge the merge the user is about to reconcile. Ask the user to resolve the conflict ("Keep mine" or "Use agent's version") and try again.`,
        );
      if (readOnlyRef.current)
        throw new Error(
          `${target} was NOT applied. This document is shared with the user at view-only access, so every durable write is refused and would be silently dropped. It cannot be edited here.`,
        );
    };

    // The inline-tool layer PARSES a JSON-looking argument before the handler
    // sees it, so raw JSON text arrives as an object, not a string. Say so
    // explicitly — otherwise the agent "fixes" a plain type error by
    // double-encoding, and the user's document fills with escaped \n and stray
    // quotes, which on this surface is extremely visible.
    const assertText = (target: string, value: unknown, what: string): string => {
      if (typeof value !== "string")
        throw new Error(
          `${target} expects a plain text string, not JSON and not JSON-encoded — ${what}. Send the text itself as the value (markdown is fine); do NOT wrap it in an object, an array, or quotes, and do NOT escape its newlines.`,
        );
      if (!value.trim())
        throw new Error(
          `${target} expects non-empty text — ${what}. Emptying the document is a human gesture, not an agent one.`,
        );
      return value;
    };

    // Apply through the user's own keystroke path AND advance the ref in the
    // same tick, so a second write later in this turn builds on this one.
    const applyBody = (next: string) => {
      bodyRef.current = next;
      onChange(next);
    };

    return {
      document_content: (value: unknown) => {
        assertWritable("document_content");
        applyBody(
          assertText(
            "document_content",
            value,
            "the FULL document body, which replaces everything currently in it",
          ),
        );
      },
      append_document_content: (value: unknown) => {
        assertWritable("append_document_content");
        const addition = assertText(
          "append_document_content",
          value,
          "ONLY the new text to add at the end of the document",
        );
        const base = bodyRef.current;
        applyBody(base.trim() ? `${base}\n\n${addition}` : addition);
      },
      replace_selection: (value: unknown) => {
        assertWritable("replace_selection");
        const replacement = assertText(
          "replace_selection",
          value,
          "the text that replaces the user's highlighted range",
        );
        const ta = textareaRef.current;
        if (!ta)
          throw new Error(
            "replace_selection needs the plain-text editor, but the user has this document open in a rich/preview mode where there is no selectable range. Use document_content or append_document_content instead, or ask the user to switch to the markdown editor.",
          );
        const start = Math.min(ta.selectionStart, ta.selectionEnd);
        const end = Math.max(ta.selectionStart, ta.selectionEnd);
        if (start === end)
          throw new Error(
            "replace_selection was NOT applied because nothing is selected. Guessing a range would overwrite the wrong text. Ask the user to highlight the passage they want changed, or use document_content to rewrite the whole document.",
          );
        // SAME-TURN ORDERING WRINKLE (real, not hypothetical): the selection
        // offsets come from the live DOM, but `bodyRef` may already hold a body
        // an EARLIER target in this same turn replaced — React has not
        // necessarily re-rendered the textarea between two confirms. Splicing
        // DOM offsets into superseded text would cut at the wrong place, so
        // detect the divergence and refuse instead of papering over it.
        if (ta.value !== bodyRef.current)
          throw new Error(
            "replace_selection was NOT applied. An earlier write in this same turn already replaced the document, so the user's highlighted range no longer refers to the current text and applying it would cut in the wrong place. Re-read `selection` / `active_text` and issue the edit as its own step.",
          );
        applyBody(
          bodyRef.current.slice(0, start) +
            replacement +
            bodyRef.current.slice(end),
        );
      },
      insert_at_cursor: (value: unknown) => {
        assertWritable("insert_at_cursor");
        const addition = assertText(
          "insert_at_cursor",
          value,
          "ONLY the new text to insert at the caret",
        );
        const ta = textareaRef.current;
        // No textarea (rich/preview mode) — no caret to speak of. Append rather
        // than throw: "add this" still has an unambiguous meaning, and this
        // mirrors the editor's own `insertAtCursor` fallback.
        if (!ta) {
          const base = bodyRef.current;
          applyBody(base.trim() ? `${base}\n\n${addition}` : addition);
          return;
        }
        if (ta.value !== bodyRef.current)
          throw new Error(
            "insert_at_cursor was NOT applied. An earlier write in this same turn already replaced the document, so the caret offset no longer refers to the current text. Re-read `cursor_offset` and issue the insertion as its own step.",
          );
        // Caret, or immediately AFTER the highlighted range when there is one —
        // the same rule the editor's own insert-after action uses.
        const at = Math.max(ta.selectionStart, ta.selectionEnd);
        const base = bodyRef.current;
        const before = base.slice(0, at);
        const after = base.slice(at);
        // Pad to a blank line ONLY at the two join points. A document-wide
        // newline collapse would silently rewrite spacing the user chose in
        // parts of the document this insertion never touched.
        const padStart = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
        const padEnd = !after || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
        applyBody(`${before}${padStart}${addition}${padEnd}${after}`);
      },
    };
  }, [onChange]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={menuProps.surfaceName}
      getScope={getApplicationScope}
      isEditable={!readOnly}
      getWriteHandlers={getWriteHandlers}
    >
    <EditableContextMenu
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
          showVoiceButton={!readOnly}
          embedded
          readOnly={readOnly}
          resetKey={conversationId}
          actionsSource={actionsSource}
          previewActionsVariant="none"
        />
      </div>
    </EditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
