"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import {
  updateNoteContent,
  updateNoteTags,
  dismissNoteConflict,
  reopenNoteConflict,
  beginRetainedNoteConflictCommand,
  settleRetainedNoteConflictCommand,
  transitionRetainedNoteConflictReview,
  setRetainedNoteConflictProposal,
} from "../../redux/slice";
import {
  saveNote,
  resolveNoteConflict,
  refreshNoteConflictReview,
} from "../../redux/thunks";
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
import { analyzeDiff } from "../../utils/diffAnalysis";
import { NoteSaveFailureBanner } from "../NoteSaveFailureBanner";
import { NoteDraftRecoveryBanner } from "../NoteDraftRecoveryBanner";
import { materializeReviewSession, type ReviewSessionAction } from "@ai-matrx/diff";

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
  useEffect(() => {
    setNoteLiveContent(noteId, localContentRef.current);
    return () => {
      setNoteLiveContent(noteId, null);
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      const pending = localContentRef.current;
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

  // ── Conflict surface (audit N-20: mobile rendered nothing at all) ───
  const conflictDecision = record?._conflictDecision ?? null;
  const retainedConflictReview = useAppSelector((state) => {
    const key = state.notes.currentConflictReviewKeys?.[noteId];
    return key ? state.notes.retainedConflictReviews[key] ?? null : null;
  });
  const [mergeDraft, setMergeDraft] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);

  const conflictAnalysis = useMemo(
    () =>
      conflictDecision != null
        ? analyzeDiff(localContent, conflictDecision.currentRow.content ?? "")
        : null,
    [localContent, conflictDecision],
  );

  const getLiveBuffer = useCallback(
    () =>
      editorMountedRef.current && noteIdRef.current === noteId
        ? localContentRef.current
        : null,
    [noteId],
  );

  const handleReviewTransition = useCallback(
    (transition: ReviewSessionAction) => {
      if (!retainedConflictReview || !editingActorId) return;
      dispatch(
        transitionRetainedNoteConflictReview({
          reviewKey: retainedConflictReview.reviewKey,
          actorId: editingActorId,
          transition,
        }),
      );
    },
    [dispatch, retainedConflictReview, editingActorId],
  );

  const handleReviewProposalChange = useCallback(
    (proposal: string) => {
      if (!retainedConflictReview || !editingActorId) {
        setMergeDraft(proposal);
        return;
      }
      dispatch(
        setRetainedNoteConflictProposal({
          reviewKey: retainedConflictReview.reviewKey,
          actorId: editingActorId,
          proposal,
        }),
      );
    },
    [dispatch, retainedConflictReview, editingActorId],
  );

  /** Begin/settle the retained-review command lock around one decision. */
  const runConflictCommand = useCallback(
    async (
      run: (requestId: string) => Promise<{ status: "applied"; content: string } | { status: "refused"; reason: string }>,
    ) => {
      if (!conflictDecision) return;
      const requestId = crypto.randomUUID();
      const review = retainedConflictReview;
      if (review) {
        dispatch(
          beginRetainedNoteConflictCommand({
            reviewKey: review.reviewKey,
            actorId: conflictDecision.actorId,
            requestId,
            sessionId: review.session.sessionId,
            revision: review.session.revision,
          }),
        );
        if (
          store.getState().notes.retainedConflictReviews[review.reviewKey]?.command
            .requestId !== requestId
        )
          return;
      }
      const outcome = await run(requestId);
      if (
        outcome.status !== "applied" ||
        !editorMountedRef.current ||
        noteIdRef.current !== noteId ||
        store.getState().userAuth.id !== conflictDecision.actorId
      ) {
        const error =
          outcome.status === "refused"
            ? outcome.reason
            : "This conflict changed. Refresh before applying a choice.";
        setConflictError(error);
        if (review)
          dispatch(
            settleRetainedNoteConflictCommand({
              reviewKey: review.reviewKey,
              actorId: conflictDecision.actorId,
              requestId,
              error,
            }),
          );
        return;
      }
      setLocalContent(outcome.content);
      lastReduxRef.current = outcome.content;
      if (review)
        dispatch(
          settleRetainedNoteConflictCommand({
            reviewKey: review.reviewKey,
            actorId: conflictDecision.actorId,
            requestId,
          }),
        );
      return outcome;
    },
    [conflictDecision, dispatch, noteId, retainedConflictReview, store],
  );

  const handleKeepMine = useCallback(
    async (editedContent: string, choice: "mine" | "merge" = "mine") => {
      if (!conflictDecision || conflictDecision.stale) return;
      let content = editedContent;
      if (choice === "merge" && retainedConflictReview) {
        const materialized = materializeReviewSession(retainedConflictReview.session);
        if (materialized.kind !== "complete") {
          setConflictError("Resolve every change before saving the reviewed result.");
          return;
        }
        content = materialized.candidate;
      }
      setConflictError(null);
      const outcome = await runConflictCommand((requestId) =>
        dispatch(
          resolveNoteConflict({
            noteId,
            decisionId: conflictDecision.decisionId,
            reviewId: conflictDecision.reviewId,
            commandRequestId: requestId,
            choice: "mine",
            proposedContent: content,
            getLiveBuffer,
          }),
        ),
      );
      // The reducer advanced the base and kept the record dirty — the text is
      // only durable once the canonical save writes it.
      if (outcome?.status === "applied") {
        try {
          await dispatch(saveNote(noteId)).unwrap();
        } catch {
          toastErrorAlreadyCaptured("Failed to save note");
        }
      }
    },
    [conflictDecision, dispatch, getLiveBuffer, noteId, retainedConflictReview, runConflictCommand],
  );

  const handleAcceptRemote = useCallback(async () => {
    if (!conflictDecision || conflictDecision.stale) return;
    setConflictError(null);
    await runConflictCommand((requestId) =>
      dispatch(
        resolveNoteConflict({
          noteId,
          decisionId: conflictDecision.decisionId,
          reviewId: conflictDecision.reviewId,
          commandRequestId: requestId,
          choice: "theirs",
          proposedContent: conflictDecision.currentRow.content ?? "",
          getLiveBuffer,
        }),
      ),
    );
  }, [conflictDecision, dispatch, getLiveBuffer, noteId, runConflictCommand]);

  const handleRefreshConflict = useCallback(async () => {
    if (!conflictDecision) return;
    setConflictError(null);
    await runConflictCommand((requestId) =>
      dispatch(
        refreshNoteConflictReview({
          commandRequestId: requestId,
          noteId,
          decisionId: conflictDecision.decisionId,
          reviewId: conflictDecision.reviewId,
          getLiveBuffer,
        }),
      ),
    );
  }, [conflictDecision, dispatch, getLiveBuffer, noteId, runConflictCommand]);

  const handleCancelConflict = useCallback(() => {
    dispatch(dismissNoteConflict({ id: noteId }));
  }, [dispatch, noteId]);

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

      {conflictDecision?.dismissed && (
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
          <span>Your unsaved conflict review is still available.</span>
          <button
            type="button"
            onClick={() => dispatch(reopenNoteConflict({ id: noteId }))}
            className="shrink-0 rounded border border-amber-500/50 bg-background px-2 py-1 font-medium text-amber-900 dark:text-amber-100"
          >
            Reopen conflict review
          </button>
        </div>
      )}
      {conflictDecision != null &&
        !conflictDecision.dismissed &&
        conflictAnalysis != null && (
          <NoteConflictWindow
            noteTitle={noteLabel || "Untitled Note"}
            localContent={localContent}
            remoteContent={conflictDecision.currentRow.content ?? ""}
            analysis={conflictAnalysis}
            mergeDraft={retainedConflictReview?.proposal ?? mergeDraft ?? localContent}
            onMergeDraftChange={handleReviewProposalChange}
            reviewSession={retainedConflictReview?.session}
            onReviewTransition={handleReviewTransition}
            remoteDetails={[
              { label: "Title", yours: record?.label ?? "Untitled", saved: conflictDecision.currentRow.label ?? "Untitled" },
              { label: "Folder", yours: record?.folder_name ?? "Uncategorized", saved: conflictDecision.currentRow.folder_name ?? "Uncategorized" },
              { label: "Tags", yours: record?.tags?.join(", ") || "None", saved: conflictDecision.currentRow.tags?.join(", ") || "None" },
            ]}
            stale={conflictDecision.stale}
            decisionError={conflictError}
            locked={retainedConflictReview?.command.status === "pending"}
            onKeepMine={handleKeepMine}
            onAcceptChanges={handleAcceptRemote}
            onCancel={handleCancelConflict}
            onRefresh={handleRefreshConflict}
          />
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
              onChange={(val: string) => handleChange(val)}
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
              <RichDocument
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
