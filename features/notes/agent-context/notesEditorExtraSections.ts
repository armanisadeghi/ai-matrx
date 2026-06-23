import {
  Save,
  CopyPlus,
  Download,
  Link2,
  ClipboardCopy,
  FolderInput,
  FolderClosed,
  X,
  Trash2,
} from "lucide-react";
import type {
  ContextMenuExtraSection,
  ContextMenuExtraItem,
} from "@/features/context-menu-v2/extraSections";

/**
 * Note-specific menu items injected into the canonical `UnifiedAgentContextMenu`
 * via `extraSections`. The core menu already renders selection / undo-redo /
 * clipboard / find / agent placements / quick-actions / admin — these are the
 * items ONLY the notes surface knows about. Every `onSelect` is bound to a REAL
 * handler supplied by the host (NoteContentEditor); there are no toast stubs.
 * The host owns the handlers + state, so this stays a pure description.
 */
export interface NotesEditorExtraSectionsConfig {
  /** Disables "Save" when the note has no unsaved changes. */
  isDirty?: boolean;
  /** Every folder the user has — used to build the "Move to Folder" submenu. */
  allFolders?: string[];
  /** The note's current folder (that entry is disabled in the submenu). */
  currentFolder?: string;
  /** Open-tab count — gates "Close Other Tabs" / "Close All Tabs". */
  openTabCount?: number;
  onSave: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onShareLink: () => void;
  onShareClipboard: () => void;
  /** Direct move to a specific folder (one click, no dialog). */
  onMoveToFolder: (folder: string) => void;
  /** Open the full move dialog (new-folder creation, etc.). */
  onMoveDialog: () => void;
  onCloseTab: () => void;
  onCloseOtherTabs: () => void;
  onCloseAllTabs: () => void;
  onDelete: () => void;
}

export function createNotesEditorExtraSections(
  config: NotesEditorExtraSectionsConfig,
): ContextMenuExtraSection[] {
  const {
    isDirty,
    allFolders = [],
    currentFolder,
    openTabCount = 1,
    onSave,
    onDuplicate,
    onExport,
    onShareLink,
    onShareClipboard,
    onMoveToFolder,
    onMoveDialog,
    onCloseTab,
    onCloseOtherTabs,
    onCloseAllTabs,
    onDelete,
  } = config;

  // Move-to-Folder submenu: one item per folder (current disabled) + the full
  // dialog for new-folder creation.
  const moveChildren: ContextMenuExtraItem[] = allFolders.map((folder) => ({
    kind: "item",
    id: `move-${folder}`,
    label: folder,
    icon: FolderClosed,
    disabled: folder === currentFolder,
    onSelect: () => onMoveToFolder(folder),
  }));
  if (moveChildren.length > 0) {
    moveChildren.push({ kind: "separator", id: "move-sep" });
  }
  moveChildren.push({
    kind: "item",
    id: "move-choose",
    label: "Choose folder…",
    icon: FolderInput,
    onSelect: onMoveDialog,
  });

  // Tabs submenu (notes is multi-tab; the canonical menu has no concept of it).
  const tabChildren: ContextMenuExtraItem[] = [
    { kind: "item", id: "close-tab", label: "Close Tab", icon: X, onSelect: onCloseTab },
    {
      kind: "item",
      id: "close-others",
      label: "Close Other Tabs",
      disabled: openTabCount <= 1,
      onSelect: onCloseOtherTabs,
    },
    {
      kind: "item",
      id: "close-all",
      label: "Close All Tabs",
      disabled: openTabCount === 0,
      onSelect: onCloseAllTabs,
    },
  ];

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "save",
      label: "Save",
      icon: Save,
      hint: "⌘S",
      disabled: !isDirty,
      onSelect: onSave,
    },
    { kind: "item", id: "duplicate", label: "Duplicate", icon: CopyPlus, onSelect: onDuplicate },
    {
      kind: "item",
      id: "export",
      label: "Export as Markdown",
      icon: Download,
      onSelect: onExport,
    },
    { kind: "item", id: "share-link", label: "Share link…", icon: Link2, onSelect: onShareLink },
    {
      kind: "item",
      id: "share-clipboard",
      label: "Copy to clipboard",
      icon: ClipboardCopy,
      onSelect: onShareClipboard,
    },
    { kind: "submenu", id: "move", label: "Move to Folder", icon: FolderInput, children: moveChildren },
    { kind: "submenu", id: "tabs", label: "Tabs", icon: X, children: tabChildren },
    { kind: "separator", id: "delete-sep" },
    {
      kind: "item",
      id: "delete",
      label: "Delete Note",
      icon: Trash2,
      destructive: true,
      onSelect: onDelete,
    },
  ];

  return [{ id: "notes-ops", label: "Note", anchor: "after-compare", items }];
}
