"use client";

// features/board/boards/useBoardRowActions.tsx
//
// The ONE action list for a board row — the kebab, the phone card and the
// right-click menu all read this builder. Delete is a soft delete: the board
// goes to Trash and the list's Archived filter, whose row offers Restore.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArchiveRestore, Copy, ExternalLink, Eye, LayoutTemplate, Pencil, Trash2 } from "lucide-react";
import type { ItemMenuConfig } from "@ai-matrx/chat/ui/item-types";
import { TextInputDialog } from "@ai-matrx/design-system";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { trashConfirmSentence } from "@/features/trash/archiveCopy";
import type { EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import {
  boardHref,
  deleteBoard,
  duplicateBoard,
  isBoardError,
  renameBoard,
  restoreBoard,
  type BoardListRow,
} from "../persistence/boardsService";
import { saveBoardAsTemplate } from "../templates/board-templates";

function failure(error: unknown, fallback: string): string {
  return isBoardError(error) ? error.message : error instanceof Error && error.message ? error.message : fallback;
}

/** The sentence a delete confirm must say before anything happens. Exported for tests. */
export function deleteConsequence(row: Pick<BoardListRow, "title">): string {
  return trashConfirmSentence(`"${row.title}"`);
}

export function useBoardRowActions(list: EntityListController<BoardListRow>): EntityRowActionsResult<BoardListRow> {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [renaming, setRenaming] = useState<BoardListRow | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  const open = (row: BoardListRow) => {
    if (row.archived) return;
    startTransition(() => router.push(boardHref(row)));
  };

  const duplicate = async (row: BoardListRow) => {
    try {
      const copy = await duplicateBoard(row.id);
      list.refresh();
      startTransition(() => router.push(boardHref(copy)));
    } catch (error) {
      throw new Error(failure(error, "The board could not be copied. Try again."));
    }
  };

  const remove = async (row: BoardListRow) => {
    const ok = await confirm({
      title: `Delete "${row.title}"?`,
      description: deleteConsequence(row),
      confirmLabel: "Delete board",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteBoard(row.id);
      list.removeRow(row.id);
      toast.success(`Deleted "${row.title}"`);
    } catch (error) {
      toast.error(failure(error, "The board could not be deleted. Try again."));
    }
  };

  const restore = async (row: BoardListRow) => {
    try {
      await restoreBoard(row.id);
      list.refresh();
      toast.success(`Restored "${row.title}"`);
    } catch (error) {
      toast.error(failure(error, "The board could not be restored. Try again."));
    }
  };

  const menuFor = (row: BoardListRow) => (): ItemMenuConfig => {
    if (row.archived) {
      return {
        header: { title: row.title },
        sections: [
          {
            id: "manage",
            items: [
              {
                id: "restore",
                label: "Restore",
                icon: ArchiveRestore,
                onSelect: () => {
                  void restore(row);
                },
              },
            ],
          },
        ],
      };
    }
    const href = boardHref(row);
    return {
      header: { title: row.title },
      sections: [
        {
          id: "open",
          items: [
            { id: "open", label: "Open", icon: Eye, kind: "link", href },
            { id: "open-tab", label: "Open in new tab", icon: ExternalLink, kind: "link", href, target: "_blank" },
          ],
        },
        {
          id: "manage",
          label: "Manage",
          items: [
            { id: "rename", label: "Rename", icon: Pencil, intent: "rename", onSelect: () => setRenaming(row) },
            {
              id: "save-template",
              label: "Save as template",
              icon: LayoutTemplate,
              onSelect: () => saveBoardAsTemplate(row.id, true),
              toast: { loading: "Saving…", success: "Saved as a template", error: (e) => failure(e, "Could not save the template") },
            },
            {
              id: "duplicate",
              label: "Make a copy",
              icon: Copy,
              onSelect: () => duplicate(row),
              toast: { loading: "Copying…", success: "Copied", error: (e) => failure(e, "Copy failed") },
            },
          ],
        },
        {
          id: "danger",
          label: "Danger",
          items: [
            {
              id: "delete",
              label: "Delete",
              icon: Trash2,
              tone: "destructive",
              onSelect: () => {
                void remove(row);
              },
            },
          ],
        },
      ],
    };
  };

  const modals = (
    <TextInputDialog
      open={renaming !== null}
      onOpenChange={(next) => {
        if (!next) setRenaming(null);
      }}
      title="Rename board"
      defaultValue={renaming?.title ?? ""}
      placeholder="Board name"
      confirmLabel="Rename"
      busy={renameBusy}
      validate={(value) => (value.trim() ? null : "A board needs a name.")}
      onConfirm={async (value) => {
        if (!renaming) return;
        setRenameBusy(true);
        // No `finally` here: it makes the React Compiler skip this whole hook.
        const renamed = await renameBoard(renaming.id, value).catch((error: unknown) => {
          toast.error(failure(error, "The board could not be renamed. Try again."));
          return null;
        });
        setRenameBusy(false);
        if (!renamed) return;
        list.patchRow(renaming.id, { title: renamed.title });
        setRenaming(null);
      }}
    />
  );

  return { actions: { menuFor, onOpenRow: open }, modals };
}
