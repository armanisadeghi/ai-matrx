"use client";

// Layer 3: NoteTabItem — Full-featured VSCode-style tab.
// Matches ALL SSR workspace tab features:
// - Editable title on active tab (debounced save)
// - Dirty indicator (amber dot)
// - Active tab action buttons: Save, Duplicate, Share, Info, Delete, Voice
//   (Info opens the Note Info window — note metadata + context + folder)
// - Close button on all tabs
// - Right-click context menu
// - DnD reordering
// Props: noteId + instanceId only. Everything from Redux.

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Save,
  Copy,
  Check,
  CopyPlus,
  Share2,
  Trash2,
  X,
  Download,
  Info,
  Bookmark,
  MoreHorizontal,
  Database,
  FolderInput,
} from "lucide-react";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setInstanceActiveTab,
  removeInstanceTab,
  updateNoteLabel,
  updateNoteContent,
  markTabInteraction,
} from "../redux/slice";
import { setNoteLabelEditing } from "../utils/labelEditing";
import {
  selectNoteLabel,
  selectNoteIsDirtyById,
  selectNoteIsSavingById,
  selectNoteContent,
  selectInstanceTabs,
  selectAllFolders,
  selectNoteFolder,
} from "../redux/selectors";
import { saveNote, copyNote, moveNoteToFolder } from "../redux/thunks";
import { NoteShareModal } from "./NoteShareModal";
import { useOpenNoteInfoWindow } from "@/features/overlays/openers/noteInfoWindow";
import { useOpenNoteKnowledgePanel } from "@/features/overlays/openers/noteKnowledgePanel";
import { useNoteIngestStatus } from "../hooks/useNoteIngestStatus";
import { useNoteDelete } from "../hooks/useNoteDelete";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { NoteContextStatusIcon } from "./NoteContextSection";
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { MoveNoteDialog } from "./MoveNoteDialog";

interface NoteTabItemProps {
  noteId: string;
  instanceId: string;
}

const actionBtnClass =
  "flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-colors text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:w-3.5 [&_svg]:h-3.5";

