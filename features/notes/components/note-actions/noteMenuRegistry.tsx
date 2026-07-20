"use client";

/**
 * noteMenuRegistry — builds the `ItemMenuConfig` for note-row menus.
 *
 * `buildNoteMenu(ctx)` returns the full "..." menu (Rename / Duplicate /
 * Share / Add to knowledge base / Export as Markdown / Move to Folder /
 * Delete) consumed by `<ItemRow menu={…}>` in the notes sidebar — the same
 * kebab + right-click primitive the chat sidebar uses for conversations
 * (see conversationActionRegistry.tsx). Rename is an `intent: "rename"`
 * entry that ItemRow turns into inline edit.
 *
 * Delete skips the confirmation dialog entirely for empty notes
 * (`isNoteContentEmpty`) — there's nothing worth confirming the loss of.
 * Otherwise it goes through the global imperative `confirm()`, then a
 * soft delete + undo toast (mirrors useNoteDelete's UX).
 */

import {
  FileText,
  Pencil,
  Copy,
  Share2,
  Download,
  FolderInput,
  FolderPlus,
  Database,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import type { ItemMenuConfig } from "@/components/official/item/types";
import type {
  ContextMenuExtraItem,
  ContextMenuExtraSection,
} from "@/features/context-menu-v3/types";
import type { AppDispatch } from "@/lib/redux/store";
import { removeInstanceTab } from "../../redux/slice";
import {
  copyNote,
  deleteNote,
  restoreNote,
  moveNoteToFolder,
} from "../../redux/thunks";
import { isNoteContentEmpty } from "../../utils/noteUtils";
import { downloadNoteAsMarkdown } from "../../utils/exportNotesMarkdown";
import { confirm } from "@/components/dialogs/confirm/confirmDialogOpener";
import { isResourceOwner } from "@/utils/permissions/service";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";

export interface NoteMenuContext {
  instanceId: string;
  noteId: string;
  label: string;
  content: string | null | undefined;
  /** Current folder — excluded from the "Move to Folder" submenu. */
  folder: string;
  /** All known folders, used to build the "Move to Folder" submenu. */
  allFolders: string[];
  /** Opens the note's knowledge-base (RAG) side panel. */
  openKnowledge: (opts: { noteId: string; title?: string }) => void;
  /** Creates a folder, then moves this note into it. */
  onCreateFolder: () => void;
  dispatch: AppDispatch;
}

export function displayLabel(label: string): string {
  return label.trim().length > 0 ? label : "Untitled";
}

/**
 * Resolves ownership on demand (only when Share is actually clicked — not
 * per row) and opens the shared `shareModal` overlay for a note. Used by
 * both the per-row "..." menu and the bulk-selection action bar.
 */
export async function openNoteShareModal(
  dispatch: AppDispatch,
  noteId: string,
  label: string,
): Promise<void> {
  const owner = await isResourceOwner("note", noteId);
  dispatch(
    openOverlay({
      overlayId: "shareModal",
      data: {
        resourceType: "note",
        resourceId: noteId,
        resourceName: displayLabel(label),
        isOwner: owner,
      },
    }),
  );
}

/** Duplicate a note with success/failure toasts. Shared by both menus. */
async function duplicateNoteAction(ctx: NoteMenuContext): Promise<void> {
  const result = await ctx.dispatch(copyNote(ctx.noteId));
  if (copyNote.rejected.match(result)) {
    toast.error("Duplicate failed");
  } else {
    toast.success("Note duplicated");
  }
}

/**
 * Soft-delete a note (confirm unless empty) + undo toast. Shared by both
 * menus. Mirrors useNoteDelete's UX.
 */
async function deleteNoteAction(ctx: NoteMenuContext): Promise<void> {
  if (!isNoteContentEmpty(ctx.content)) {
    const ok = await confirm({
      title: "Delete note?",
      description: (
        <>
          &ldquo;{displayLabel(ctx.label)}&rdquo; will be moved to trash. You
          can restore it later.
        </>
      ),
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
  }

  ctx.dispatch(
    removeInstanceTab({ instanceId: ctx.instanceId, noteId: ctx.noteId }),
  );
  const result = await ctx.dispatch(deleteNote(ctx.noteId));
  if (deleteNote.rejected.match(result)) {
    toast.error("Failed to delete note");
    return;
  }

  toast.success("Note deleted", {
    description: `"${displayLabel(ctx.label)}" moved to trash`,
    action: {
      label: "Undo",
      onClick: () => {
        ctx.dispatch(restoreNote(ctx.noteId));
        toast.success("Note restored");
      },
    },
  });
}

/**
 * Surface-specific sections for the v3 right-click menu on a sidebar note
 * row (`NonEditableContextMenu extraSections`). Only the actions v3 does NOT
 * already provide: Export-as-Markdown comes from `contentSource`, Share from
 * `entity`, and Rename stays on the kebab (inline edit is an ItemRow
 * behavior). Same handlers as `buildNoteMenu` — one implementation.
 */
export function buildNoteContextSections(
  ctx: NoteMenuContext & { onOpen: () => void },
): ContextMenuExtraSection[] {
  const moveTargets = ctx.allFolders.filter((f) => f !== ctx.folder);

  const items: ContextMenuExtraItem[] = [
    {
      kind: "item",
      id: "open",
      label: "Open",
      icon: FileText,
      onSelect: ctx.onOpen,
    },
    {
      kind: "item",
      id: "duplicate",
      label: "Duplicate",
      icon: Copy,
      onSelect: () => void duplicateNoteAction(ctx),
    },
    {
      kind: "item",
      id: "knowledge",
      label: "Add to knowledge base",
      icon: Database,
      onSelect: () =>
        ctx.openKnowledge({ noteId: ctx.noteId, title: ctx.label }),
    },
  ];

  const moveChildren: ContextMenuExtraItem[] = moveTargets.map((folder) => ({
    kind: "item" as const,
    id: `move-${folder}`,
    label: folder,
    onSelect: () => {
      ctx.dispatch(moveNoteToFolder({ noteId: ctx.noteId, folder }));
    },
  }));
  if (moveChildren.length > 0) {
    moveChildren.push({ kind: "separator", id: "move-new-sep" });
  }
  moveChildren.push({
    kind: "item",
    id: "move-new-folder",
    label: "New folder…",
    icon: FolderPlus,
    onSelect: ctx.onCreateFolder,
  });
  items.push({
    kind: "submenu",
    id: "move",
    label: "Move to Folder",
    icon: FolderInput,
    children: moveChildren,
  });

  items.push(
    { kind: "separator", id: "danger-sep" },
    {
      kind: "item",
      id: "delete",
      label: "Delete",
      icon: Trash2,
      destructive: true,
      onSelect: () => void deleteNoteAction(ctx),
    },
  );

  return [{ id: "note-actions", label: displayLabel(ctx.label), items }];
}

export function buildNoteMenu(ctx: NoteMenuContext): ItemMenuConfig {
  const moveTargets = ctx.allFolders.filter((f) => f !== ctx.folder);

  return {
    header: { title: displayLabel(ctx.label) },
    sections: [
      {
        id: "actions",
        items: [
          {
            id: "rename",
            label: "Rename",
            icon: Pencil,
            intent: "rename",
            shortcutKey: "r",
            // ItemRow intercepts `intent: "rename"` and drives inline edit;
            // this no-op is the fallback for non-row consumers.
            onSelect: () => {},
          },
          {
            id: "duplicate",
            label: "Duplicate",
            icon: Copy,
            shortcutKey: "d",
            onSelect: () => void duplicateNoteAction(ctx),
          },
        ],
      },
      {
        id: "manage",
        label: "Manage",
        items: [
          {
            id: "share",
            label: "Share…",
            icon: Share2,
            onSelect: () =>
              openNoteShareModal(ctx.dispatch, ctx.noteId, ctx.label),
          },
          {
            id: "knowledge",
            label: "Add to knowledge base",
            icon: Database,
            onSelect: () => {
              ctx.openKnowledge({ noteId: ctx.noteId, title: ctx.label });
            },
          },
          {
            id: "export",
            label: "Export as Markdown",
            icon: Download,
            onSelect: () => {
              downloadNoteAsMarkdown({
                id: ctx.noteId,
                label: ctx.label,
                content: ctx.content,
              });
            },
          },
          {
            id: "move",
            kind: "submenu" as const,
            label: "Move to Folder",
            icon: FolderInput,
            sections: [
              {
                id: "folders",
                items: [
                  ...moveTargets.map((folder) => ({
                    id: `move-${folder}`,
                    label: folder,
                    onSelect: () => {
                      ctx.dispatch(
                        moveNoteToFolder({ noteId: ctx.noteId, folder }),
                      );
                    },
                  })),
                  {
                    id: "move-new-folder",
                    label: "New folder…",
                    icon: FolderPlus,
                    onSelect: ctx.onCreateFolder,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "danger",
        items: [
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            tone: "destructive",
            onSelect: () => void deleteNoteAction(ctx),
          },
        ],
      },
    ],
  };
}
