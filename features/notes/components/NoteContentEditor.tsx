"use client";

// Layer 1: NoteContentEditor
// Takes ONLY a noteId. Manages content <-> Redux sync with adaptive debounce.
// Uses local useState for instant keystroke response, dispatches to Redux on debounce.
// Includes context menu. Renders via NoteEditorCore internally.
// ZERO PROP DRILLING — reads everything from Redux selectors + NotesInstanceContext.

import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from "react";
import dynamic from "next/dynamic";
import { Eye, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  removeInstanceTab,
  markTabInteraction,
  setInstanceOutlineOpen,
  setNoteEditorMode,
  closeFindReplace,
} from "../redux/slice";
import {
  selectInstanceOutlineOpen,
  selectNoteById,
  selectNoteContentLoadStatus,
  selectNoteContent,
  selectNoteEditor,
  selectNoteIsDirtyById,
  selectNoteFolder,
  selectNoteLabel,
  selectFolderReferences,
  selectInstanceTabs,
} from "../redux/selectors";
import { editorDisplayName } from "../utils/editorDisplayName";
import {
  saveNote,
  fetchNoteContent,
  copyNote,
  deleteNote,
  moveNoteToFolder,
  moveNoteToNewFolder,
} from "../redux/thunks";
import { useNotesInstanceId } from "../context/NotesInstanceContext";
import { useNoteAccess } from "../hooks/useNoteAccess";
import {
  useNoteEditorMode,
  useRememberNoteEditorMode,
} from "../hooks/usePreferredDefaultEditorMode";
import { NoteEditorCore, isRichEditorMode, type EditorMode } from "./NoteEditorCore";
import type { RichEditorController } from "@ai-matrx/rich-editor/editor/RichEditor";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useNoteWorkingCopy } from "../hooks/useNoteWorkingCopy";
import { noteWorkingCopy } from "../utils/noteLiveContent";
import { useKeptTextSelection } from "@/lib/working-copy/useKeptTextSelection";
import { useNotesSurfaceRuntime } from "@/features/notes/agent-context/useNotesSurfaceRuntime";
import { useNoteUndoRedo } from "../hooks/useNoteUndoRedo";
import { toast } from "@/lib/toast";
import { NOTES_EDITOR_CONTEXT_MENU_PROPS } from "@/features/notes/agent-context/buildNotesEditorContextData";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { NoteSaveFailureBanner } from "./NoteSaveFailureBanner";
import { NoteDraftRecoveryBanner } from "./NoteDraftRecoveryBanner";
import { FindReplaceBar } from "./FindReplaceBar";
import { FindMatchOverlay } from "./FindMatchOverlay";
import { RecentChangeOverlay } from "./RecentChangeOverlay";
import { MoveNoteDialog } from "./MoveNoteDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { selectFindReplaceState } from "../redux/selectors";
import { computeMatches } from "../utils/findMatches";
import { usePreviewFindHighlight } from "../hooks/usePreviewFindHighlight";
import { getDiffRange, type DiffRange } from "../utils/diffRange";
import { noteFolderReference, type FolderReference } from "../types";
import { downloadFile } from "@ai-matrx/kit/download";

// The docked outline column — loaded only while open (it is beside the note,
// never over it: it shares the editor's row).
const NoteOutlinePanel = dynamic(
  () => import("@/features/notes/components/NoteOutlinePanel"),
  { ssr: false },
);

import { useNotesEditorExtraSections } from "@/features/notes/agent-context/notesEditorExtraSections";

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import type { ContentSource } from "@ai-matrx/rich-content/rich-document/types";
import { UnbindSurfaceContext } from "@/features/canvas/materialization/UnbindSurfaceContext";
import { useNoteArtifactMaterialization } from "../hooks/useNoteArtifactMaterialization";
import { noteIdentityContentSource } from "../richDocumentSource";
import { RECORD_MENU_ATTR } from "@/features/context-menu-v3/record-menu-registry";
import { noteTabRecordMenuKey } from "./noteRecordMenu";
import { usePreparedNoteContentSource } from "../usePreparedNoteContentSource";
import { NoteWorkingCopyAlert } from "./NoteWorkingCopyAlert";
import { authoredBy } from "@ai-matrx/rich-content/levels/prose/remote-image-policy";
import { insertAtRichCaret } from "@ai-matrx/rich-editor/editor/caretInsert";
import { copyRichContent } from "@ai-matrx/rich-content/copy/copy-commands";

