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
import { Eye, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import {
  updateNoteContent,
  removeInstanceTab,
  markNoteSaved,
  markTabInteraction,
  setNoteEditorMode,
  resolveNoteConflict,
  upsertNoteFromServer,
} from "../redux/slice";
import { getReduxSyncDelay } from "../redux/notes.types";
import {
  selectNoteById,
  selectNoteContent,
  selectNoteEditor,
  selectNoteEditorMode,
  selectNoteIsDirtyById,
  selectNoteFolder,
  selectNoteLabel,
  selectAllFolders,
  selectInstanceTabs,
  selectNoteSaveState,
} from "../redux/selectors";
import { editorDisplayName } from "../utils/editorDisplayName";
import {
  saveNote,
  copyNote,
  deleteNote,
  moveNoteToFolder,
} from "../redux/thunks";
import { useNotesInstanceId } from "../context/NotesInstanceContext";
import { useNoteAccess } from "../hooks/useNoteAccess";
import {
  normalizeNoteEditorMode,
  usePreferredDefaultEditorMode,
} from "../hooks/usePreferredDefaultEditorMode";
import { analyzeDiff } from "../utils/diffAnalysis";
import { supabase } from "@/utils/supabase/client";
import { NoteEditorCore } from "./NoteEditorCore";
import { setNoteLiveContent } from "../utils/noteLiveContent";
import { useNotesSurfaceScope } from "../hooks/useNotesSurfaceScope";
import { useNoteUndoRedo } from "../hooks/useNoteUndoRedo";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { NOTES_EDITOR_CONTEXT_MENU_PROPS } from "@/features/notes/agent-context/buildNotesEditorContextData";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { NoteSaveFailureBanner } from "./NoteSaveFailureBanner";
import { NoteDraftRecoveryBanner } from "./NoteDraftRecoveryBanner";
import { registerNotesDraftSource } from "../utils/notesDrafts";
import { FindReplaceBar } from "./FindReplaceBar";
import { FindMatchOverlay } from "./FindMatchOverlay";
import { RecentChangeOverlay } from "./RecentChangeOverlay";
import { MoveNoteDialog } from "./MoveNoteDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { createFolder } from "../service/notesService";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { selectFindReplaceState } from "../redux/selectors";
import { computeMatches } from "../utils/findMatches";
import { usePreviewFindHighlight } from "../hooks/usePreviewFindHighlight";
import { getDiffRange, type DiffRange } from "../utils/diffRange";

const NoteConflictWindow = dynamic(
  () =>
    import("@/features/notes/components/NoteConflictWindow").then((mod) => ({
      default: mod.NoteConflictWindow,
    })),
  { ssr: false },
);

import { createNotesEditorExtraSections } from "@/features/notes/agent-context/notesEditorExtraSections";

// Universal v3 context menu — the SAME menu everywhere. The wrapper is the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import type { ContentSource } from "@/features/rich-document/types";
import { UnbindSurfaceContext } from "@/features/canvas/materialization/UnbindSurfaceContext";
import { useNoteArtifactMaterialization } from "../hooks/useNoteArtifactMaterialization";

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
}

