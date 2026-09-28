/**
 * THE NOTE ACTIONS — built once, shown everywhere a note offers its actions:
 * the right-click menu in every view (through the tab's record rows, which
 * join every menu opened on the note's content), the tab's "…", and the phone
 * More sheet. One order, one set of names ("Move to Trash", never "Delete").
 *
 * A host passes the handlers it has; an action whose handler is absent is
 * left out rather than shown dead.
 */
import type { LucideIcon } from "lucide-react";
import {
  Pencil,
  CopyPlus,
  FolderInput,
  Database,
  Download,
  Printer,
  History,
  Share2,
  Bookmark,
  Info,
  Trash2,
} from "lucide-react";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";

export interface NoteActionHandlers {
  rename?: () => void;
  duplicate?: () => void;
  moveToFolder?: () => void;
  knowledge?: () => void;
  /** "Knowledge base" once the note is indexed, else "Add to knowledge base". */
  knowledgeIndexed?: boolean;
  exportMarkdown?: () => void;
  /** Opens the print studio (pages, PDF / Word / EPUB / HTML). */
  print?: () => void;
  versionHistory?: () => void;
  share?: () => void;
  copyReference?: () => void;
  about?: () => void;
  /** Archives: the note moves to Trash and can be restored. */
  moveToTrash?: () => void;
}

export interface NoteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  run: () => void;
  destructive?: boolean;
  /** Starts a new group (drawn as a separator before it). */
  groupStart?: boolean;
}

export function noteActions(h: NoteActionHandlers): NoteAction[] {
  const all: (NoteAction | null)[] = [
    h.rename ? { id: "rename", label: "Rename", icon: Pencil, run: h.rename } : null,
    h.duplicate ? { id: "duplicate", label: "Duplicate", icon: CopyPlus, run: h.duplicate } : null,
    h.moveToFolder ? { id: "move-to-folder", label: "Move to folder…", icon: FolderInput, run: h.moveToFolder } : null,
    h.knowledge
      ? {
          id: "knowledge",
          label: h.knowledgeIndexed ? "Knowledge base" : "Add to knowledge base",
          icon: Database,
          run: h.knowledge,
          groupStart: true,
        }
      : null,
    h.exportMarkdown ? { id: "export-markdown", label: "Export as Markdown", icon: Download, run: h.exportMarkdown } : null,
    h.print ? { id: "print-document", label: "Print or export as document…", icon: Printer, run: h.print } : null,
    h.versionHistory ? { id: "version-history", label: "Version history", icon: History, run: h.versionHistory } : null,
    h.share ? { id: "share", label: "Share…", icon: Share2, run: h.share, groupStart: true } : null,
    h.copyReference ? { id: "copy-reference", label: "Copy reference for an agent", icon: Bookmark, run: h.copyReference } : null,
    h.about ? { id: "about", label: "About this note", icon: Info, run: h.about } : null,
    h.moveToTrash
      ? { id: "delete", label: "Move to Trash", icon: Trash2, run: h.moveToTrash, destructive: true, groupStart: true }
      : null,
  ];
  return all.filter((a): a is NoteAction => a !== null);
}

/** The same actions as ONE context-menu section, first in the note's menu. */
export function noteActionsSection(h: NoteActionHandlers): ContextMenuExtraSection {
  const items: ContextMenuExtraItem[] = [];
  for (const action of noteActions(h)) {
    if (action.groupStart && items.length > 0)
      items.push({ kind: "separator", id: `note-sep-${action.id}` });
    items.push({
      kind: "item",
      id: action.id,
      label: action.label,
      icon: action.icon,
      destructive: action.destructive,
      onSelect: action.run,
    });
  }
  return { id: "note-actions", label: "Note", icon: Pencil, anchor: "after-clipboard", items };
}

/** Opens the print studio for a note in a new tab. */
export function openNotePrintStudio(noteId: string): void {
  window.open(`/print/documents?note=${encodeURIComponent(noteId)}`, "_blank", "noopener");
}
