"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import dynamic from "next/dynamic";
import { Eye, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useNotesRedux } from "../../hooks/useNotesRedux";
import { useNoteAccess } from "../../hooks/useNoteAccess";
import { setNoteLiveContent } from "../../utils/noteLiveContent";
import { NoteEditorDock } from "./NoteEditorDock";
import { useNoteDelete } from "../../hooks/useNoteDelete";
import { useToastManager } from "@/hooks/useToastManager";
import { toastErrorAlreadyCaptured } from "@/lib/toast";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { noteIdentityContentSource } from "../../richDocumentSource";
import { usePreparedNoteContentSource } from "../../usePreparedNoteContentSource";
import type { Note } from "@/features/notes/types";
import { NOTES_EDITOR_CONTEXT_MENU_PROPS } from "@/features/notes/agent-context/buildNotesEditorContextData";
import type { TuiEditorContentRef } from "@/components/mardown-display/chat-markdown/tui/TuiEditorContent";
import { updateNoteContent, updateNoteTags } from "../../redux/slice";
import { saveNote } from "../../redux/thunks";
import { getReduxSyncDelay } from "../../redux/notes.types";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteFolder,
  selectNoteIsDirtyById,
  selectNoteIsSavingById,
  selectNoteLabel,
  selectNoteTags,
} from "../../redux/selectors";
import { NoteSaveFailureBanner } from "../NoteSaveFailureBanner";
import { NoteDraftRecoveryBanner } from "../NoteDraftRecoveryBanner";
import { useNoteConflictChoreography } from "../../hooks/useNoteConflictChoreography";
import { authoredBy } from "@/components/rich-content/prose/remote-image-policy";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

export type MobileEditorMode = "plain" | "wysiwyg" | "preview";

/** State the editor exposes to MobileNotesView's header save button/dirty poll. */
interface MobileNoteEditorWindowState {
  isDirty: boolean;
  isSaving: boolean;
  handleSave: () => Promise<void>;
}

declare global {
  interface Window {
    // Escape hatch so MobileNotesView's header can drive the mounted editor
    // without a prop-drilled ref (header and editor are siblings under a view switch).
    __mobileNoteEditorState?: MobileNoteEditorWindowState;
  }
}

