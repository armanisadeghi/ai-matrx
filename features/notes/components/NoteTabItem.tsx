"use client";

// Layer 3: NoteTabItem — Full-featured VSCode-style tab.
// Matches ALL SSR workspace tab features:
// - Editable title on active tab (debounced save)
// - Dirty indicator (amber dot)
// - Active tab: single ⋯ overflow menu (Save, Copy, Share, Folder, Context, Dictate, Delete)
// - Close button on all tabs
// - Right-click context menu
// - DnD reordering
// Props: noteId + instanceId only. Everything from Redux.

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Save,
  Copy,
  CopyPlus,
  Share2,
  FolderInput,
  Trash2,
  X,
  Download,
  Link2,
  Network,
  MoreHorizontal,
} from "lucide-react";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setInstanceActiveTab,
  removeInstanceTab,
  updateNoteLabel,
  updateNoteContent,
  updateNoteFolder,
  markTabInteraction,
} from "../redux/slice";
import {
  selectNoteLabel,
  selectNoteIsDirtyById,
  selectNoteIsSavingById,
  selectNoteFolder,
  selectAllFolders,
  selectNoteContent,
  selectInstanceTabs,
} from "../redux/selectors";
import { saveNote, copyNote, deleteNote } from "../redux/thunks";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { NoteContextPicker } from "./NoteContextPicker";
import { useNoteDelete } from "../hooks/useNoteDelete";
import { useIsOwner } from "@/utils/permissions";
import { cn } from "@/lib/utils";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
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

interface NoteTabItemProps {
  noteId: string;
  instanceId: string;
}

const actionBtnClass =
  "flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-colors text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:w-3.5 [&_svg]:h-3.5";

const menuItemClass =
  "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors cursor-pointer text-foreground hover:bg-accent";

