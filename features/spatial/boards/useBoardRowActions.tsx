"use client";

// features/spatial/boards/useBoardRowActions.tsx
//
// The ONE action list for a board row — the kebab, the phone card and the
// right-click menu all read this builder.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Eye, Pencil, Trash2 } from "lucide-react";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { isOrganizationSelectionCancelled } from "@/lib/organization/organization-gate";
import { toast } from "@/lib/toast";
import type { EntityListController, EntityRowActionsResult } from "@/lib/entity-list/config";
import {
  boardHref,
  deleteBoard,
  duplicateBoard,
  isBoardError,
  renameBoard,
  type BoardListRow,
} from "../persistence/boardsService";

function failure(error: unknown, fallback: string): string {
  return isBoardError(error) ? error.message : error instanceof Error && error.message ? error.message : fallback;
}

/** The sentence a delete confirm must say before anything happens. Exported for tests. */
export function deleteConsequence(row: Pick<BoardListRow, "title" | "tile_count">): string {
  const tiles =
    row.tile_count === 0
      ? "It has no tiles."
      : `Its ${row.tile_count} ${row.tile_count === 1 ? "tile goes" : "tiles go"} with it — the notes, chats, files and tasks they show are not deleted and stay where they live.`;
  return `"${row.title}" leaves your boards. ${tiles} Boards cannot be restored from Trash yet.`;
}

export function useBoardRowActions(list: EntityListController<BoardListRow>): EntityRowActionsResult<BoardListRow> {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [renaming, setRenaming] = useState<BoardListRow | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);

  const open = (row: BoardListRow) => startTransition(() => router.push(boardHref(row)));

  const duplicate = async (row: BoardListRow) => {
    try {
      const copy = await duplicateBoard(row.id);
      list.refresh();
      startTransition(() => router.push(boardHref(copy)));
    } catch (error) {
      if (isOrganizationSelectionCancelled(error)) return;
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

  const menuFor = (row: BoardListRow) => (): ItemMenuConfig => {
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
              disabled: row.is_home,
              disabledReason: row.is_home ? "Your home board opens at /board, so it cannot be deleted" : undefined,
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
        try {
          const { title } = await renameBoard(renaming.id, value);
          list.patchRow(renaming.id, { title });
          setRenaming(null);
        } catch (error) {
          toast.error(failure(error, "The board could not be renamed. Try again."));
        } finally {
          setRenameBusy(false);
        }
      }}
    />
  );

  return { actions: { menuFor, onOpenRow: open }, modals };
}