export function NoteTabItem({ noteId, instanceId }: NoteTabItemProps) {
  const dispatch = useAppDispatch();

  // ── Redux state ────────────────────────────────────────────────────
  const label = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";
  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const isSaving = useAppSelector(selectNoteIsSavingById(noteId));
  const isActive = useAppSelector(
    (s) => s.notes?.instances?.[instanceId]?.activeTabId === noteId,
  );
  const content = useAppSelector(selectNoteContent(noteId)) ?? "";
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));
  const allFolders = useAppSelector(selectAllFolders);
  const currentFolder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";

  const openNoteInfo = useOpenNoteInfoWindow();
  const openKnowledge = useOpenNoteKnowledgePanel();
  // Only probe the active tab — avoids a Supabase query per open tab.
  const ingest = useNoteIngestStatus(isActive ? noteId : null);

  // ── Local UI state ─────────────────────────────────────────────────
  const [localLabel, setLocalLabel] = useState(label);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [contentCopied, setContentCopied] = useState(false);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync Redux label → local — NEVER while the user is typing the title.
  // Auto-label (autoSaveMiddleware) and realtime merges land in Redux; if
  // this sync runs mid-typing it clobbers the user's in-progress name (the
  // "system freaks out about naming" bug). While focused, the input buffer
  // is authoritative; blur commits it (handleTitleBlur).
  const [lastSyncedLabel, setLastSyncedLabel] = useState(label);
  if (!titleFocused && label !== lastSyncedLabel) {
    setLastSyncedLabel(label);
    setLocalLabel(label);
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return undefined;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ctxMenu]);

  // ── Handlers ───────────────────────────────────────────────────────
  // Tag the user as actively interacting with the tab strip. Callers wire
  // this into every direct tab action — clicks, renames, drags, modal
  // opens — so the idle-based auto-move stays parked while the user is
  // doing things to tabs.
  const bumpTabInteraction = useCallback(() => {
    dispatch(markTabInteraction({ instanceId }));
  }, [dispatch, instanceId]);

  const handleClick = useCallback(() => {
    bumpTabInteraction();
    if (!isActive) dispatch(setInstanceActiveTab({ instanceId, noteId }));
  }, [bumpTabInteraction, dispatch, instanceId, noteId, isActive]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      bumpTabInteraction();
      dispatch(removeInstanceTab({ instanceId, noteId }));
    },
    [bumpTabInteraction, dispatch, instanceId, noteId],
  );

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalLabel(value);
      bumpTabInteraction();
      if (labelTimerRef.current) clearTimeout(labelTimerRef.current);
      labelTimerRef.current = setTimeout(() => {
        labelTimerRef.current = null;
        // Never push an empty label mid-typing — a cleared input commits
        // (or reverts) on blur, not on the debounce.
        if (!value.trim()) return;
        setLastSyncedLabel(value);
        dispatch(updateNoteLabel({ id: noteId, label: value }));
      }, 500);
    },
    [bumpTabInteraction, dispatch, noteId],
  );

  // Unmount while focused (tab closed mid-rename) must not leave the
  // editing flag stuck — a stuck flag permanently disables auto-label.
  useEffect(() => {
    return () => {
      setNoteLabelEditing(noteId, false);
      if (copiedResetTimerRef.current) clearTimeout(copiedResetTimerRef.current);
    };
  }, [noteId]);

  const handleTitleFocus = useCallback(() => {
    setTitleFocused(true);
    setNoteLabelEditing(noteId, true);
    bumpTabInteraction();
  }, [bumpTabInteraction, noteId]);

  // Blur commits the naming rule: a non-empty entry is saved immediately
  // (flushing the debounce); an emptied input means "changed my mind" —
  // revert to the label already assigned in Redux. Either way, the
  // Redux→local sync re-arms.
  const handleTitleBlur = useCallback(() => {
    setTitleFocused(false);
    setNoteLabelEditing(noteId, false);
    if (labelTimerRef.current) {
      clearTimeout(labelTimerRef.current);
      labelTimerRef.current = null;
    }
    const trimmed = localLabel.trim();
    if (trimmed) {
      setLastSyncedLabel(trimmed);
      if (trimmed !== label) {
        dispatch(updateNoteLabel({ id: noteId, label: trimmed }));
      }
      if (trimmed !== localLabel) setLocalLabel(trimmed);
    } else {
      // Empty on blur → keep the existing (possibly auto-generated) label.
      setLastSyncedLabel(label);
      setLocalLabel(label);
    }
  }, [dispatch, noteId, localLabel, label]);

  const {
    confirmOpen: deleteConfirmOpen,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useNoteDelete({ instanceId, noteId, noteLabel: label, content });

  // Keep the "tab-interaction" timestamp warm while any tab-direct
  // popover or modal is open. This prevents the idle-based auto-move
  // from kicking in while the user is mid-rename, mid-share, choosing
  // a folder, etc. — even if they linger on the dialog without
  // touching anything else.
  const anyTabUiOpen =
    !!ctxMenu ||
    shareOpen ||
    moveDialogOpen ||
    deleteConfirmOpen ||
    titleFocused;
  useEffect(() => {
    if (!anyTabUiOpen) return undefined;
    dispatch(markTabInteraction({ instanceId }));
    const id = setInterval(() => {
      dispatch(markTabInteraction({ instanceId }));
    }, 1000);
    return () => clearInterval(id);
  }, [anyTabUiOpen, dispatch, instanceId]);

  const handleExport = useCallback(() => {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label || "note"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Markdown download started");
  }, [content, label]);

  const handleSave = useCallback(async () => {
    const result = await dispatch(saveNote(noteId));
    if (saveNote.rejected.match(result)) {
      toast.error("Failed to save note");
      return;
    }
    toast.success("Note saved");
  }, [dispatch, noteId]);

  const handleCopyContent = useCallback(() => {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setContentCopied(true);
        if (copiedResetTimerRef.current) clearTimeout(copiedResetTimerRef.current);
        copiedResetTimerRef.current = setTimeout(
          () => setContentCopied(false),
          1200,
        );
        toast.success("Note content copied");
      })
      .catch(() => toast.error("Failed to copy note content"));
  }, [content]);

  const handleDuplicate = useCallback(async () => {
    const result = await dispatch(copyNote(noteId));
    if (copyNote.rejected.match(result)) {
      toast.error("Failed to duplicate note");
      return;
    }
    toast.success("Note duplicated");
  }, [dispatch, noteId]);

  const handleTranscription = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      const sep = content.length > 0 ? "\n\n" : "";
      dispatch(
        updateNoteContent({ id: noteId, content: content + sep + text }),
      );
    },
    [dispatch, noteId, content],
  );

  const handleCloseOtherTabs = useCallback(() => {
    if (!openTabs) return;
    bumpTabInteraction();
    for (const tabId of openTabs) {
      if (tabId !== noteId) {
        dispatch(removeInstanceTab({ instanceId, noteId: tabId }));
      }
    }
  }, [bumpTabInteraction, dispatch, instanceId, noteId, openTabs]);

  const handleCloseAllTabs = useCallback(() => {
    if (!openTabs) return;
    bumpTabInteraction();
    for (const tabId of openTabs) {
      dispatch(removeInstanceTab({ instanceId, noteId: tabId }));
    }
  }, [bumpTabInteraction, dispatch, instanceId, openTabs]);

  // Copy a live record reference (the "bookmark") to the clipboard — same fence
  // ReferenceCopyButton produces, now reachable from the "…" menu.
  const copyReference = useCallback(() => {
    navigator.clipboard
      .writeText(buildRecordReferenceFence({ type: "note", id: noteId, label }))
      .then(() => toast.success("Reference copied", { description: label }))
      .catch(() => toast.error("Failed to copy reference"));
  }, [noteId, label]);

  const handleMoveToFolder = useCallback(
    async (folder: string) => {
      bumpTabInteraction();
      await dispatch(moveNoteToFolder({ noteId, folder })).unwrap();
      toast.success(`Moved to ${folder}`);
    },
    [bumpTabInteraction, dispatch, noteId],
  );

  // Secondary actions — the single source for BOTH the "…" dropdown and the
  // right-click menu, so they never drift. Primary actions (copy content,
  // share, context, mic) live inline on the tab.
  type TabMenuItem = {
    icon: React.ReactNode;
    label: string;
    fn: () => void;
    destructive?: boolean;
  };
  const menuItems: (TabMenuItem | null)[] = [
    {
      icon: <Save className="w-3.5 h-3.5" />,
      label: isSaving ? "Saving…" : "Save",
      fn: () => void handleSave(),
    },
    {
      icon: <Bookmark className="w-3.5 h-3.5" />,
      label: "Copy reference",
      fn: copyReference,
    },
    {
      icon: <CopyPlus className="w-3.5 h-3.5" />,
      label: "Duplicate note",
      fn: () => void handleDuplicate(),
    },
    {
      icon: <FolderInput className="w-3.5 h-3.5" />,
      label: "Move to folder…",
      fn: () => {
        bumpTabInteraction();
        setMoveDialogOpen(true);
      },
    },
    {
      icon: <Info className="w-3.5 h-3.5" />,
      label: "About this note",
      fn: () => openNoteInfo({ noteId, title: label }),
    },
    {
      icon: (
        <span className="relative inline-flex">
          <Database className="w-3.5 h-3.5" />
          {ingest.state === "ingested" && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
          )}
        </span>
      ),
      label:
        ingest.state === "ingested"
          ? "Knowledge base"
          : "Add to knowledge base",
      fn: () => openKnowledge({ noteId, title: label }),
    },
    {
      icon: <Download className="w-3.5 h-3.5" />,
      label: "Export as Markdown",
      fn: handleExport,
    },
    null,
    {
      icon: <X className="w-3.5 h-3.5" />,
      label: "Close tab",
      fn: () => dispatch(removeInstanceTab({ instanceId, noteId })),
    },
    {
      icon: <X className="w-3.5 h-3.5" />,
      label: "Close other tabs",
      fn: handleCloseOtherTabs,
    },
    {
      icon: <X className="w-3.5 h-3.5" />,
      label: "Close all tabs",
      fn: handleCloseAllTabs,
    },
    null,
    {
      icon: <Trash2 className="w-3.5 h-3.5" />,
      label: "Delete note",
      fn: requestDelete,
      destructive: true,
    },
  ];

  return (
    <>
      <div
        draggable
        onDragStart={(e) => {
          bumpTabInteraction();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", noteId);
        }}
        className={cn(
          "group flex items-center gap-0 h-8 px-[6px] text-[0.6875rem] font-medium whitespace-nowrap min-w-0 shrink-0 transition-colors",
          isActive
            ? "max-w-[340px] bg-accent/60 text-foreground"
            : "max-w-[160px] bg-transparent text-muted-foreground hover:bg-accent/30 cursor-pointer",
        )}
        role="tab"
        data-active={isActive ? "true" : undefined}
        aria-selected={isActive}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          bumpTabInteraction();
          setCtxMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mr-1" />
        )}

        {isActive ? (
          <input
            className="bg-transparent outline-none border-none min-w-0 w-full text-[0.6875rem] font-medium text-foreground truncate cursor-text"
            value={localLabel}
            onChange={handleTitleChange}
            onClick={(e) => {
              e.stopPropagation();
              bumpTabInteraction();
            }}
            onFocus={handleTitleFocus}
            onBlur={handleTitleBlur}
            aria-label="Note title"
            spellCheck={false}
          />
        ) : (
          <span className="overflow-hidden text-ellipsis">{label}</span>
        )}

        {/* Active tab action buttons: copy | share | context | mic | … */}
        {isActive && (
          <div
            className="flex items-center gap-px shrink-0 ml-1"
            onClick={(e) => {
              e.stopPropagation();
              bumpTabInteraction();
            }}
          >
            <button
              className={actionBtnClass}
              onClick={handleCopyContent}
              title="Copy content"
              aria-label="Copy note content"
            >
              {contentCopied ? <Check className="text-green-500" /> : <Copy />}
            </button>
            <button
              className={actionBtnClass}
              onClick={() => setShareOpen(true)}
              title="Share note"
            >
              <Share2 />
            </button>
            {/* Context shortcut — amber = no context yet (nudge), green = set.
                Same picker + same save behavior as the note-footer panel.
                Already sized/shaped to match the other action buttons. */}
            <NoteContextStatusIcon noteId={noteId} />
            <MicrophoneIconButton
              onTranscriptionComplete={handleTranscription}
              variant="icon-only"
              size="sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={actionBtnClass} title="More actions">
                  <MoreHorizontal />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[190px]">
                {menuItems.map((item, i) =>
                  item === null ? (
                    <DropdownMenuSeparator key={`sep-${i}`} />
                  ) : (
                    <DropdownMenuItem
                      key={item.label}
                      onSelect={() => item.fn()}
                      className={cn(
                        "gap-2 text-xs",
                        item.destructive &&
                          "text-destructive focus:text-destructive",
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </DropdownMenuItem>
                  ),
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Close button */}
        <span
          className="notes-tab-close-btn flex items-center justify-center w-4 h-4 rounded-sm text-muted-foreground shrink-0 hover:bg-accent hover:text-foreground ml-1"
          role="button"
          aria-label={`Close ${label}`}
          onClick={handleClose}
        >
          <X className="w-2.5 h-2.5" />
        </span>
      </div>

      {/* Right-click context menu */}
      {ctxMenu && (
        <>
          <div
            className="fixed inset-0 z-[110]"
            onClick={() => setCtxMenu(null)}
          />
          <div
            ref={menuRef}
            className="fixed z-[120] min-w-[160px] py-1 bg-card/95 backdrop-blur-2xl border border-border rounded-lg shadow-lg"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            {menuItems.map((item, i) =>
              item === null ? (
                <div key={`sep-${i}`} className="h-px bg-border/50 my-1" />
              ) : (
                <button
                  key={item.label}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors cursor-pointer",
                    item.destructive
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-foreground hover:bg-accent",
                  )}
                  onClick={() => {
                    item.fn();
                    setCtxMenu(null);
                  }}
                >
                  {item.icon} {item.label}
                </button>
              ),
            )}
          </div>
        </>
      )}

      {/* Share modal */}
      <NoteShareModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        noteId={noteId}
        noteLabel={label}
      />

      <MoveNoteDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        onConfirm={handleMoveToFolder}
        noteName={label}
        currentFolder={currentFolder}
        availableFolders={allFolders}
      />

      {/* Delete confirmation — overlay and content must exceed window panel z-index (~1000) */}
      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          if (!open) cancelDelete();
        }}
      >
        <AlertDialogPortal>
          <AlertDialogOverlay className="z-[10000]" />
          <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10001] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background shadow-lg p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete note?</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{label}&rdquo; will be moved to trash. You can restore it
                later.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogPrimitive.Content>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  );
}
