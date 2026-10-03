"use client";
import { useState } from "react";
import { deleteRow, restoreArchivedRow } from "@/features/data-tables/service";
import { toast as notify } from "@/lib/toast";
import { isServiceFailure } from "@/features/data-tables/types";
// A CONFIRMATION of an irreversible act is an AlertDialog: it blocks the page on
// purpose (policy ai-reachable-everywhere, rule 1). The ordinary Dialog is a
// non-blocking window on desktop, which a delete confirmation must never be.
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface DeleteRowModalProps {
  /** The row's table — the data seam decides which store deletes it. */
  tableId: string;
  rowId: string | null;
  /** What the row is called (the table's row label) — so the question names what is being deleted. */
  rowLabel?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * The row went to the archive. When given, the caller owns the way back — it records the step on
   * its ONE undo stack (Cmd-Z, the toolbar Undo and the notice's Undo are the same step; grids review
   * 3: the toolbar Undo did not bring a deleted row back) and raises the notice. Without it this
   * dialog raises its own.
   */
  onArchived?: (rowId: string, named: string) => void;
}

export default function DeleteRowModal({
  tableId,
  rowId,
  rowLabel,
  isOpen,
  onClose,
  onSuccess,
  onArchived,
}: DeleteRowModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle delete
  const handleDelete = async () => {
    if (!rowId) {
      setError("No row selected for deletion");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const done = await deleteRow({ tableId, rowId });
      if (isServiceFailure(done)) throw new Error(done.error);

      onSuccess();
      onClose();
      // THE WAY BACK, WHERE THE PERSON IS LOOKING (DATA-V2-BASICS-2 F34). The row went to the
      // archive; the only way back used to be Trash, two pages away. Undo restores it in place.
      const archivedId = rowId;
      const named = rowLabel ? `"${rowLabel}"` : "The row";
      if (onArchived) {
        onArchived(archivedId, named);
        return;
      }
      notify.success(`${named} was archived`, {
        description: "It is in this table's archive and in Trash. Undo puts it back here.",
        duration: 10000,
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              const back = await restoreArchivedRow({ tableId, rowId: archivedId });
              if (isServiceFailure(back)) {
                notify.error(`${named} could not be put back: ${back.error}`, {
                  description: "It is still in Trash, where Restore brings it back.",
                });
                return;
              }
              notify.success(`${named} is back`);
              onSuccess();
            })();
          },
        },
      });
    } catch (err) {
      console.error("Error deleting row:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!rowId) {
    return null;
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-[425px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{rowLabel ? `Delete "${rowLabel}"?` : "Delete Row"}</AlertDialogTitle>
          <AlertDialogDescription>
            {/* THE RECORD STORE ARCHIVES — it never destroys a row (REC-23), so
                "cannot be undone" would be a false sentence here. */}
            {`${rowLabel ? `The row "${rowLabel}"` : "This row"} will be archived: it leaves this table, and it stays restorable from the table's archive for the table's retention period.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        )}

        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
