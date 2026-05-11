"use client";

// Layer 1: NoteContentEditor
// Takes ONLY a noteId. Manages content <-> Redux sync with adaptive debounce.
// Uses local useState for instant keystroke response, dispatches to Redux on debounce.
// Includes context menu. Renders via NoteEditorCore internally.
// ZERO PROP DRILLING — reads everything from Redux selectors + NotesInstanceContext.

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import dynamic from "next/dynamic";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  updateNoteContent,
  removeInstanceTab,
  markNoteSaved,
  markTabInteraction,
} from "../redux/slice";
import { getReduxSyncDelay } from "../redux/notes.types";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteEditorMode,
  selectNoteIsDirtyById,
  selectNoteFolder,
  selectNoteLabel,
  selectAllFolders,
  selectInstanceTabs,
  selectNoteSaveState,
} from "../redux/selectors";
import {
  saveNote,
  copyNote,
  deleteNote,
  moveNoteToFolder,
  fetchNoteContent,
} from "../redux/thunks";
import { useNotesInstanceId } from "../context/NotesInstanceContext";
import { analyzeDiff } from "../utils/diffAnalysis";
import { supabase } from "@/utils/supabase/client";
import { NoteEditorCore, type EditorMode } from "./NoteEditorCore";
import { FindReplaceBar } from "./FindReplaceBar";
import { FindMatchOverlay } from "./FindMatchOverlay";
import { RecentChangeOverlay } from "./RecentChangeOverlay";
import { MoveNoteDialog } from "./MoveNoteDialog";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { useIsOwner } from "@/utils/permissions";
import { selectFindReplaceState } from "../redux/selectors";
import { computeMatches } from "../utils/findMatches";
import { usePreviewFindHighlight } from "../hooks/usePreviewFindHighlight";
import { getDiffRange, type DiffRange } from "../utils/diffRange";

const NoteConflictWindow = dynamic(
  () =>
    import("@/features/notes/components/NoteConflictWindow").then(
      (mod) => ({ default: mod.NoteConflictWindow }),
    ),
  { ssr: false },
);

const NoteContextMenu = dynamic(
  () => import("@/features/notes/components/NoteContextMenu"),
  { ssr: false },
);

interface NoteContentEditorProps {
  noteId: string;
}

