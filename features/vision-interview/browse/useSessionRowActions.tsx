"use client";

// features/vision-interview/browse/useSessionRowActions.tsx
//
// The ONE action list for a /vision-interview list row — table kebab, cards,
// and right-click all consume the same builder (lib/entity-list contract).
// Actions: Open (the room), Rename (inline dialog), Delete (soft, confirmed).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DoorOpen, Pencil, Trash2 } from "lucide-react";
import type {
  ItemMenuConfig,
  ItemMenuEntry,
} from "@/components/official/item/types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { toast } from "@/lib/toast";
import type {
  EntityListController,
  EntityRowActionsResult,
} from "@/lib/entity-list/config";
import { deleteSession, renameSession } from "../service";
import type { SessionListRow } from "./types";

export function useSessionRowActions(
  list: EntityListController<SessionListRow>,
): EntityRowActionsResult<SessionListRow> {
  const router = useRouter();
  const [renameRow, setRenameRow] = useState<SessionListRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<SessionListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openRow = (row: SessionListRow) => {
    router.push(`/vision-interview/${row.id}`);
  };

  const menuFor = (row: SessionListRow) => (): ItemMenuConfig => {
    const open: ItemMenuEntry[] = [
      {
        id: "open",
        label: "Open room",
        icon: DoorOpen,
        kind: "link",
        href: `/vision-interview/${row.id}`,
      },
    ];
    const manage: ItemMenuEntry[] = row.is_owner
      ? [
          {
            id: "rename",
            label: "Rename",
            icon: Pencil,
            onSelect: () => setRenameRow(row),
          },
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            tone: "destructive",
            onSelect: () => setDeleteRow(row),
          },
        ]
      : [];
    return {
      sections: [
        { items: open },
        ...(manage.length > 0 ? [{ items: manage }] : []),
      ],
    };
  };

  const actions = {
    menuFor,
    onOpenRow: openRow,
  };

  const modals = (
    <>
      {renameRow && (
        <TextInputDialog
          open
          onOpenChange={(open) => {
            if (!open) setRenameRow(null);
          }}
          title="Rename interview"
          defaultValue={renameRow.title}
          confirmLabel="Rename"
          onConfirm={async (next) => {
            const title = next.trim();
            const row = renameRow;
            setRenameRow(null);
            if (!row || !title || title === row.title) return;
            try {
              await renameSession(row.id, title);
              list.patchRow(row.id, { title });
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : "Could not rename the interview.",
              );
            }
          }}
        />
      )}
      <ConfirmDialog
        open={deleteRow !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteRow(null);
        }}
        title="Delete this interview?"
        description={
          deleteRow
            ? `"${deleteRow.title}" moves to trash — the transcript, questions, and document go with it.`
            : undefined
        }
        confirmLabel="Delete"
        variant="destructive"
        busy={deleting}
        onConfirm={async () => {
          if (!deleteRow) return;
          setDeleting(true);
          try {
            await deleteSession(deleteRow.id);
            list.removeRow(deleteRow.id);
            setDeleteRow(null);
          } catch (err) {
            toast.error(
              err instanceof Error
                ? err.message
                : "Could not delete the interview.",
            );
          } finally {
            setDeleting(false);
          }
        }}
      />
    </>
  );

  return { actions, modals };
}