export function NoteContentEditor({
  noteId,
  actionsSurfaceId,
  embedded = false,
}: NoteContentEditorProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const instanceId = useNotesInstanceId();

  // Unsaved-work snapshots: while an editor is mounted, the local-draft store
  // can pull every dirty note out of Redux. Registration is idempotent — the
  // primitive keys sources by namespace, so split view / windows just replace
  // the collector. See lib/local-drafts/FEATURE.md.
  useEffect(
    () => registerNotesDraftSource(() => store.getState()),
    [store],
  );

  // ── Check if note exists in Redux ────────────────────────────────
  const noteExists = useAppSelector(selectNoteById(noteId));

  // ── Redux selectors (cached — stable references) ──────────────────
  const reduxContent = useAppSelector(selectNoteContent(noteId)) ?? "";
  const preferredDefaultMode = usePreferredDefaultEditorMode();
  const savedEditorMode = useAppSelector(selectNoteEditorMode(noteId));
  const editorMode = normalizeNoteEditorMode(
    savedEditorMode,
    preferredDefaultMode,
  );

  // Persist the viewport-preferred default once so resize doesn't flip mid-edit.
  useEffect(() => {
    if (!noteExists || savedEditorMode) return;
    dispatch(setNoteEditorMode({ id: noteId, mode: preferredDefaultMode }));
  }, [dispatch, noteId, noteExists, savedEditorMode, preferredDefaultMode]);
  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const allFolders = useAppSelector(selectAllFolders);
  const currentFolder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const noteLabel = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));

  const saveState = useAppSelector(selectNoteSaveState(noteId));
  // Live collaborator attribution (realtime `updated_by`) — drives the
  // change-anchored "{name} · editing" bubble in RecentChangeOverlay.
  const noteEditor = useAppSelector(selectNoteEditor(noteId));

  // ── Access gate — a viewer-level sharee gets a read-only editor ────
  // (their RLS-rejected saves would otherwise silently discard every edit).
  const access = useNoteAccess(noteId);
  const readOnly = access.readOnly;

  const findReplaceState = useAppSelector(selectFindReplaceState(instanceId));
  const previewContainerRef = useRef<HTMLDivElement | null>(null);

  // ── Dialog state ──────────────────────────────────────────────────
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  // ── Conflict state ────────────────────────────────────────────────
  // `updatedAt` rides along so resolution can adopt the server's timestamp —
  // without it the next save's optimistic lock (`WHERE updated_at =`) fails
  // again and the conflict is sticky/infinite.
  const [conflictRemote, setConflictRemote] = useState<{
    content: string;
    updatedAt: string | null;
  } | null>(null);

  // ── Local content state — initialized from Redux, synced back on debounce
  const [localContent, setLocalContent] = useState(reduxContent);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReduxRef = useRef(reduxContent);
  const noteIdRef = useRef(noteId);
  const localContentRef = useRef(localContent);

  // When Redux detects a conflict, fetch the remote version to show diff.
  // Declared after `localContentRef` because it reads the live editor buffer to
  // verify the conflict is real before surfacing it.
  useEffect(() => {
    if (saveState !== "conflict") {
      setConflictRemote(null);
      return;
    }
    // Fetch fresh remote content
    supabase
      .schema("workbench")
      .from("notes")
      .select("content, updated_at")
      .eq("id", noteId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.content == null) return;

        // LAST LINE OF DEFENSE — never show a conflict the real data does not
        // support. If the live server row already holds exactly what is in the
        // editor right now, there is nothing to reconcile: adopt the server's
        // `updated_at` (so the next save's optimistic lock passes) and clear
        // the flag silently instead of alarming the user about their own work.
        if (data.content === localContentRef.current) {
          console.warn(
            "[Notes] false conflict suppressed — server content already matches the editor for",
            noteId,
          );
          dispatch(
            resolveNoteConflict({
              id: noteId,
              updatedAt: data.updated_at ?? undefined,
            }),
          );
          return;
        }

        setConflictRemote({
          content: data.content,
          updatedAt: data.updated_at ?? null,
        });
      });
  }, [saveState, noteId, dispatch]);

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
    setNoteLiveContent(noteId, reduxContent);
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
    setNoteLiveContent(noteId, reduxContent);

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
      setNoteLiveContent(noteId, content);
      syncToRedux(content);
    },
    [noteId, syncToRedux],
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
      setNoteLiveContent(noteId, content);
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
    setNoteLiveContent(noteId, localContentRef.current);
    return () => {
      setNoteLiveContent(noteId, null);
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

  // ── Agent-context surface scope (`matrx-user/notes`) ─────────────────
  // ONE builder, shared with the right-click menu's data path. Reads the live
  // textarea selection + Redux at call time (no stale snapshot). The plain-mode
  // ProTextarea's "…" bound-agent runs and the context menu both resolve scope
  // through this, so the body and the menu stay perfectly in sync.
  const buildSurfaceScope = useNotesSurfaceScope({
    instanceId,
    noteId,
    content: localContent,
    textareaRef,
    editorMode,
  });

  // Memoized snapshot for the context menu's `contextData` prop. Calling
  // `buildSurfaceScope()` inline in JSX rebuilt an O(all-notes) map on every
  // render — i.e. every keystroke (2026-07 freeze class, cost amplifier).
  const surfaceContextData = useMemo(
    () => buildSurfaceScope() as Record<string, unknown>,
    [buildSurfaceScope],
  );

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

  // ── Note undo/redo ────────────────────────────────────────────────
  // Mounting this hook ALSO installs the capture-phase Cmd+Z / Ctrl+Z (and
  // Ctrl+Y) interceptor that routes undo to the note's Redux stack and
  // suppresses native textarea undo (which desyncs from Redux). The bespoke
  // menu used to mount it; now that NoteContentEditor owns the canonical menu,
  // it must mount it — otherwise note undo silently regresses.
  const { canUndo, canRedo, undo, redo, undoHint, redoHint } = useNoteUndoRedo({
    noteId,
  });
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);

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
    async (targetFolder: string) => {
      await dispatch(
        moveNoteToFolder({ noteId, folder: targetFolder }),
      ).unwrap();
    },
    [dispatch, noteId],
  );

  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      await createFolder(folderName);
      await dispatch(moveNoteToFolder({ noteId, folder: folderName })).unwrap();
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

  // Super-admin only — hard delete (bypasses soft-delete). Confirmed first.
  const handlePermanentDelete = useCallback(async () => {
    const ok = await confirm({
      title: "Permanently delete note",
      description: "Permanently delete this note? This cannot be undone.",
      confirmLabel: "Permanently delete",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      const { permanentlyDeleteNoteThunk } =
        await import("@/features/notes/redux/thunks");
      await dispatch(permanentlyDeleteNoteThunk(noteId)).unwrap();
      dispatch(markTabInteraction({ instanceId }));
      dispatch(removeInstanceTab({ instanceId, noteId }));
      toast.success("Note permanently deleted");
    } catch {
      toast.error("Failed to permanently delete note");
    }
  }, [dispatch, instanceId, noteId]);

  // ── Insert agent output at the cursor (before / after the selection) ──
  // Fed to the canonical menu's onTextInsertBefore/After so agent results land
  // in the note. Flushes straight to Redux (no debounce) like the demo.
  const insertAtCursor = useCallback(
    (text: string, position: "before" | "after") => {
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
    [localContent, handleChangeFlush],
  );

  // ── Artifact materialization surface ─────────────────────────────
  // Notes as a materialization surface (features/canvas/docs/TWO_WAY_BINDING.md):
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
  const notesExtras = createNotesEditorExtraSections({
    isDirty,
    allFolders,
    currentFolder,
    openTabCount: openTabs?.length ?? 1,
    onSave: handleSave,
    onDuplicate: handleDuplicate,
    onExport: handleExport,
    onShareLink: handleShareLink,
    onShareClipboard: handleShareClipboard,
    onMoveToFolder: handleMoveConfirm,
    onMoveDialog: handleMove,
    onCreateFolder: () => setCreateFolderOpen(true),
    onCloseTab: handleCloseTab,
    onCloseOtherTabs: handleCloseOtherTabs,
    onCloseAllTabs: handleCloseAllTabs,
    onConvertBlocksToArtifacts: unbindSurface
      ? () => void materializeNoteArtifacts()
      : undefined,
    onDelete: handleDelete,
    isSuperAdmin,
    onPermanentDelete: handlePermanentDelete,
  });

  // ── Conflict resolution handlers ──────────────────────────────────
  // NEVER resolve a conflict with `markNoteSaved({id})` (no snapshot): it
  // wipes ALL dirty fields, so the queued save bails on `!_dirty` and nothing
  // is written — "Keep mine" was a silent no-op and, with the stale
  // updated_at still in place, the conflict re-fired on the next keystroke
  // forever (2026-07 freeze class).
  const handleKeepMine = useCallback(
    (editedContent: string) => {
      // User chose their version (possibly edited in the conflict window).
      setLocalContent(editedContent);
      lastReduxRef.current = editedContent;
      // Adopt the server's updated_at + clear the conflict error, WITHOUT
      // touching dirty state — then let the normal autosave pipeline persist
      // the (still-dirty) local content. Its optimistic lock now passes, so
      // this consciously overwrites the remote version.
      dispatch(
        resolveNoteConflict({
          id: noteId,
          updatedAt: conflictRemote?.updatedAt ?? undefined,
        }),
      );
      dispatch(updateNoteContent({ id: noteId, content: editedContent }));
      setConflictRemote(null);
    },
    [dispatch, noteId, conflictRemote],
  );

  const handleAcceptRemote = useCallback(() => {
    if (conflictRemote == null) return;
    // Accept the remote version — overwrite local.
    setLocalContent(conflictRemote.content);
    lastReduxRef.current = conflictRemote.content;
    // Remote is already saved: drop local dirt, then write the server's
    // content + updated_at into the store (upsert is a no-op merge for a
    // clean record). No autosave gets armed — there is nothing to save.
    dispatch(markNoteSaved({ id: noteId }));
    dispatch(
      upsertNoteFromServer({
        note: {
          id: noteId,
          content: conflictRemote.content,
          updated_at: conflictRemote.updatedAt ?? undefined,
        },
        fetchStatus: "full",
      }),
    );
    setConflictRemote(null);
  }, [dispatch, noteId, conflictRemote]);

  const handleCancelConflict = useCallback(() => {
    // Dismiss conflict window — keep local edits as dirty
    setConflictRemote(null);
  }, []);

  // Memoized — analyzeDiff builds an O(lines²) LCS matrix. Computing it
  // inline in JSX re-ran it on EVERY render (i.e. every keystroke while a
  // conflict was open), which alone could saturate the main thread on a
  // large note (2026-07 freeze class).
  const conflictAnalysis = useMemo(
    () =>
      conflictRemote != null
        ? analyzeDiff(localContent, conflictRemote.content)
        : null,
    [localContent, conflictRemote],
  );

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

  // ── Guard: shared note's content still in flight ────────────────────
  // Shared-with-me rows arrive from the RPC WITHOUT content. Mounting the
  // editor on "" is not just a flash of empty state: an editor-level sharee
  // typing during the fetch window arms the local-edit sync, the arriving
  // server content gets discarded as a clobber-guard, and the next save
  // REPLACES the owner's entire note body with those few keystrokes.
  if (noteExists._sharedWithMe && noteExists.content == null) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <SurfaceRuntimeProvider
      surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getApplicationScope}
      isEditable={!readOnly}
    >
      {/* Conflict resolution window */}
      {conflictRemote != null && conflictAnalysis != null && (
        <NoteConflictWindow
          noteTitle={noteLabel}
          localContent={localContent}
          remoteContent={conflictRemote.content}
          analysis={conflictAnalysis}
          onKeepMine={handleKeepMine}
          onAcceptChanges={handleAcceptRemote}
          onCancel={handleCancelConflict}
        />
      )}

      {/* Artifact refs rendered in the preview get their unbind path from
          this provider (null while read-only / access loading — the Detach
          chrome then simply doesn't render). */}
      <UnbindSurfaceContext.Provider value={unbindSurface}>
      <EditableContextMenu
        {...NOTES_EDITOR_CONTEXT_MENU_PROPS}
        extraSections={notesExtras}
        getTextarea={() => textareaRef.current}
        getApplicationScope={getApplicationScope}
        // Note-typed content source so the rich-document Export / Convert
        // actions (HTML preview save-back, Convert→Task linking) resolve the
        // note adapter instead of the save-less `raw` default (D33). Held to
        // raw while access is loading or read-only — a Save that RLS would
        // reject must not render, not even transiently.
        contentSource={
          access.loading || readOnly
            ? undefined
            : ({ type: "note", noteId } satisfies ContentSource)
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
          className="flex-1 flex flex-col min-h-0 min-w-0"
          data-surface-value="current_note"
        >
          {readOnly && (
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
          {findReplaceState?.isOpen && (
            <FindReplaceBar noteId={noteId} textareaRef={textareaRef} />
          )}
          <NoteEditorCore
            content={localContent}
            onChange={handleChange}
            onChangeFlush={handleChangeFlush}
            readOnly={readOnly}
            editorMode={
              // TUI modes have no read-only support — degrade to preview.
              readOnly &&
              (editorMode === "wysiwyg" || editorMode === "markdown-split")
                ? "preview"
                : editorMode
            }
            textareaRef={textareaRef}
            surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
            getApplicationScope={getApplicationScope}
            showVoiceButton={editorMode !== "preview" && !readOnly}
            placeholder="Start typing..."
            className="flex-1 min-h-0"
            resetKey={`${noteId}:${resetGen}`}
            noteId={noteId}
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
      </UnbindSurfaceContext.Provider>

      <MoveNoteDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        onConfirm={handleMoveConfirm}
        noteName={noteLabel}
        currentFolder={currentFolder}
        availableFolders={allFolders}
      />

      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onConfirm={handleCreateFolder}
        existingFolders={allFolders}
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
