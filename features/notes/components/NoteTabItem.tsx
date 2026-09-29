"use client";

// Layer 3: NoteTabItem — Full-featured VSCode-style tab.
// Matches ALL SSR workspace tab features:
// - Editable title on active tab (debounced save)
// - Dirty indicator (amber dot)
// - Active tab action buttons: Save, Duplicate, Share, Info, Delete, Voice
//   (Info opens the Note Info window — note metadata + context + folder)
// - Close button on all tabs
// - Right-click context menu — the universal v3 menu (NonEditableContextMenu)
//   with the tab's own actions riding along as ONE "Tab" extraSections group.
//   Same source array feeds the "…" dropdown, so the two never drift.
// - DnD reordering
// Props: noteId + instanceId only. Everything from Redux.

import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  Save,
  Copy,
  X,
  Info,
  MoreHorizontal,
  PanelTop,
  Pin,
  PinOff,
  ArrowLeft,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  setInstanceActiveTab,
  removeInstanceTab,
  updateNoteLabel,
  updateNoteContent,
  markTabInteraction,
  setInstanceHistoryOpen,
  toggleInstanceTabPinned,
  moveInstanceTab,
} from "../redux/slice";
import { setNoteLabelEditing } from "../utils/labelEditing";
import {
  selectNoteLabel,
  selectNoteIsDirtyById,
  selectNoteIsSavingById,
  selectNoteContent,
  selectInstanceTabs,
  selectInstancePinnedTabs,
  selectAllFolders,
  selectFolderReferences,
  selectNoteFolder,
  selectNoteById,
} from "../redux/selectors";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import {
  CONTEXT_MENU_HEADING_KEY,
  type ContextMenuExtraItem,
  type ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import type { ContentSource } from "@/features/rich-document/types";
import { NOTES_EDITOR_CONTEXT_MENU_PROPS } from "@/features/notes/agent-context/buildNotesEditorContextData";
import { useNotesSurfaceScope } from "../hooks/useNotesSurfaceScope";
import { useNoteEditorMode } from "../hooks/usePreferredDefaultEditorMode";
import { saveNote, copyNote, moveNoteToFolder, moveNoteToNewFolder } from "../redux/thunks";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { useOpenNoteInfoWindow } from "@/features/overlays/openers/noteInfoWindow";
import { useOpenNoteKnowledgePanel } from "@/features/overlays/openers/noteKnowledgePanel";
import { useNoteIngestStatus } from "../hooks/useNoteIngestStatus";
import { useNoteDelete } from "../hooks/useNoteDelete";
import { cn } from "@/lib/utils";
import { toast, toastErrorAlreadyCaptured } from "@/lib/toast";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { openContextMenuForElement } from "@/features/context-menu-v3/utils/open-context-menu";
import { openRecordMenu, registerRecordMenu, type RecordMenuRows } from "@/features/context-menu-v3/record-menu-registry";
import { noteActionsSection, openNotePrintStudio } from "./note-actions/noteActionSet";
import { noteTabRecordMenuKey } from "./noteRecordMenu";
import { MoveNoteDialog } from "./MoveNoteDialog";
import { noteFolderReference, type FolderReference } from "../types";
import { noteIdentityContentSource } from "../richDocumentSource";

interface NoteTabItemProps {
  noteId: string;
  instanceId: string;
  standalone?: boolean;
}

const actionBtnClass =
  "flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-colors text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:w-3.5 [&_svg]:h-3.5";

export function NoteTabItem({ noteId, instanceId, standalone = false }: NoteTabItemProps) {
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
  const pinnedTabs = useAppSelector(selectInstancePinnedTabs(instanceId));
  const isPinned = pinnedTabs.includes(noteId);
  const allFolders = useAppSelector(selectAllFolders);
  const folderReferences = useAppSelector(selectFolderReferences);
  const currentFolder = useAppSelector(selectNoteFolder(noteId)) ?? "Draft";
  const note = useAppSelector(selectNoteById(noteId));

  const openNoteInfo = useOpenNoteInfoWindow();
  const openKnowledge = useOpenNoteKnowledgePanel();
  // Only probe the active tab — avoids a Supabase query per open tab.
  const ingest = useNoteIngestStatus(isActive ? noteId : null);

  // ── Local UI state ─────────────────────────────────────────────────
  const [localLabel, setLocalLabel] = useState(label);
  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [titleFocused, setTitleFocused] = useState(false);
  // Edit INTENT, not focus: right-click also focuses the input, and a focused
  // live input makes the v3 menu yield to the native one — so readOnly must
  // survive focus and lift only on a left click (or Enter) in the field.
  const [titleEditing, setTitleEditing] = useState(false);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [contentCopied, setContentCopied] = useState(false);
  const labelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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
      if (copiedResetTimerRef.current)
        clearTimeout(copiedResetTimerRef.current);
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
    setTitleEditing(false);
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

  // The delete confirmation is NOT rendered here — `requestDelete` opens the
  // canonical package confirm (see useNoteDelete). `deleteConfirmOpen` is read
  // only to keep the tab-interaction timestamp warm while the user decides.
  const { confirmOpen: deleteConfirmOpen, requestDelete } = useNoteDelete({
    instanceId,
    noteId,
    noteLabel: label,
    content,
  });

  // Keep the "tab-interaction" timestamp warm while any tab-direct
  // popover or modal is open. This prevents the idle-based auto-move
  // from kicking in while the user is mid-rename, mid-share, choosing
  // a folder, etc. — even if they linger on the dialog without
  // touching anything else.
  const anyTabUiOpen =
    tabMenuOpen ||
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
    // Honest: a Save with nothing to save says so and writes nothing.
    if (!isDirty) {
      toast.info("No changes to save");
      return;
    }
    const result = await dispatch(saveNote(noteId));
    if (saveNote.rejected.match(result)) {
      // `saveNote` owns failure classification/capture. This is only the
      // tab-action acknowledgement; recapturing it would file a second,
      // context-free system_error for the same failed write.
      toastErrorAlreadyCaptured("Failed to save note");
      return;
    }
    toast.success("Note saved");
  }, [dispatch, isDirty, noteId]);

  const handleCopyContent = useCallback(() => {
    navigator.clipboard
      .writeText(content)
      .then(() => {
        setContentCopied(true);
        if (copiedResetTimerRef.current)
          clearTimeout(copiedResetTimerRef.current);
        copiedResetTimerRef.current = setTimeout(
          () => setContentCopied(false),
          1200,
        );
        toast.success("Note content copied");
      })
      .catch(() => toast.error("Failed to copy note content"));
  }, [content]);

  const handleDuplicate = useCallback(async () => {
    const result = await dispatch(copyNote({ noteId, instanceId }));
    if (copyNote.rejected.match(result)) {
      toast.error("Failed to duplicate note");
      return;
    }
    toast.success("Note duplicated");
  }, [dispatch, instanceId, noteId]);

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
    // Pinned tabs stay (the point of pinning).
    for (const tabId of openTabs) {
      if (tabId !== noteId && !pinnedTabs.includes(tabId)) {
        dispatch(removeInstanceTab({ instanceId, noteId: tabId }));
      }
    }
  }, [bumpTabInteraction, dispatch, instanceId, noteId, openTabs, pinnedTabs]);

  const handleCloseAllTabs = useCallback(() => {
    if (!openTabs) return;
    bumpTabInteraction();
    for (const tabId of openTabs) {
      if (!pinnedTabs.includes(tabId)) dispatch(removeInstanceTab({ instanceId, noteId: tabId }));
    }
  }, [bumpTabInteraction, dispatch, instanceId, openTabs, pinnedTabs]);

  // Copy a live record reference (the "bookmark") to the clipboard — same fence
  // ReferenceCopyButton produces, now reachable from the "…" menu.
  const copyReference = useCallback(() => {
    navigator.clipboard
      .writeText(buildRecordReferenceFence({ type: "note", id: noteId, label }))
      .then(() => toast.success("Reference copied", { description: label }))
      .catch(() => toast.error("Failed to copy reference"));
  }, [noteId, label]);

  const handleMoveToFolder = useCallback(
    async (folder: FolderReference) => {
      bumpTabInteraction();
      await dispatch(moveNoteToFolder({ noteId, folder })).unwrap();
      toast.success(`Moved to ${folder.name}`);
    },
    [bumpTabInteraction, dispatch, noteId],
  );

  const handleCreateFolder = useCallback(
    async (folder: string) => {
      bumpTabInteraction();
      await dispatch(moveNoteToNewFolder({ noteId, folderName: folder })).unwrap();
      toast.success(`Moved to ${folder}`);
    },
    [bumpTabInteraction, dispatch, noteId],
  );

  // ── Universal v3 context-menu scope ────────────────────────────────
  // Same surface + scope shape as the editor wiring (NoteContentEditor):
  // `matrx-user/notes` with the full manifest scope built at open time for
  // THIS tab's note. The tab has no textarea — a permanently-null ref keeps
  // the selection fields empty, which is correct for a tab strip.
  const editorMode = useNoteEditorMode(noteId);
  const noteRecord = useAppSelector(selectNoteById(noteId));
  const noTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  // The "…" button opens the tab's universal v3 menu ON this element.
  const tabRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const buildSurfaceScope = useNotesSurfaceScope({
    instanceId,
    noteId,
    content,
    textareaRef: noTextareaRef,
    editorMode,
  });
  const getApplicationScope = useCallback(() => {
    const scope = buildApplicationScopeFromMenuContext({
      selectedText: "",
      selectionRange: null,
      contextData: buildSurfaceScope() as Record<string, unknown>,
    });
    // The notes builder deliberately leaves the `content` baseline empty for
    // persisted notes (the body rides in `current_note`; on the EDITOR the
    // textarea-value fallback fills `content`). A tab has no field and its
    // title is an <input> (invisible to the DOM-text fallback), so without
    // this the menu resolves NO content — Copy / Copy-as / Export / Convert
    // all go dead on the tab. Fill the baseline from the same store read.
    if (!scope.content) scope.content = content;
    return scope;
  }, [buildSurfaceScope, content]);

  // Secondary actions — the "Tab" section of the universal v3 menu, which
  // both right-click and the "…" button open (one menu, so they never
  // drift). Only the mic lives inline on the tab.
  type TabMenuItem = {
    id: string;
    icon: LucideIcon;
    label: string;
    fn: () => void;
    destructive?: boolean;
    /** Greyed WITH this reason (absent-or-honest). */
    disabledReason?: string;
  };
  // The tab's own rows: things about THIS TAB and the editor buffer. The
  // note's actions are the ONE shared set (noteActionSet.ts) — the same rows,
  // names and order in every view's right-click, the "…" and the phone sheet.
  // The note's buffer rows (Save, Copy note text) — about the NOTE, so they
  // sit with the note's rows, never in the Tab section.
  const bufferItems: TabMenuItem[] = [
    // Read has nothing to save (and the registry's own "Save" submenu is
    // there); elsewhere Save is greyed with its reason when nothing changed.
    ...(editorMode === "preview"
      ? []
      : [
          {
            id: "save",
            icon: Save,
            label: isSaving ? "Saving…" : "Save",
            fn: () => void handleSave(),
            ...(!isDirty && !isSaving ? { disabledReason: "No changes to save" } : {}),
          },
        ]),
    {
      id: "copy-content",
      icon: Copy,
      label: "Copy note text",
      fn: handleCopyContent,
    },
  ];
  // TAB ACTIONS — Pin, Move, Close (Arman's ruling 2026-09-28: the tab's "…"
  // is the tab's rows plus one "Note ▸" holding the full note menu).
  const tabIndex = openTabs?.indexOf(noteId) ?? -1;
  const neighbour = (d: -1 | 1) => (openTabs && tabIndex >= 0 ? openTabs[tabIndex + d] : undefined);
  // Absent, never dead: a move that can't happen (edge, or across the pinned block) isn't offered.
  const canMove = (d: -1 | 1) => {
    const other = neighbour(d);
    return other !== undefined && pinnedTabs.includes(other) === isPinned;
  };
  const move = (direction: -1 | 1) => {
    bumpTabInteraction();
    dispatch(moveInstanceTab({ instanceId, noteId, direction }));
  };
  const menuItems: (TabMenuItem | null)[] = [
    ...(standalone ? [] : [
    {
      id: "pin-tab",
      icon: isPinned ? PinOff : Pin,
      label: isPinned ? "Unpin tab" : "Pin tab",
      fn: () => {
        bumpTabInteraction();
        dispatch(toggleInstanceTabPinned({ instanceId, noteId }));
      },
    },
    canMove(-1) ? { id: "move-left", icon: ArrowLeft, label: "Move tab left", fn: () => move(-1) } : null,
    canMove(1) ? { id: "move-right", icon: ArrowRight, label: "Move tab right", fn: () => move(1) } : null,
    null,
    {
      id: "close-tab",
      icon: X,
      label: "Close tab",
      fn: () => dispatch(removeInstanceTab({ instanceId, noteId })),
    },
    {
      id: "close-others",
      icon: X,
      label: "Close other tabs",
      fn: handleCloseOtherTabs,
    },
    {
      id: "close-all",
      icon: X,
      label: "Close all tabs",
      fn: handleCloseAllTabs,
    },
    ]),
  ];

  const tabExtraSections: ContextMenuExtraSection[] = [
    noteActionsSection({
      rename: () => {
        bumpTabInteraction();
        setTitleEditing(true);
      },
      duplicate: () => void handleDuplicate(),
      moveToFolder: () => {
        bumpTabInteraction();
        setMoveDialogOpen(true);
      },
      knowledge: () => openKnowledge({ noteId, title: label }),
      knowledgeIndexed: ingest.state === "ingested",
      exportMarkdown: handleExport,
      print: () => openNotePrintStudio(noteId),
      versionHistory: () => dispatch(setInstanceHistoryOpen({ instanceId, open: true })),
      share: () => setShareOpen(true),
      copyReference,
      about: () => openNoteInfo({ noteId, title: label }),
      moveToTrash: requestDelete,
    }),
    {
      id: "note-buffer",
      anchor: "after-compare",
      items: bufferItems.map((item): ContextMenuExtraItem => ({
        kind: "item",
        id: item.id,
        label: item.label,
        icon: item.icon,
        onSelect: item.fn,
        ...(item.disabledReason ? { disabled: true, description: item.disabledReason } : {}),
      })),
    },
    ...(standalone ? [] : [tabSection(false)]),
  ];
  function tabSection(primary: boolean): ContextMenuExtraSection {
    return {
      id: "note-tab",
      label: "Tab",
      icon: PanelTop,
      anchor: "after-compare",
      ...(primary ? { primary: true } : {}),
      items: menuItems.map((item, i): ContextMenuExtraItem =>
        item === null
          ? { kind: "separator", id: `tab-sep-${i}` }
          : {
              kind: "item",
              id: item.id,
              label: item.label,
              icon: item.icon,
              destructive: item.destructive,
              onSelect: item.fn,
            },
      ),
    };
  }
  // The tab's "…": the Tab rows first (primary), and the whole note menu —
  // the same rows a right-click on the note shows — under one "Note ▸".
  // Inside "Note ▸" the note's own rows need no second "Note" heading (a
  // labelled section folds under its label — it would read Note ▸ Note ▸).
  const tabButtonSections: ContextMenuExtraSection[] = [
    ...tabExtraSections
      .filter((section) => section.id !== "note-tab")
      .map((section) => (section.id === "note-actions" ? { ...section, label: undefined } : section)),
    ...(standalone ? [] : [tabSection(true)]),
  ];

  // ONE MENU FOR THE NOTE (R26, ALC-15 round 5). The tab's ⋯ and a right-click
  // on the note's content target the same thing — the note — and measured two
  // menus (27 rows vs 25). The tab's rows and entity are registered for the
  // note's content (NoteContentEditor marks its root with this key), and the
  // ⋯ — like a right-click on the active tab — opens the CONTENT's menu, which
  // now carries them. A tab whose note is not on screen keeps its own menu.
  const recordMenuKey = noteTabRecordMenuKey(instanceId, noteId);
  // The menu opened on the note's content is headed with the note's NAME in
  // every view (not "Content:" plus the body's first words).
  const recordRows = useRef<RecordMenuRows>({
    entity: { type: "note" as const, id: noteId, title: label, resourceType: "note" as const },
    extraSections: tabExtraSections,
    heading: { label: "Note", text: label || "Untitled note" },
  });
  // eslint-disable-next-line react-hooks/refs -- external menu registry needs current rows during this render.
  recordRows.current = {
    entity: { type: "note" as const, id: noteId, title: label, resourceType: "note" as const },
    extraSections: tabExtraSections,
    heading: { label: "Note", text: label || "Untitled note" },
  };
  useEffect(
    () => registerRecordMenu(recordMenuKey, () => recordRows.current),
    [recordMenuKey],
  );
  const openNoteMenu = (anchor: HTMLElement): boolean =>
    isActive && openRecordMenu(recordMenuKey, anchor);

  return (
    <>
      {/* Universal v3 right-click menu — asChild merges onto the tab div (no
          extra DOM box, tab-strip layout untouched). contentSource lights up
          Copy-as / Export / Convert; entity lights up Attach To + Share; the
          tab's own actions ride along as the "Tab" section. */}
      <NonEditableContextMenu
        sourceFeature={NOTES_EDITOR_CONTEXT_MENU_PROPS.sourceFeature}
        surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
        getApplicationScope={getApplicationScope}
        contentSource={noteIdentityContentSource(noteId, `tab:${instanceId}:${noteId}`)}
        entity={{
          type: "note",
          id: noteId,
          title: label,
          resourceType: "note",
        }}
        extraSections={tabExtraSections}
        onMenuOpenChange={(open) => {
          setTabMenuOpen(open);
          if (open) bumpTabInteraction();
        }}
      >
        <div
          ref={tabRef}
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
          // The active tab IS the note on screen: its right-click opens the
          // note's one menu (the content's), not a second one — unless the
          // title is being renamed, where the native text menu stands.
          onMouseDownCapture={(e) => {
            if (e.button === 2 && isActive && !titleEditing) e.stopPropagation();
          }}
          onContextMenuCapture={(e) => {
            if (titleEditing || !tabRef.current) return;
            // The "…" has its own menu (tab rows + "Note ▸"): let it open.
            if ((e.target as HTMLElement | null)?.closest?.("[data-note-tab-more]")) return;
            if (openNoteMenu(tabRef.current)) {
              e.preventDefault();
              e.stopPropagation();
              bumpTabInteraction();
            }
          }}
        >
          {isDirty && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mr-1" />
          )}
          {isPinned && (
            <Pin className="w-2.5 h-2.5 shrink-0 mr-1 text-muted-foreground" aria-label="Pinned tab" />
          )}

          {isActive ? (
            <input
              className="bg-transparent outline-none border-none min-w-0 w-full text-[0.6875rem] font-medium text-foreground truncate cursor-text"
              // readOnly until focus: a live (editable) text input makes the v3
              // menu yield to the browser's native menu, which swallowed the
              // whole tab menu on the active tab. Focus (the same single click
              // that always started a rename) lifts readOnly, so typing works
              // exactly as before — and while actually renaming, right-click
              // correctly yields to the native text menu.
              readOnly={!titleEditing}
              value={localLabel}
              onChange={handleTitleChange}
              onClick={(e) => {
                e.stopPropagation();
                setTitleEditing(true);
                bumpTabInteraction();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setTitleEditing(true);
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
              {/* The tab keeps two actions — dictate into the note, and the
                  one "…" menu (Copy, Share, Export, Duplicate…). Copy, Share
                  and a colored context shield used to sit here too; the
                  shield duplicated the footer's Context chip and explained
                  nothing (page-pass 2026-09-27). */}
              <MicrophoneIconButton
                onTranscriptionComplete={handleTranscription}
                variant="icon-only"
                size="sm"
              />
              {/* The "…" opens the SAME universal v3 menu as right-click
                  (openContextMenuForElement — the canonical overflow trigger,
                  as in FileTreeNode / user-lists). It used to be a second,
                  bespoke dropdown holding only the "Tab" items, so the
                  content actions (Copy as / Export → Print / Convert …) that
                  right-click already offered were invisible from the button
                  — Arman could not find Print in Notes (2026-09-21). */}
              <NonEditableContextMenu
                sourceFeature={NOTES_EDITOR_CONTEXT_MENU_PROPS.sourceFeature}
                surfaceName={NOTES_EDITOR_CONTEXT_MENU_PROPS.surfaceName}
                getApplicationScope={getApplicationScope}
                contentSource={noteIdentityContentSource(noteId, `tab-more:${instanceId}:${noteId}`)}
                entity={{ type: "note", id: noteId, title: label, resourceType: "note" }}
                resolveContextOnOpen={() => ({
                  [CONTEXT_MENU_HEADING_KEY]: { label: "Note", text: label || "Untitled note" },
                })}
                extraSections={tabButtonSections}
                // Arman 2026-09-28: the tab's "…" is the Tab rows, then ONE
                // "Note ▸" holding the full note menu.
                subjectFold="Note"
                onMenuOpenChange={(open) => {
                  setTabMenuOpen(open);
                  if (open) bumpTabInteraction();
                }}
              >
                <button
                  ref={moreRef}
                  data-note-tab-more=""
                  className={actionBtnClass}
                  title={standalone ? "Note actions" : "Tab and note actions"}
                  aria-label={standalone ? "Note actions" : "Tab and note actions"}
                  aria-haspopup="menu"
                  onClick={(e) => {
                    e.stopPropagation();
                    bumpTabInteraction();
                    openContextMenuForElement(moreRef.current);
                  }}
                >
                  <MoreHorizontal />
                </button>
              </NonEditableContextMenu>
            </div>
          )}

          {/* Close button */}
          {!standalone && (
          <span
            className="notes-tab-close-btn flex items-center justify-center w-4 h-4 rounded-sm text-muted-foreground shrink-0 hover:bg-accent hover:text-foreground ml-1"
            role="button"
            aria-label={`Close ${label}`}
            onClick={handleClose}
          >
            <X className="w-2.5 h-2.5" />
          </span>
          )}
        </div>
      </NonEditableContextMenu>

      {/* Share modal */}
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        resourceType="note"
        resourceId={noteId}
        resourceName={label}
      />

      <MoveNoteDialog
        open={moveDialogOpen}
        onOpenChange={setMoveDialogOpen}
        onConfirm={handleMoveToFolder}
        onCreateFolder={handleCreateFolder}
        noteId={noteId}
        noteName={label}
        currentFolder={note ? noteFolderReference(note) : null}
        availableFolders={folderReferences.filter(
          (folder) => folder.organizationId === note?.organization_id,
        )}
      />

      {/* NO DELETE DIALOG HERE, ON PURPOSE. It used to be hand-assembled from
          AlertDialog primitives at z-[10001] with host-plugin animation
          classes — a second confirm surface for a decision the platform
          already owns. `requestDelete` opens the canonical `confirm()`
          instead, which portals above every layer without a z-index of its
          own. Re-adding a dialog here is the twin that was removed. */}
    </>
  );
}