export function NoteContentEditor({ noteId }: NoteContentEditorProps) {
  const dispatch = useAppDispatch();
  const instanceId = useNotesInstanceId();

  // ── Check if note exists in Redux ────────────────────────────────
  const noteExists = useAppSelector(selectNoteById(noteId));

  // ── Redux selectors (cached — stable references) ──────────────────
  const reduxContent = useAppSelector(selectNoteContent(noteId)) ?? "";
  const editorMode = (useAppSelector(selectNoteEditorMode(noteId)) ??
    "plain") as EditorMode;
  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const allFolders = useAppSelector(selectAllFolders);
  const currentFolder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const noteLabel = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));

  const saveState = useAppSelector(selectNoteSaveState(noteId));

  const { isOwner } = useIsOwner("note", noteId);
  const findReplaceState = useAppSelector(selectFindReplaceState(instanceId));
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // ── Dialog state ──────────────────────────────────────────────────
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // ── Conflict state ────────────────────────────────────────────────
  const [conflictRemote, setConflictRemote] = useState<string | null>(null);

  // When Redux detects a conflict, fetch the remote version to show diff
  useEffect(() => {
    if (saveState !== "conflict") {
      setConflictRemote(null);
      return;
    }
    // Fetch fresh remote content
    supabase
      .from("notes")
      .select("content")
      .eq("id", noteId)
      .single()
      .then(({ data }) => {
        if (data?.content != null) {
          setConflictRemote(data.content);
        }
      });
  }, [saveState, noteId]);

  // ── Local content state — initialized from Redux, synced back on debounce
  const [localContent, setLocalContent] = useState(reduxContent);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReduxRef = useRef(reduxContent);
  const noteIdRef = useRef(noteId);
  const localContentRef = useRef(localContent);
  useEffect(() => {
    localContentRef.current = localContent;
  }, [localContent]);

  // ── Reset generation — bumps ONLY on note switch, so the rich editor
  // subtree remounts only when we navigate between different notes.
  // Undo/redo, realtime updates, and fetch completions flow through via
  // the normal `content` prop — child components (MatrxSplit, MarkdownStream)
  // already reconcile external value changes internally. Remounting on
  // those events would reset the user's scroll position, which is
  // unacceptable for long notes mid-edit.
  const [resetGen, setResetGen] = useState(0);

  // ── Recent-change flash state ─────────────────────────────────────
  // Tracks the diff range of the last externally-applied content change
  // (undo, redo, realtime). The RecentChangeOverlay renders a fading
  // highlight here; we clear it after the fade so it doesn't linger.
  // Declared above the note-switch block because that block's state
  // setter would otherwise hit a TDZ error.
  const [recentChange, setRecentChange] = useState<{
    range: DiffRange;
    flashKey: number;
  } | null>(null);
  const recentChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const flashKeyRef = useRef(0);

  // ── Note switch: reset local content from Redux immediately.
  // Done during render because it must happen before children render with
  // the wrong noteId's content; the guard makes it strictly one-shot.
  if (noteId !== noteIdRef.current) {
    noteIdRef.current = noteId;
    lastReduxRef.current = reduxContent;
    setLocalContent(reduxContent);
    setResetGen((n) => n + 1);
    // The recent-change flash is per-note — its range is meaningless once
    // we've swapped to a different document.
    setRecentChange(null);
  }

  // ── External Redux updates (realtime, undo, fetch completion).
  // Runs in an effect, not during render, to avoid cascading set-state during
  // the keystroke path. Self-originated echoes are detected by comparing
  // against our local content — those only update `lastReduxRef` and do NOT
  // touch state, so they don't trigger any extra renders. For genuine
  // external updates we only update localContent (and NOT resetGen), so
  // child editors receive the new value as a controlled prop without
  // remounting — preserving scroll position and cursor. We also compute a
  // single-region diff and arm the recent-change flash so the user can see
  // exactly what undo/redo just touched.
  useEffect(() => {
    if (reduxContent === lastReduxRef.current) return;

    // Self-echo: our own dispatch came back through the selector. Just
    // update the high-water mark; no state changes, no remount.
    if (reduxContent === localContentRef.current) {
      lastReduxRef.current = reduxContent;
      return;
    }

    // Don't clobber in-flight local edits.
    if (syncTimerRef.current) return;

    const previous = localContentRef.current;
    lastReduxRef.current = reduxContent;
    setLocalContent(reduxContent);

    // Skip the flash for trivial / massive changes:
    // - Initial load (previous was empty) would highlight the entire doc.
    // - Wholesale replacements (>80% of the doc changed) read as a remote
    //   overwrite, not a focused edit; flashing the whole thing is noise.
    if (previous.length === 0) return;
    const range = getDiffRange(previous, reduxContent);
    if (!range) return;
    const changedSpan = Math.max(
      range.end - range.start,
      range.oldEnd - range.start,
    );
    const docSpan = Math.max(reduxContent.length, previous.length);
    if (docSpan > 0 && changedSpan / docSpan > 0.8) return;

    flashKeyRef.current += 1;
    setRecentChange({ range, flashKey: flashKeyRef.current });

    if (recentChangeTimerRef.current) {
      clearTimeout(recentChangeTimerRef.current);
    }
    recentChangeTimerRef.current = setTimeout(() => {
      recentChangeTimerRef.current = null;
      setRecentChange(null);
    }, 1600);
  }, [reduxContent]);

  useEffect(() => {
    return () => {
      if (recentChangeTimerRef.current) {
        clearTimeout(recentChangeTimerRef.current);
      }
    };
  }, []);

  // ── Debounced sync: local -> Redux ─────────────────────────────────
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
      syncToRedux(content);
    },
    [syncToRedux],
  );

  // ── Flush sync: local -> Redux immediately (no debounce) ───────────
  // Used for discrete edits (preview block edits, voice transcription,
  // full-screen markdown editor commits) where waiting for a keystroke
  // debounce would leave Redux transiently out of sync with what the
  // user just committed.
  const handleChangeFlush = useCallback(
    (content: string) => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
      setLocalContent(content);
      lastReduxRef.current = content;
      dispatch(updateNoteContent({ id: noteId, content }));
    },
    [dispatch, noteId],
  );

  // ── Cleanup timer on unmount ──────────────────────────────────────
  // If a debounced sync is still pending when the component unmounts
  // (tab close, navigation, instance unregister), flush it synchronously
  // so the user's in-flight keystrokes aren't silently dropped.
  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
        const pending = localContentRef.current;
        if (pending !== lastReduxRef.current) {
          lastReduxRef.current = pending;
          dispatch(updateNoteContent({ id: noteId, content: pending }));
        }
      }
    };
  }, [dispatch, noteId]);

  // ── Context menu handlers ─────────────────────────────────────────
  const handleSave = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = null;
    lastReduxRef.current = localContent;
    dispatch(updateNoteContent({ id: noteId, content: localContent }));
    dispatch(saveNote(noteId));
  }, [dispatch, noteId, localContent]);

  const handleDuplicate = useCallback(() => {
    dispatch(copyNote(noteId));
  }, [dispatch, noteId]);

  const handleExport = useCallback(() => {
    const blob = new Blob([localContent], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${noteLabel}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [localContent, noteLabel]);

  const handleShareLink = useCallback(() => {
    setShareDialogOpen(true);
  }, []);

  const handleShareClipboard = useCallback(() => {
    navigator.clipboard.writeText(localContent).catch(() => {});
  }, [localContent]);

  const handleMove = useCallback(() => {
    setMoveDialogOpen(true);
  }, []);

  const handleMoveConfirm = useCallback(
    (targetFolder: string) => {
      dispatch(moveNoteToFolder({ noteId, folder: targetFolder }));
    },
    [dispatch, noteId],
  );

  const handleCloseTab = useCallback(() => {
    dispatch(markTabInteraction({ instanceId }));
    dispatch(removeInstanceTab({ instanceId, noteId }));
  }, [dispatch, instanceId, noteId]);

  const handleCloseOtherTabs = useCallback(() => {
    if (!openTabs) return;
    dispatch(markTabInteraction({ instanceId }));
    for (const tabId of openTabs) {
      if (tabId !== noteId) {
        dispatch(removeInstanceTab({ instanceId, noteId: tabId }));
      }
    }
  }, [dispatch, instanceId, noteId, openTabs]);

  const handleCloseAllTabs = useCallback(() => {
    if (!openTabs) return;
    dispatch(markTabInteraction({ instanceId }));
    for (const tabId of openTabs) {
      dispatch(removeInstanceTab({ instanceId, noteId: tabId }));
    }
  }, [dispatch, instanceId, openTabs]);

  const handleDelete = useCallback(() => {
    dispatch(markTabInteraction({ instanceId }));
    dispatch(removeInstanceTab({ instanceId, noteId }));
    dispatch(deleteNote(noteId));
  }, [dispatch, instanceId, noteId]);

  // ── Conflict resolution handlers ──────────────────────────────────
  const handleKeepMine = useCallback(
    (editedContent: string) => {
      // User chose their version (possibly edited in the conflict window)
      setLocalContent(editedContent);
      lastReduxRef.current = editedContent;
      dispatch(updateNoteContent({ id: noteId, content: editedContent }));
      // Clear the conflict error and force a save
      dispatch(markNoteSaved({ id: noteId }));
      setConflictRemote(null);
      // Re-save with the user's content
      setTimeout(() => dispatch(saveNote(noteId)), 100);
    },
    [dispatch, noteId],
  );

  const handleAcceptRemote = useCallback(() => {
    if (conflictRemote == null) return;
    // Accept the remote version — overwrite local
    setLocalContent(conflictRemote);
    lastReduxRef.current = conflictRemote;
    dispatch(updateNoteContent({ id: noteId, content: conflictRemote }));
    // Clear conflict and mark clean (remote is already saved)
    dispatch(markNoteSaved({ id: noteId }));
    // Re-fetch to get full fresh state
    dispatch(fetchNoteContent(noteId));
    setConflictRemote(null);
  }, [dispatch, noteId, conflictRemote]);

  const handleCancelConflict = useCallback(() => {
    // Dismiss conflict window — keep local edits as dirty
    setConflictRemote(null);
  }, []);

  // ── Guard: note deleted or not found ───────────────────────────────
  if (!noteExists) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <p className="text-sm">Note not found</p>
          <p className="text-xs mt-1">
            This note may have been deleted or moved.
          </p>
          <button
            onClick={() => {
              dispatch(markTabInteraction({ instanceId }));
              dispatch(removeInstanceTab({ instanceId, noteId }));
            }}
            className="mt-3 text-xs text-primary hover:text-primary/80 cursor-pointer"
          >
            Close this tab
          </button>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      {/* Conflict resolution window */}
      {conflictRemote != null && (
        <NoteConflictWindow
          noteTitle={noteLabel}
          localContent={localContent}
          remoteContent={conflictRemote}
          analysis={analyzeDiff(localContent, conflictRemote)}
          onKeepMine={handleKeepMine}
          onAcceptChanges={handleAcceptRemote}
          onCancel={handleCancelConflict}
        />
      )}

      <NoteContextMenu
        noteId={noteId}
        isDirty={isDirty}
        allFolders={allFolders}
        currentFolder={currentFolder}
        noteContent={localContent}
        textareaRef={textareaRef}
        onSave={handleSave}
        onDuplicate={handleDuplicate}
        onExport={handleExport}
        onShareLink={handleShareLink}
        onShareClipboard={handleShareClipboard}
        onMove={handleMove}
        onCloseTab={handleCloseTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onCloseAllTabs={handleCloseAllTabs}
        onDelete={handleDelete}
      >
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {findReplaceState?.isOpen && (
            <FindReplaceBar noteId={noteId} textareaRef={textareaRef} />
          )}
          <NoteEditorCore
            content={localContent}
            onChange={handleChange}
            onChangeFlush={handleChangeFlush}
            editorMode={editorMode}
            textareaRef={textareaRef}
            showVoiceButton={editorMode !== "preview"}
            placeholder="Start typing..."
            className="flex-1 min-h-0"
            resetKey={`${noteId}:${resetGen}`}
            findOverlay={
              editorMode === "plain" || editorMode === "split" ? (
                <>
                  {findReplaceState?.isOpen && (
                    <NoteFindMatchOverlayRedux
                      instanceId={instanceId}
                      noteId={noteId}
                      textareaRef={textareaRef}
                      content={localContent}
                    />
                  )}
                  {recentChange && (
                    <RecentChangeOverlay
                      textareaRef={textareaRef}
                      content={localContent}
                      range={recentChange.range}
                      flashKey={recentChange.flashKey}
                    />
                  )}
                </>
              ) : null
            }
            previewContainerRef={previewContainerRef}
          />
          {findReplaceState?.isOpen &&
            (editorMode === "split" || editorMode === "preview") && (
              <NotePreviewFindHighlightRedux
                instanceId={instanceId}
                containerRef={previewContainerRef}
              />
            )}
        </div>
      </NoteContextMenu>

      <MoveNoteDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        onConfirm={handleMoveConfirm}
        noteName={noteLabel}
        currentFolder={currentFolder}
        availableFolders={allFolders}
      />

      <ShareModal
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        resourceType="note"
        resourceId={noteId}
        resourceName={noteLabel}
        isOwner={isOwner}
      />
    </>
  );
}

// ── Redux-connected find overlays ────────────────────────────────────────────
// Kept here (not exported to the general component tree) because they're
// tightly coupled to the NoteContentEditor's local `content` state and the
// per-instance find/replace Redux slice.

function NoteFindMatchOverlayRedux({
  instanceId,
  noteId,
  textareaRef,
  content,
}: {
  instanceId: string;
  noteId: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
}) {
  const fr = useAppSelector(selectFindReplaceState(instanceId));
  // Compute matches directly against the local content (what the user sees
  // in the textarea right now), not the debounced Redux content. Otherwise
  // a freshly-typed character would briefly mis-position every highlight.
  const matches = useMemo(() => {
    if (!fr?.query) return [];
    return computeMatches(content, fr.query, {
      caseSensitive: fr.caseSensitive,
      useRegex: fr.useRegex,
      wholeWord: fr.wholeWord,
    });
  }, [content, fr?.query, fr?.caseSensitive, fr?.useRegex, fr?.wholeWord]);

  // Bump a scroll token each time the user navigates so the overlay knows
  // to scroll the active match into view. Content changes alone shouldn't
  // force a scroll — that would disrupt editing.
  const activeIndex = fr?.currentMatchIndex ?? -1;
  const [scrollToken, setScrollToken] = useState(0);
  const prevActiveRef = useRef(activeIndex);
  useEffect(() => {
    if (prevActiveRef.current !== activeIndex) {
      prevActiveRef.current = activeIndex;
      setScrollToken((n) => n + 1);
    }
  }, [activeIndex]);

  if (!fr?.isOpen) return null;
  return (
    <FindMatchOverlay
      textareaRef={textareaRef}
      content={content}
      matches={matches}
      activeIndex={activeIndex}
      scrollToken={scrollToken}
    />
  );
}

function NotePreviewFindHighlightRedux({
  instanceId,
  containerRef,
}: {
  instanceId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const fr = useAppSelector(selectFindReplaceState(instanceId));
  const [scrollToken, setScrollToken] = useState(0);
  const prevActiveRef = useRef(fr?.currentMatchIndex ?? -1);
  useEffect(() => {
    const current = fr?.currentMatchIndex ?? -1;
    if (prevActiveRef.current !== current) {
      prevActiveRef.current = current;
      setScrollToken((n) => n + 1);
    }
  }, [fr?.currentMatchIndex]);

  usePreviewFindHighlight({
    containerRef,
    query: fr?.query ?? "",
    caseSensitive: fr?.caseSensitive ?? false,
    useRegex: fr?.useRegex ?? false,
    wholeWord: fr?.wholeWord ?? false,
    activeIndex: fr?.currentMatchIndex ?? -1,
    matchCount: fr?.matchCount ?? 0,
    scrollToken,
    enabled: !!fr?.isOpen,
  });
  return null;
}