interface NoteContentEditorProps {
  noteId: string;
  /**
   * When provided, the preview/split action surface renders REMOTELY to a
   * `<RichDocumentActionSurface surfaceId={...}/>` mounted by the parent
   * (e.g. the Notes page header) instead of inline. Omit for inline actions.
   */
  actionsSurfaceId?: string;
  /**
   * Height-bounded hosts (Notes window, tiles). Drops full-page scroll padding.
   */
  embedded?: boolean;
  /**
   * The host shows this note as an active tab whose chip carries the mic and
   * the "…" menu (the Notes page). The editor then draws neither itself —
   * two of each on one screen was the defect.
   */
  tabCarriesActions?: boolean;
  /**
   * Show the note read-only even when the person may edit it — a host's read
   * mode (the Knowledge hub's peek opens a note to read, with an Edit switch).
   * Never grants editing: a viewer-level sharee stays read-only either way.
   */
  forceReadOnly?: boolean;
}

/** How long a body read may stay "loading" before the wait becomes a message with Retry. */
const NOTE_READ_DEADLINE_MS = 20_000;

export function NoteContentEditor({
  noteId,
  actionsSurfaceId,
  embedded = false,
  tabCarriesActions = false,
  forceReadOnly = false,
}: NoteContentEditorProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const instanceId = useNotesInstanceId();

  // ── Check if note exists in Redux ────────────────────────────────
  const noteExists = useAppSelector(selectNoteById(noteId));
  const contentLoadStatus = useAppSelector(selectNoteContentLoadStatus(noteId));

  // ── Redux selectors (cached — stable references) ──────────────────
  const reduxContent = useAppSelector(selectNoteContent(noteId)) ?? "";
  // One rule for the mode a note opens in (session pick → the mode this note
  // was last typed in → legacy metadata → the person's default, Write).
  const editorMode = useNoteEditorMode(noteId);
  const rememberEditedMode = useRememberNoteEditorMode();

  // The list read carries a preview, never the body (audit N-24), so a note
  // opened from the list is a "list" record until fetchNoteContent lands.
  // Mounting the editor before then shows "" — and a keystroke in that window
  // arms the local-edit sync, the arriving body is discarded as a clobber, and
  // the next save REPLACES the whole note with those few characters. A new
  // unsaved note is created "full" (it is empty), so it opens at once.
  const bodyLoaded = noteExists?._fetchStatus === "full";
  // The body read starts for a note the store holds only as a list row AND for
  // one it does not hold at all (a board tile opened already zoomed, a note
  // outside the list's page or scope): waiting for the list to deliver it
  // left "Loading note…" up forever. A read that settled "loaded" yet left the
  // note without its body (evicted, replaced by a list row) is read once more.
  const rereadFor = useRef<string | null>(null);
  useEffect(() => {
    if (bodyLoaded) return;
    if (contentLoadStatus === "idle") {
      void dispatch(fetchNoteContent(noteId));
    } else if (contentLoadStatus === "loaded" && rereadFor.current !== noteId) {
      rereadFor.current = noteId;
      void dispatch(fetchNoteContent(noteId));
    }
  }, [bodyLoaded, contentLoadStatus, dispatch, noteId]);

  // A read that never answers must say so (nothing fails silently): after the
  // deadline the wait becomes a message with Retry.
  const [readStalled, setReadStalled] = useState(false);
  useEffect(() => {
    if (bodyLoaded || contentLoadStatus !== "loading") {
      setReadStalled(false);
      return;
    }
    const timer = setTimeout(() => setReadStalled(true), NOTE_READ_DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [bodyLoaded, contentLoadStatus, noteId]);

  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const folderReferences = useAppSelector(selectFolderReferences);
  const currentFolder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const noteLabel = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));

  // Live collaborator attribution (realtime `updated_by`) — drives the
  // change-anchored "{name} · editing" bubble in RecentChangeOverlay.
  const noteEditor = useAppSelector(selectNoteEditor(noteId));

  // ── Access gate — a viewer-level sharee gets a read-only editor ────
  // (their RLS-rejected saves would otherwise silently discard every edit).
  const access = useNoteAccess(noteId);
  const readOnly = access.readOnly || forceReadOnly;

  const findReplaceState = useAppSelector(selectFindReplaceState(instanceId));
  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const outlineOpen = useAppSelector(selectInstanceOutlineOpen(instanceId));
  const handleOutlineClose = useCallback(() => {
    dispatch(setInstanceOutlineOpen({ instanceId, open: false }));
  }, [dispatch, instanceId]);

  // A note the person may not edit reads rendered: Write and Source are
  // editing views, so a viewer sees Preview (Plain stays a read-only textarea).
  // The editor body and the outline panel's jump logic agree on the mode shown.
  // A host's read mode (forceReadOnly) reads the rendered note, always.
  const effectiveEditorMode: EditorMode =
    forceReadOnly || (readOnly && isRichEditorMode(editorMode))
      ? "preview"
      : editorMode;
  // THE ONE EDITOR (Write / Source) is driven through its controller: caret
  // inserts from the menu and agents, its own find bar, outline jumps.
  const richEditorRef = useRef<RichEditorController | null>(null);
  const richMode = isRichEditorMode(effectiveEditorMode);

  // ── Dialog state ──────────────────────────────────────────────────
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const conflictActorId = useAppSelector((state) => state.userAuth.id);

  // ── The body this editor shows is the NOTE'S working copy — one per note,
  // shared by every view of it (a board tile, the side panel, a split pane),
  // committed to Redux once per debounce. Never component state: a second
  // view would be a second buffer and a remount would drop what it held.
  const workingCopy = useNoteWorkingCopy(noteId, reduxContent);
  const localContent = workingCopy.content;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // The caret the person left in the plain / split textarea comes back on a
  // remount (a board tile removed and undone, a pane re-opened) — kept per note.
  useKeptTextSelection(
    noteWorkingCopy.key(noteId),
    textareaRef,
    Boolean(noteExists) && bodyLoaded && !richMode,
  );
  // The record's last value this view saw — only to tell an outside change
  // (realtime, undo) from this note's own commit, for the recent-change flash.
  const lastReduxRef = useRef(reduxContent);
  const noteIdRef = useRef(noteId);
  const localContentRef = useRef(localContent);

  const editableContentSource = usePreparedNoteContentSource(
    noteExists?._acknowledgedPhysicalSnapshot && conflictActorId && !readOnly
      ? { record: noteExists, displayedNote: { ...noteExists, content: localContent }, actorId: conflictActorId, hasLocalEdits: isDirty || noteExists._dirty || localContent !== noteExists.content }
      : null,
  );

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
  // State resets happen during render (the state-from-previous-render
  // pattern) so children never render with the wrong noteId's content; the
  // guard makes it strictly one-shot. The refs and the live-content store are
  // written in a layout effect — before paint and before any passive effect
  // reads them. A ref read or written during render made the React Compiler
  // skip this whole editor (no memoisation at all).
  const [renderedNoteId, setRenderedNoteId] = useState(noteId);
  if (noteId !== renderedNoteId) {
    setRenderedNoteId(noteId);
    setResetGen((n) => n + 1);
    // The recent-change flash is per-note — its range is meaningless once
    // we've swapped to a different document.
    setRecentChange(null);
  }
  useLayoutEffect(() => {
    if (noteIdRef.current === noteId) return;
    noteIdRef.current = noteId;
    lastReduxRef.current = reduxContent;
    localContentRef.current = localContent;
  }, [noteId, reduxContent, localContent]);

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

    // Self-echo: this note's own commit came back through the selector (from
    // this view or another view of the same note). Just update the
    // high-water mark; no state changes, no remount.
    if (reduxContent === localContentRef.current) {
      lastReduxRef.current = reduxContent;
      return;
    }

    // Don't clobber words still pending in ANY view of this note (the
    // working copy keeps them; useNoteWorkingCopy offered it the new body).
    if (workingCopy.hasPending()) return;

    const previous = localContentRef.current;
    lastReduxRef.current = reduxContent;
    localContentRef.current = reduxContent;

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
    }, 2600); // long enough to read the "{name} · editing" bubble
  }, [reduxContent]);

  useEffect(() => {
    return () => {
      if (recentChangeTimerRef.current) {
        clearTimeout(recentChangeTimerRef.current);
      }
    };
  }, []);

  // ── A keystroke: the note's working copy (every view updates now); its ONE
  // debounced commit to Redux uses the same adaptive delay table as before.
  const handleChange = useCallback(
    (content: string) => {
      localContentRef.current = content;
      workingCopy.edit(content);
      // The person typed here: this note reopens in this mode (plain notes stay
      // plain). Writes only when the remembered mode changes.
      rememberEditedMode(noteId, effectiveEditorMode);
    },
    [noteId, workingCopy, rememberEditedMode, effectiveEditorMode],
  );

  // ── Flush sync: local -> Redux immediately (no debounce) ───────────
  // Used for discrete edits (preview block edits, voice transcription,
  // full-screen markdown editor commits) where waiting for a keystroke
  // debounce would leave Redux transiently out of sync with what the
  // user just committed.
  const handleChangeFlush = useCallback(
    (content: string) => {
      localContentRef.current = content;
      lastReduxRef.current = content;
      workingCopy.editNow(content);
    },
    [workingCopy],
  );

  // Unmount needs nothing here: the working copy commits whatever this view
  // held when its LAST view detaches (tab close, navigation, a board tile
  // falling asleep), and keeps it for any other view still showing the note.

  // ── The `matrx-user/notes` surface runtime — read AND write half ──────
  // ONE hook shared with the phone editor (MobileNoteEditor), so a run from
  // the header, the context menu or the "…" bound agents carries the same
  // scope and the same five write targets on every device (W-69).
  const {
    surfaceContextData,
    getApplicationScope,
    getWriteHandlers: getSurfaceWriteHandlers,
  } = useNotesSurfaceRuntime({
    instanceId,
    noteId,
    content: localContent,
    contentRef: localContentRef,
    textareaRef,
    richEditorRef,
    richMode,
    editorMode,
    readOnly,
    accessLoading: access.loading,
    applyContent: handleChangeFlush,
  });

  // ── Note undo/redo ────────────────────────────────────────────────
  // Mounting this hook ALSO installs the capture-phase Cmd+Z / Ctrl+Z (and
  // Ctrl+Y) interceptor that routes undo to the note's Redux stack and
  // suppresses native textarea undo (which desyncs from Redux). The bespoke
  // menu used to mount it; now that NoteContentEditor owns the canonical menu,
  // it must mount it — otherwise note undo silently regresses.
  const { canUndo, canRedo, undo, redo, undoHint, redoHint } = useNoteUndoRedo({
    noteId,
    scope: () => editorRootRef.current,
    editorHistoryDepth: () =>
      richMode ? (richEditorRef.current?.historyDepth() ?? null) : null,
  });

  // ── Context menu handlers ─────────────────────────────────────────
  const handleSave = useCallback(() => {
    workingCopy.flush();
    lastReduxRef.current = localContentRef.current;
    dispatch(saveNote(noteId));
  }, [dispatch, noteId, workingCopy]);

  const handleDuplicate = useCallback(() => {
    dispatch(copyNote({ noteId, instanceId }));
  }, [dispatch, instanceId, noteId]);

  const handleExport = useCallback(() => {
    const blob = new Blob([localContent], { type: "text/markdown" });
    downloadFile(`${noteLabel}.md`, blob, blob.type);
  }, [localContent, noteLabel]);

  const handleShareLink = useCallback(() => {
    setShareDialogOpen(true);
  }, []);

  const handleShareClipboard = useCallback(() => {
    void copyRichContent(localContent, "default");
  }, [localContent]);

  const handleMove = useCallback(() => {
    setMoveDialogOpen(true);
  }, []);

  const handleMoveConfirm = useCallback(
    async (targetFolder: FolderReference) => {
      await dispatch(
        moveNoteToFolder({
          noteId,
          folder: targetFolder,
        }),
      ).unwrap();
    },
    [dispatch, noteId],
  );

  const availableFolderReferences = folderReferences.filter(
    (folder) => folder.organizationId === noteExists?.organization_id,
  );

  const handleMoveByName = useCallback(
    (folderName: string) => {
      const folder = availableFolderReferences.find(
        (candidate) => candidate.name === folderName,
      );
      if (!folder) throw new Error("Selected folder is no longer available.");
      return handleMoveConfirm(folder);
    },
    [availableFolderReferences, handleMoveConfirm],
  );

  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      await dispatch(moveNoteToNewFolder({ noteId, folderName })).unwrap();
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

  // ── Insert agent output at the cursor (before / after the selection) ──
  // Fed to the canonical menu's onTextInsertBefore/After so agent results land
  // in the note. Flushes straight to Redux (no debounce) like the demo.
  const insertAtCursor = useCallback(
    (text: string, position: "before" | "after") => {
      // Write / Source: a new block before / after the selection, in the editor
      // itself (its onChange carries it to the note like typing).
      const rich = richMode ? richEditorRef.current : null;
      if (rich) {
        rich.insertText(text, position);
        return;
      }
      const ta = textareaRef.current;
      const base = localContent;
      if (!ta) {
        handleChangeFlush(
          position === "before" ? `${text}\n\n${base}` : `${base}\n\n${text}`,
        );
        return;
      }
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      handleChangeFlush(
        position === "before"
          ? base.slice(0, start) + text + "\n\n" + base.slice(start)
          : base.slice(0, end) + "\n\n" + text + base.slice(end),
      );
    },
    [localContent, handleChangeFlush, richMode],
  );

  // ── Find in Write / Source → the one editor's own find bar ──────────
  // Its bar highlights in the view that is showing and never matches inside
  // protected content (code, math, kinds). ⌘F / the menu open the notes find
  // state; in these modes it is handed to the editor and closed here, so ONE
  // bar answers. Search across notes (global scope) stays the notes bar.
  const findOpen = findReplaceState?.isOpen ?? false;
  const findScope = findReplaceState?.scope;
  const findWithReplace = findReplaceState?.showReplace ?? false;
  useEffect(() => {
    if (!richMode || !findOpen || findScope === "global") return;
    richEditorRef.current?.openFind(findWithReplace);
    dispatch(closeFindReplace({ instanceId }));
  }, [richMode, findOpen, findScope, findWithReplace, dispatch, instanceId]);

  // The editor switched its own view (⌘-shortcut, or back after a refused
  // switch): the note's mode follows, so the header shows the truth.
  const handleEditorModeChange = useCallback(
    (mode: EditorMode) => {
      dispatch(setNoteEditorMode({ id: noteId, mode }));
    },
    [dispatch, noteId],
  );


  // ── Artifact materialization surface ─────────────────────────────
  // Notes as a materialization surface (/Users/armanisadeghi/code/common-docs/systems/publish/artifacts/TWO-WAY-BINDING.md):
  // explicit convert-blocks action + the unbind ("Detach as text") provider for
  // artifact refs rendered in the preview. All writes go through
  // handleChangeFlush + saveNote — the same canonical path as content cleanup.
  const { materializeNoteArtifacts, unbindSurface } =
    useNoteArtifactMaterialization({
      noteId,
      getContent: () => localContentRef.current,
      applyContent: handleChangeFlush,
      readOnly: access.loading || readOnly,
    });

  // Notes-specific menu items wired to the REAL handlers above (no stubs).
  const notesExtras = useNotesEditorExtraSections({
    noteActionsFromTab: tabCarriesActions,
    isDirty,
    allFolders: availableFolderReferences.map((folder) => folder.name),
    currentFolder,
    openTabCount: openTabs?.length ?? 1,
    onSave: handleSave,
    onDuplicate: handleDuplicate,
    onExport: handleExport,
    onShareLink: handleShareLink,
    onShareClipboard: handleShareClipboard,
    onMoveToFolder: handleMoveByName,
    onMoveDialog: handleMove,
    onCreateFolder: () => setCreateFolderOpen(true),
    onCloseTab: handleCloseTab,
    onCloseOtherTabs: handleCloseOtherTabs,
    onCloseAllTabs: handleCloseAllTabs,
    onConvertBlocksToArtifacts: unbindSurface
      ? () => void materializeNoteArtifacts()
      : undefined,
    onDelete: handleDelete,
  });

  // A deep link adds its tab before the request resolves, and a note opened
  // from the list waits for its body (see `bodyLoaded`). Treating either gap
  // as a missing record made a slow/temporarily unavailable DB look like a
  // deleted note. Only show unavailable after the request rejects.
  if (!noteExists || !bodyLoaded) {
    if (readStalled) {
      return (
        <div className="flex flex-1 items-center justify-center p-4" role="alert">
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            This note is taking too long to load.
            <button
              type="button"
              className="rounded border border-border px-2 py-1 text-foreground hover:bg-accent"
              onClick={() => {
                setReadStalled(false);
                void dispatch(fetchNoteContent(noteId));
              }}
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    if (contentLoadStatus !== "error") {
      return (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="flex items-center gap-2 text-sm" role="status">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading note…
          </div>
        </div>
      );
    }

    // The read refused or found nothing: the canonical gate resolves which
    // (denied, trashed, missing, signed out, or a genuine fault with retry).
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <AccessGate
          token="note"
          id={noteId}
          onRetry={() => void dispatch(fetchNoteContent(noteId))}
          fallbackHref="/notes"
          fallbackLabel="All notes"
          footer={
            <button
              type="button"
              onClick={() => {
                dispatch(markTabInteraction({ instanceId }));
                dispatch(removeInstanceTab({ instanceId, noteId }));
              }}
              className="text-xs text-primary hover:text-primary/80 cursor-pointer"
            >
              Close this tab
            </button>
          }
        />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <SurfaceRuntimeProvider
      surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getApplicationScope}
      isEditable={!readOnly}
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      {/* The note's working copy: a stored row that moved under unsaved
          words (Keep mine / Take theirs / Merge), or a save that failed for good. */}
      <NoteWorkingCopyAlert noteId={noteId} className="shrink-0" />

      {/* Artifact refs rendered in the preview get their unbind path from
          this provider (null while read-only / access loading — the Detach
          chrome then simply doesn't render). */}
      <UnbindSurfaceContext.Provider value={unbindSurface}>
        {/* The note and its docked outline share one row. */}
        <div className="relative flex flex-1 min-h-0 min-w-0">
        <EditableContextMenu
          {...NOTES_EDITOR_CONTEXT_MENU_PROPS}
          extraSections={notesExtras}
          getTextarea={() => (richMode ? null : textareaRef.current)}
          insertAtCaret={
            richMode
              ? (text: string, placement?: "inline" | "block") =>
                  insertAtRichCaret(richEditorRef.current, text, placement)
              : undefined
          }
          getApplicationScope={getApplicationScope}
          // Note-typed content source so the rich-document Export / Convert
          // actions (HTML preview save-back, Convert→Task linking) resolve the
          // note adapter instead of the save-less `raw` default (D33). Held to
          // raw while access is loading or read-only — a Save that RLS would
          // reject must not render, not even transiently.
          contentSource={
            access.loading || readOnly
              ? undefined
              : editableContentSource
          }
          contextData={surfaceContextData}
          onTextReplace={handleChangeFlush}
          onTextInsertBefore={(t) => insertAtCursor(t, "before")}
          onTextInsertAfter={(t) => insertAtCursor(t, "after")}
          onContentInserted={() => {}}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          undoHint={undoHint}
          redoHint={redoHint}
        >
          <div
            ref={editorRootRef}
            className="flex-1 flex flex-col min-h-0 min-w-0"
            data-surface-value="current_note"
            // This note's tab rows join every menu opened on its content, and
            // the tab's ⋯ opens that menu — one menu for the note (R26).
            {...{ [RECORD_MENU_ATTR]: noteTabRecordMenuKey(instanceId, noteId) }}
          >
            {access.readOnly && (
              <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span className="text-xs truncate">
                  Read-only — shared with view access
                  {access.ownerEmail ? ` by ${access.ownerEmail}` : ""}. Your
                  edits here can't be saved.
                </span>
                <button
                  type="button"
                  onClick={handleDuplicate}
                  className="ml-auto shrink-0 rounded px-2 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-500/15 dark:text-amber-400 transition-colors cursor-pointer"
                  title="Create your own editable copy of this note"
                >
                  Duplicate to edit
                </button>
              </div>
            )}
            {/* Loud recovery, in priority order: work that is failing to save
              blocks first, then work we already rescued into a local draft. */}
            <NoteSaveFailureBanner noteId={noteId} />
            {!readOnly && (
              <NoteDraftRecoveryBanner
                noteId={noteId}
                onRestore={handleChangeFlush}
              />
            )}
            {findReplaceState?.isOpen &&
              (!richMode || findReplaceState.scope === "global") && (
                <FindReplaceBar noteId={noteId} textareaRef={textareaRef} />
              )}
            <NoteEditorCore imagePolicy={authoredBy(noteExists?.created_by, conflictActorId)}
              content={localContent}
              onChange={handleChange}
              onChangeFlush={handleChangeFlush}
              readOnly={readOnly}
              editorMode={effectiveEditorMode}
              textareaRef={textareaRef}
              richEditorRef={richEditorRef}
              onEditorModeChange={handleEditorModeChange}
              // The note's own menu (its rows, scope, agents) answers right-clicks
              // in every mode — the one editor mounts none of its own here.
              hostContextMenu
              surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
              getApplicationScope={getApplicationScope}
              // On the Notes page the active tab carries the one mic and the
              // one "…" menu; the editor's own floating copies duplicated them
              // (page-pass 2026-09-27). Embedded hosts have no tab strip.
              showVoiceButton={!tabCarriesActions && editorMode !== "preview" && !readOnly}
              previewActionsVariant={tabCarriesActions ? "none" : undefined}
              placeholder="Start typing..."
              className="flex-1 min-h-0"
              resetKey={`${noteId}:${resetGen}`}
              noteId={noteId}
              actionsSource={editableContentSource ?? noteIdentityContentSource(noteId, `editor-core:${noteId}`)}
              actionsSurfaceId={actionsSurfaceId}
              largeScrollbar={!embedded}
              embedded={embedded}
              enableTextStats={false}
              findOverlay={
                editorMode === "plain" || editorMode === "split" ? (
                  <>
                    {findReplaceState?.isOpen && (
                      // Keyed by editorMode so the overlay remounts cleanly when
                      // the user toggles plain↔split — a fresh mount re-scrolls
                      // the active match into view instead of leaving it stranded.
                      <NoteFindMatchOverlayRedux
                        key={editorMode}
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
                        editorLabel={
                          noteEditor ? editorDisplayName(noteEditor) : null
                        }
                      />
                    )}
                  </>
                ) : null
              }
              previewContainerRef={previewContainerRef}
            />
            {findReplaceState?.isOpen &&
              (editorMode === "split" || editorMode === "preview") && (
                // Keyed by editorMode so the hook remounts when switching
                // split↔preview. The preview DOM container is a different element
                // per mode, and a stable ref can't tell the effect its `.current`
                // swapped — remounting forces a fresh highlight + scroll-to-active
                // against the new container.
                <NotePreviewFindHighlightRedux
                  key={editorMode}
                  instanceId={instanceId}
                  containerRef={previewContainerRef}
                />
              )}
          </div>
        </EditableContextMenu>
        {outlineOpen && (
          <NoteOutlinePanel
            instanceId={instanceId}
            noteId={noteId}
            content={localContent}
            editorMode={effectiveEditorMode}
            textareaRef={textareaRef}
            previewContainerRef={previewContainerRef}
            editorRootRef={editorRootRef}
            onJumpInEditor={(offset) => richEditorRef.current?.jumpToOffset(offset)}
            onClose={handleOutlineClose}
          />
        )}
        </div>
      </UnbindSurfaceContext.Provider>


      <MoveNoteDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        onConfirm={handleMoveConfirm}
        onCreateFolder={handleCreateFolder}
        noteId={noteId}
        noteName={noteLabel}
        currentFolder={noteExists ? noteFolderReference(noteExists) : null}
        availableFolders={availableFolderReferences}
      />

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onConfirm={handleCreateFolder}
        existingFolders={availableFolderReferences.map((folder) => folder.name)}
        description="Create a folder and move this note into it immediately."
        confirmLabel="Create & Move"
      />

      <ShareModal
        isOpen={shareDialogOpen}
        onClose={() => setShareDialogOpen(false)}
        resourceType="note"
        resourceId={noteId}
        resourceName={noteLabel}
      />
    </SurfaceRuntimeProvider>
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
  // (The React Compiler memoises this; a hand-written useMemo here made it
  // skip the component.)
  const matches = fr?.query
    ? computeMatches(content, fr.query, {
        caseSensitive: fr.caseSensitive,
        useRegex: fr.useRegex,
        wholeWord: fr.wholeWord,
      })
    : [];

  // Bump a scroll token each time the user navigates so the overlay knows
  // to scroll the active match into view. Content changes alone shouldn't
  // force a scroll — that would disrupt editing.
  const activeIndex = fr?.currentMatchIndex ?? -1;
  const [scrollToken, setScrollToken] = useState(0);
  // Seed with a sentinel (not the live index) so the FIRST commit — a fresh
  // mount after reopening find or switching editor mode — counts as a change
  // and scrolls the already-active match into view. Without this, reopening
  // the bar on match 23 leaves the viewport wherever it was.
  const prevActiveRef = useRef(-1);
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
  // Sentinel seed (see NoteFindMatchOverlayRedux) so a fresh mount after a
  // mode switch scrolls the active match into view rather than staying put.
  const prevActiveRef = useRef(-1);
  useEffect(() => {
    const current = fr?.currentMatchIndex ?? -1;
    if (prevActiveRef.current !== current) {
      prevActiveRef.current = current;
      setScrollToken((n) => n + 1);
    }
  }, [fr?.currentMatchIndex]);

  // ── Cold-mount readiness ticker ───────────────────────────────────
  // A cold switch into preview renders its markdown seconds later (lazy chunk
  // + parse) and React can swap the scroll-container element once Suspense
  // resolves — leaving `containerRef.current` pointing at an empty/discarded
  // node. Owned by a stable effect (only torn down on unmount), this bounded
  // interval bumps a nonce so the highlighter re-acquires the now-filled
  // container and applies highlights + scroll. It stops the moment the
  // container has rendered text AND highlights are registered (or after ~9s).
  const [refreshNonce, setRefreshNonce] = useState(0);
  useEffect(() => {
    let ticks = 0;
    const id = setInterval(() => {
      ticks += 1;
      // Bump the nonce first — this re-runs the highlighter against whatever the
      // container holds right now. Then stop once the container has actually
      // rendered text (the cold-load race is over) or after a ~9s safety cap.
      setRefreshNonce((n) => n + 1);
      const el = containerRef.current;
      const hasText = !!el && (el.textContent ?? "").trim().length > 0;
      // Stop as soon as content is present (normal notes settle in 1 tick);
      // the cap (~18s) only ever matters for a huge doc's slow cold render.
      if (hasText || ticks >= 120) clearInterval(id);
    }, 150);
    return () => clearInterval(id);
  }, [containerRef]);

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
    refreshNonce,
  });
  return null;
}