// Heavy TUI editor — only loaded when needed
const TuiEditorContent = dynamic(
  () =>
    import("@/components/mardown-display/chat-markdown/tui/TuiEditorContent"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

// The SAME conflict window desktop mounts — never a mobile copy. It is a
// Dialog, which on a phone fills the screen.
const NoteConflictWindow = dynamic(
  () =>
    import("@/features/notes/components/NoteConflictWindow").then((mod) => ({
      default: mod.NoteConflictWindow,
    })),
  { ssr: false },
);

interface MobileNoteEditorProps {
  note: Note;
  editorMode: MobileEditorMode;
  onBack: () => void;
}

export default function MobileNoteEditor({
  note,
  editorMode,
  onBack,
}: MobileNoteEditorProps) {
  const noteId = note.id;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { copyNote, moveNote, moveNoteToNewFolder, setActiveNoteDirty } =
    useNotesRedux();
  const toast = useToastManager("notes");

  // A viewer-level sharee gets a read-only surface — their RLS-rejected
  // saves would otherwise silently discard every edit.
  const access = useNoteAccess(noteId);
  const readOnly = access.readOnly;
  const effectiveMode: MobileEditorMode =
    readOnly && editorMode === "wysiwyg" ? "preview" : editorMode;

  // ── THE RECORD IS THE TRUTH ────────────────────────────────────────
  // This editor used to keep label/content/folder/tags in React state with a
  // bespoke 2s timer and its own baseline/dirty/failed bookkeeping. It is now
  // the same machine as `NoteContentEditor`: every change goes to Redux
  // (live buffer + debounced `updateNoteContent`), `autoSaveMiddleware` owns
  // persistence, and dirty/saving are read back off the record.
  const record = useAppSelector(selectNoteById(noteId));
  const reduxContent = useAppSelector(selectNoteContent(noteId)) ?? "";
  const noteLabel = useAppSelector(selectNoteLabel(noteId)) ?? note.label ?? "";
  const folder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const tags = useAppSelector(selectNoteTags(noteId));
  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const isSaving = useAppSelector(selectNoteIsSavingById(noteId));
  const editingActorId = useAppSelector((state) => state.userAuth.id);

  const [localContent, setLocalContent] = useState(reduxContent);
  const localContentRef = useRef(localContent);
  const lastReduxRef = useRef(reduxContent);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(noteId);
  const editorMountedRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tuiRef = useRef<TuiEditorContentRef>(null);

  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);
  useEffect(() => {
    noteIdRef.current = noteId;
  }, [noteId]);
  useEffect(() => {
    editorMountedRef.current = true;
    return () => {
      editorMountedRef.current = false;
    };
  }, []);

  const displayedNote = useMemo(
    () => (record ? { ...record, content: localContent } : null),
    [record, localContent],
  );
  const editableContentSource = usePreparedNoteContentSource(
    displayedNote && record?._acknowledgedPhysicalSnapshot && editingActorId && !readOnly
      ? {
          record,
          displayedNote,
          actorId: editingActorId,
          hasLocalEdits: isDirty || record._dirty || localContent !== (record.content ?? ""),
        }
      : null,
  );

  // THE ONE conflict choreography — the same hook the desktop editor
  // consumes, so Keep Mine on a phone produces the desktop dispatch sequence
  // (begin lock → resolveNoteConflict → the reviewed-save coordinator), never
  // a resolve-then-`saveNote` shortcut of its own.
  const adoptResolvedContent = useCallback((content: string) => {
    setLocalContent(content);
    lastReduxRef.current = content;
  }, []);
  const conflict = useNoteConflictChoreography({
    noteId,
    record,
    noteTitle: noteLabel || "Untitled Note",
    localContent,
    editableContentSource,
    editorMountedRef,
    noteIdRef,
    localContentRef,
    adoptResolvedContent,
  });

  // The delete confirmation belongs to the platform, not to this screen —
  // `requestDelete` opens the canonical `confirm()` (see useNoteDelete).
  const { isDeleting, requestDelete } = useNoteDelete({
    instanceId: "",
    noteId,
    noteLabel: noteLabel || "Untitled Note",
    content: localContent,
    closeTab: false,
    onDeleted: onBack,
  });

  // ── Note switch: adopt the newly selected note's stored content ─────
  // Render-phase reset (React's "adjusting state when a prop changes"): an
  // effect here would leave one frame showing the previous note's buffer.
  const [syncedNoteId, setSyncedNoteId] = useState(noteId);
  if (syncedNoteId !== noteId) {
    setSyncedNoteId(noteId);
    setLocalContent(store.getState().notes?.notes?.[noteId]?.content ?? "");
    conflict.resetForNoteSwitch();
  }

  // ── Redux -> local (realtime / remote edits) ────────────────────────
  useEffect(() => {
    if (reduxContent === lastReduxRef.current) return;
    // Don't clobber in-flight local keystrokes.
    if (syncTimerRef.current) return;
    lastReduxRef.current = reduxContent;
    setLocalContent(reduxContent);
    setNoteLiveContent(noteId, reduxContent);
  }, [reduxContent, noteId]);

  // ── Debounced sync: local -> Redux (same delay table as desktop) ────
  const syncToRedux = useCallback(
    (content: string) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      const delay = getReduxSyncDelay(content.length);
      syncTimerRef.current = setTimeout(() => {
        syncTimerRef.current = null;
        lastReduxRef.current = content;
        dispatch(updateNoteContent({ id: noteId, content }));
      }, delay);
    },
    [dispatch, noteId],
  );

  const handleChange = useCallback(
    (content: string) => {
      setLocalContent(content);
      setNoteLiveContent(noteId, content);
      syncToRedux(content);
    },
    [noteId, syncToRedux],
  );

  const handleChangeFlush = useCallback(
    (content: string) => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      setLocalContent(content);
      setNoteLiveContent(noteId, content);
      lastReduxRef.current = content;
      dispatch(updateNoteContent({ id: noteId, content }));
    },
    [dispatch, noteId],
  );

  /** The WYSIWYG surface's live markdown, when it is the mounted body. */
  const readMountedContent = useCallback(() => {
    if (effectiveMode !== "wysiwyg") return localContentRef.current;
    try {
      return tuiRef.current?.getCurrentMarkdown?.() ?? localContentRef.current;
    } catch {
      return localContentRef.current;
    }
  }, [effectiveMode]);

  // TYPE, TAP BACK, GONE — closed at the class. A pending debounce is flushed
  // to Redux on unmount AND on a note switch (this effect is keyed by noteId,
  // so the cleanup runs with the OUTGOING note's id and buffer), exactly as
  // `NoteContentEditor` does. `autoSaveMiddleware` then persists it.
  // On a TRUE unmount in rich (WYSIWYG) mode, the rich editor may hold words
  // its onChange has not delivered yet. A layout-effect cleanup runs before the
  // child editor detaches its imperative handle (and before the passive cleanup
  // below), so the live markdown is snapshotted here and flushed below. Never
  // on a note switch: by then the rich editor may already show the NEXT note.
  const effectiveModeRef = useRef(effectiveMode);
  useEffect(() => {
    effectiveModeRef.current = effectiveMode;
  }, [effectiveMode]);
  const unmountSnapshotRef = useRef<string | null>(null);
  /** Set by the rich editor's own onChange. Its re-serialized markdown can
   *  differ from the stored text (list markers, escapes, a trailing newline)
   *  with no edit at all, so the unmount snapshot is taken ONLY when the user
   *  actually typed in rich mode — merely opening a note must never write it. */
  const richEditedRef = useRef(false);
  useLayoutEffect(
    () => () => {
      if (effectiveModeRef.current !== "wysiwyg" || !richEditedRef.current) return;
      try {
        const markdown = tuiRef.current?.getCurrentMarkdown?.();
        if (typeof markdown === "string") unmountSnapshotRef.current = markdown;
      } catch {
        // A torn-down rich editor falls back to the last delivered buffer.
      }
    },
    [],
  );

  useEffect(() => {
    setNoteLiveContent(noteId, localContentRef.current);
    // A fresh note has not been edited in rich mode yet.
    richEditedRef.current = false;
    return () => {
      setNoteLiveContent(noteId, null);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      const pending = unmountSnapshotRef.current ?? localContentRef.current;
      if (pending !== lastReduxRef.current) {
        lastReduxRef.current = pending;
        dispatch(updateNoteContent({ id: noteId, content: pending }));
      }
    };
  }, [dispatch, noteId]);

  // Leaving the WYSIWYG surface commits whatever it holds before it unmounts.
  const previousModeRef = useRef(effectiveMode);
  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = effectiveMode;
    if (previous === effectiveMode || previous !== "wysiwyg") return;
    const pending = localContentRef.current;
    if (pending !== lastReduxRef.current) handleChangeFlush(pending);
  }, [effectiveMode, handleChangeFlush]);

  // Auto-grow plain textarea
  const growTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (effectiveMode === "plain") growTextarea();
  }, [localContent, effectiveMode, growTextarea]);

  // Report dirty state so refreshNotes() never overwrites unsaved user input.
  useEffect(() => {
    setActiveNoteDirty(isDirty);
    return () => {
      setActiveNoteDirty(false);
    };
  }, [isDirty, setActiveNoteDirty]);

  const handleSave = useCallback(async () => {
    handleChangeFlush(readMountedContent());
    try {
      await dispatch(saveNote(noteId)).unwrap();
    } catch {
      // `saveNote` owns failure classification/capture; keep this derived
      // notice visible without filing a duplicate, context-free system_error.
      toastErrorAlreadyCaptured("Failed to save note");
    }
  }, [dispatch, handleChangeFlush, noteId, readMountedContent]);

  // Expose save state and handler to parent (MobileNotesView injects into header)
  useEffect(() => {
    window.__mobileNoteEditorState = { isDirty, isSaving, handleSave };
    return () => {
      delete window.__mobileNoteEditorState;
    };
  });

  const handleCopy = async () => {
    try {
      await copyNote(noteId);
      toast.success("Note duplicated");
    } catch {
      toast.error("Failed to duplicate note");
    }
  };

  const handleExport = () => {
    const content = readMountedContent();
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${noteLabel || "note"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Exported");
  };

  return (
    // Flex column fills the parent — content scrolls, dock stays at bottom
    <div className="h-full bg-background flex flex-col overflow-hidden relative">
      {readOnly && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
          <Eye className="w-3.5 h-3.5 shrink-0" />
          <span className="text-xs truncate">
            Read-only — shared with view access
            {access.ownerEmail ? ` by ${access.ownerEmail}` : ""}.
          </span>
        </div>
      )}

      {/* Loud recovery, in the same priority order as desktop: work that is
          failing to save blocks first, then work already rescued to a draft. */}
      <NoteSaveFailureBanner noteId={noteId} />
      {!readOnly && (
        <NoteDraftRecoveryBanner noteId={noteId} onRestore={handleChangeFlush} />
      )}

      {conflict.reviewOutcomes.map((outcome) => (
        <div key={outcome.requestId} className="shrink-0 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <span>Reviewed save outcome: {outcome.result.status}. The original reviewed package remains available for inspection.</span>
          <button
            type="button"
            className="shrink-0 rounded border border-amber-500/50 bg-background px-2 py-1 font-medium"
            onClick={() => conflict.acknowledgeOutcome(outcome)}
          >
            Dismiss
          </button>
        </div>
      ))}
      {conflict.dismissedReviewAvailable && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <span>Your unsaved conflict review is still available.</span>
          <button
            type="button"
            onClick={conflict.reopenConflict}
            className="shrink-0 rounded border border-amber-500/50 bg-background px-2 py-1 font-medium text-amber-900 dark:text-amber-100"
          >
            Reopen conflict review
          </button>
        </div>
      )}
      {/* Desktop parity: a reviewed save refused AFTER the decision cleared (e.g. the
          editor changed before phase two) is said out loud, never swallowed. */}
      {conflict.conflictError && !conflict.conflictDecision && (
        <ErrorNotice size="inline" className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-sm" message={conflict.conflictError} />
      )}
      {conflict.conflictWindowProps != null && (
        <NoteConflictWindow {...conflict.conflictWindowProps} />
      )}

      {/* ── Scrollable content area ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-32">
        {/* Plain text — wrapped in the universal v3 menu: on mobile it mounts
            the long-press / selection-icon bottom-sheet drill-down, giving the
            phone editor the same Copy-as / Export / AI / agent actions as
            desktop. Read-only access gets the NON-editable wrapper: v3's
            Cut/Paste mutate through getTextarea/onTextReplace regardless of
            the textarea's readOnly attribute, which would dirty the record
            and arm a doomed save on a note this user can't write. */}
        {effectiveMode === "plain" && readOnly && (
          <NonEditableContextMenu
            sourceFeature="notes"
            surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
            contextData={{ content: localContent }}
            contentSource={noteIdentityContentSource(noteId, `mobile-readonly:${noteId}`)}
            entity={{
              type: "note",
              id: noteId,
              title: noteLabel || note.label,
              resourceType: "note",
            }}
          >
            <textarea
              ref={textareaRef}
              value={localContent}
              readOnly
              placeholder="Start writing..."
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none border-none resize-none leading-relaxed"
              style={{ fontSize: "16px", minHeight: "calc(100dvh - 200px)" }}
            />
          </NonEditableContextMenu>
        )}
        {effectiveMode === "plain" && !readOnly && (
          <EditableContextMenu
            sourceFeature="notes"
            surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
            contextData={{ content: localContent }}
            contentSource={editableContentSource}
            entity={{
              type: "note",
              id: noteId,
              title: noteLabel || note.label,
              resourceType: "note",
            }}
            getTextarea={() => textareaRef.current}
            onTextReplace={(next) => {
              handleChangeFlush(next);
              growTextarea();
            }}
          >
            <textarea
              ref={textareaRef}
              value={localContent}
              onChange={(e) => {
                handleChange(e.target.value);
                growTextarea();
              }}
              placeholder="Start writing..."
              className="w-full bg-transparent text-foreground placeholder:text-muted-foreground outline-none border-none resize-none leading-relaxed"
              style={{ fontSize: "16px", minHeight: "calc(100dvh - 200px)" }}
            />
          </EditableContextMenu>
        )}

        {/* Rich (WYSIWYG) */}
        {effectiveMode === "wysiwyg" && (
          <div className="min-h-[calc(100dvh-200px)]">
            <TuiEditorContent
              ref={tuiRef}
              content={localContent}
              onChange={(val: string) => {
                richEditedRef.current = true;
                handleChange(val);
              }}
              isActive={true}
              editMode="wysiwyg"
              className="w-full"
            />
          </div>
        )}

        {/* Preview */}
        {effectiveMode === "preview" && (
          <div className="min-h-[calc(100dvh-200px)] prose prose-sm dark:prose-invert max-w-none">
            {localContent.trim() ? (
              <RichDocument imagePolicy={authoredBy(note.created_by, editingActorId)}
                content={localContent}
                source={editableContentSource ?? noteIdentityContentSource(noteId, `mobile-preview:${noteId}`)}
                actionsVariant="mini-bar"
                actionsClassName="mb-2"
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing to preview yet.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Fixed bottom dock ────────────────────────────────────────────────── */}
      <NoteEditorDock
        noteId={noteId}
        noteLabel={noteLabel}
        readOnly={readOnly}
        folder={folder}
        organizationId={note.organization_id}
        tags={tags}
        content={localContent}
        onFolderChange={async (nextFolder) => {
          await moveNote(noteId, nextFolder);
        }}
        onCreateFolder={async (folderName) => {
          await moveNoteToNewFolder(noteId, folderName);
        }}
        onTagsChange={(nextTags) =>
          dispatch(updateNoteTags({ id: noteId, tags: nextTags }))
        }
        onDuplicate={handleCopy}
        onExport={handleExport}
        onDelete={requestDelete}
        isDeleting={isDeleting}
      />
    </div>
  );
}
