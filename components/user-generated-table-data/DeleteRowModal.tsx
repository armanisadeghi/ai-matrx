"use client";
import { useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { unwrapUserTableMutation } from "@/utils/user-tables-rpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface DeleteRowModalProps {
  rowId: string | null;
  /** What the row is called (the table's row label) — so the question names what is being deleted. */
  rowLabel?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteRowModal({
  rowId,
  rowLabel,
  isOpen,
  onClose,
  onSuccess,
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

      // Call the RPC function
      const { data, error } = await supabase.rpc(
        "delete_data_row_from_user_table",
        {
          p_row_id: rowId,
        },
      );

      if (error) throw error;
      unwrapUserTableMutation(data ?? null);

      onSuccess();
      onClose();
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{rowLabel ? `Delete "${rowLabel}"?` : "Delete Row"}</DialogTitle>
          <DialogDescription>
            {rowLabel
              ? `The row "${rowLabel}" will be deleted. This action cannot be undone.`
              : "Are you sure you want to delete this row? This action cannot be undone."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 p-2 rounded-md text-red-500 text-sm">
            {error}
          </div>
        )}

        <DialogFooter>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