export function NoteTabItem({ noteId, instanceId }: NoteTabItemProps) {
  const dispatch = useAppDispatch();

  const { isOwner } = useIsOwner("note", noteId);

  // ── Redux state ────────────────────────────────────────────────────
  const label = useAppSelector(selectNoteLabel(noteId)) ?? "Untitled";
  const isDirty = useAppSelector(selectNoteIsDirtyById(noteId));
  const isSaving = useAppSelector(selectNoteIsSavingById(noteId));
  const isActive = useAppSelector(
    (s) => s.notes?.instances?.[instanceId]?.activeTabId === noteId,
  );
  const currentFolder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const allFolders = useAppSelector(selectAllFolders);
  const content = useAppSelector(selectNoteContent(noteId)) ?? "";
  const openTabs = useAppSelector(selectInstanceTabs(instanceId));

  // ── Local UI state ─────────────────────────────────────────────────
  const [localLabel, setLocalLabel] = useState(label);
  const [showFolderDrop, setShowFolderDrop] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [overflowMenuPos, setOverflowMenuPos] = useState<{ right: number; top: number } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Sync Redux label → local
  const lastLabelRef = useRef(label);
  if (label !== lastLabelRef.current) {
    lastLabelRef.current = label;
    setLocalLabel(label);
  }

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
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
        lastLabelRef.current = value;
        dispatch(updateNoteLabel({ id: noteId, label: value }));
      }, 500);
    },
    [bumpTabInteraction, dispatch, noteId],
  );

  const {
    confirmOpen: deleteConfirmOpen,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useNoteDelete({ instanceId, noteId, noteLabel: label });

  // Keep the "tab-interaction" timestamp warm while any tab-direct
  // popover or modal is open. This prevents the idle-based auto-move
  // from kicking in while the user is mid-rename, mid-share, choosing
  // a folder, etc. — even if they linger on the dialog without
  // touching anything else.
  const anyTabUiOpen =
    !!ctxMenu ||
    !!overflowMenuPos ||
    showFolderDrop ||
    contextOpen ||
    shareOpen ||
    deleteConfirmOpen ||
    titleFocused;
  useEffect(() => {
    if (!anyTabUiOpen) return;
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
  }, [content, label]);

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
          "group flex items-center gap-0 px-[6px] text-[0.6875rem] font-medium whitespace-nowrap min-w-0 shrink-0 transition-colors",
          isActive
            ? "max-w-[340px] bg-accent/60 text-foreground"
            : "max-w-[160px] bg-transparent text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/30 cursor-pointer",
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
            onFocus={() => {
              setTitleFocused(true);
              bumpTabInteraction();
            }}
            onBlur={() => setTitleFocused(false)}
            aria-label="Note title"
            spellCheck={false}
          />
        ) : (
          <span className="overflow-hidden text-ellipsis">{label}</span>
        )}

        {/* Active tab: single overflow menu button */}
        {isActive && (
          <div
            className="flex items-center gap-px shrink-0 ml-1"
            onClick={(e) => {
              e.stopPropagation();
              bumpTabInteraction();
            }}
          >
            <button
              className={cn(actionBtnClass, !!overflowMenuPos && "text-primary bg-accent")}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setOverflowMenuPos((v) =>
                  v ? null : { right: window.innerWidth - rect.right, top: rect.bottom + 4 },
                );
              }}
              title="More actions"
            >
              <MoreHorizontal />
            </button>
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

      {/* Folder dropdown */}
      {showFolderDrop && isActive && (
        <div className="absolute z-50 mt-1 min-w-[120px] max-h-[200px] overflow-auto py-1 bg-card/95 backdrop-blur-2xl border border-border rounded-lg shadow-lg">
          {allFolders.map((f) => (
            <button
              key={f}
              className={cn(
                "w-full text-left px-3 py-1.5 text-[0.625rem] cursor-pointer transition-colors",
                f === currentFolder
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-accent",
              )}
              onClick={() => {
                dispatch(updateNoteFolder({ id: noteId, folder: f }));
                setShowFolderDrop(false);
              }}
            >
              {f}
            </button>
          ))}
        </div>
      )}

      {/* Context picker dropdown */}
      {contextOpen && isActive && (
        <>
          <div
            className="fixed inset-0 z-[100]"
            onClick={() => setContextOpen(false)}
          />
          <div className="absolute right-0 z-[110] mt-1 w-[260px] py-1 bg-card/95 backdrop-blur-2xl border border-border rounded-lg shadow-lg">
            <NoteContextPicker noteId={noteId} />
          </div>
        </>
      )}

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
            {[
              {
                icon: <Save className="w-3 h-3" />,
                label: "Save",
                fn: () => dispatch(saveNote(noteId)),
              },
              {
                icon: <Copy className="w-3 h-3" />,
                label: "Copy Content",
                fn: () =>
                  navigator.clipboard.writeText(content).catch(() => {}),
              },
              {
                icon: <CopyPlus className="w-3 h-3" />,
                label: "Duplicate Note",
                fn: () => dispatch(copyNote(noteId)),
              },
              {
                icon: <Link2 className="w-3 h-3" />,
                label: "Share Link",
                fn: () => setShareOpen(true),
              },
              {
                icon: <Download className="w-3 h-3" />,
                label: "Export as Markdown",
                fn: handleExport,
              },
              null,
              {
                icon: <X className="w-3 h-3" />,
                label: "Close Tab",
                fn: () => dispatch(removeInstanceTab({ instanceId, noteId })),
              },
              {
                icon: <X className="w-3 h-3" />,
                label: "Close Other Tabs",
                fn: handleCloseOtherTabs,
              },
              {
                icon: <X className="w-3 h-3" />,
                label: "Close All Tabs",
                fn: handleCloseAllTabs,
              },
              null,
              {
                icon: <Trash2 className="w-3 h-3" />,
                label: "Delete Note",
                fn: requestDelete,
                destructive: true,
              },
            ].map((item, i) =>
              item === null ? (
                <div key={`sep-${i}`} className="h-px bg-border/50 my-1" />
              ) : (
                <button
                  key={item.label}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors cursor-pointer",
                    (item as any).destructive
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

      {/* Overflow (⋯) menu */}
      {overflowMenuPos && isActive && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setOverflowMenuPos(null)} />
          <div
            className="fixed z-[120] min-w-[180px] py-1 bg-card/95 backdrop-blur-2xl border border-border rounded-lg shadow-lg"
            style={{ right: overflowMenuPos.right, top: overflowMenuPos.top }}
          >
            <div className="px-3 py-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Actions
            </div>
            <button
              className={cn(menuItemClass, (isDirty || isSaving) && "text-amber-500")}
              onClick={() => { dispatch(saveNote(noteId)); setOverflowMenuPos(null); }}
            >
              <Save className="w-3 h-3 shrink-0" /> Save
              <span className="ml-auto text-[0.625rem] text-muted-foreground/60">Ctrl+S</span>
            </button>
            <button
              className={menuItemClass}
              onClick={() => { navigator.clipboard.writeText(content).catch(() => {}); setOverflowMenuPos(null); }}
            >
              <Copy className="w-3 h-3 shrink-0" /> Copy Content
            </button>
            <button
              className={menuItemClass}
              onClick={() => { setShareOpen(true); setOverflowMenuPos(null); }}
            >
              <Share2 className="w-3 h-3 shrink-0" /> Share
            </button>
            <button
              className={menuItemClass}
              onClick={() => { setShowFolderDrop((v) => !v); setOverflowMenuPos(null); }}
            >
              <FolderInput className="w-3 h-3 shrink-0" /> Move to Folder
            </button>
            <button
              className={cn(menuItemClass, contextOpen && "text-primary")}
              onClick={() => { setContextOpen((v) => !v); setOverflowMenuPos(null); }}
            >
              <Network className="w-3 h-3 shrink-0" /> Set Context
            </button>
            <div className={menuItemClass}>
              <MicrophoneIconButton
                onTranscriptionComplete={(text) => { handleTranscription(text); setOverflowMenuPos(null); }}
                variant="icon-only"
                size="sm"
              />
              <span>Dictate</span>
            </div>
            <div className="h-px bg-border/50 my-1" />
            <div className="px-3 py-1 text-[0.5625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Danger
            </div>
            <button
              className={cn(menuItemClass, "text-destructive hover:bg-destructive/10")}
              onClick={() => { requestDelete(); setOverflowMenuPos(null); }}
            >
              <Trash2 className="w-3 h-3 shrink-0" /> Delete Note
            </button>
          </div>
        </>
      )}

      {/* Share modal */}
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceType="note"
        resourceId={noteId}
        resourceName={label}
        isOwner={isOwner}
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
          <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[10001] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 matrx-glass-core p-6 duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
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
