"use client";

/**
 * ComparisonSetLoaderDialog
 *
 * Lists the current user's saved comparison sets and loads the selected
 * one into the battle page (replacing whatever's currently there).
 */

import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "sonner";
import {
  listMyBattleSets,
  loadBattleSet,
} from "../redux/thunks";
import { deleteComparisonSet } from "../service/comparisonSetsService";
import type { ComparisonSetRow } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ComparisonSetLoaderDialog({ open, onOpenChange }: Props) {
  const dispatch = useAppDispatch();
  const [sets, setSets] = useState<ComparisonSetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    dispatch(listMyBattleSets())
      .unwrap()
      .then((rows) => {
        if (!cancelled) setSets(rows);
      })
      .catch((err) => {
        toast.error(
          `Couldn't list comparison sets: ${err instanceof Error ? err.message : err}`,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, dispatch]);

  const handleLoad = async (setId: string) => {
    setLoadingId(setId);
    try {
      await dispatch(loadBattleSet({ setId })).unwrap();
      toast.success("Comparison set loaded");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        `Couldn't load set: ${err instanceof Error ? err.message : err}`,
      );
    } finally {
      setLoadingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await deleteComparisonSet(id);
      setSets((curr) => curr.filter((s) => s.id !== id));
      toast.success("Comparison set deleted");
    } catch (err) {
      toast.error(
        `Couldn't delete set: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Open comparison set</DialogTitle>
            <DialogDescription>
              Load a previously-saved comparison. Replaces the current set of
              columns.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : sets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No saved comparison sets yet.
              </div>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md">
                {sets.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {s.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(s.updated_at).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleLoad(s.id)}
                      disabled={loadingId === s.id}
                    >
                      {loadingId === s.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "Open"
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(s.id)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDeleteId(null);
        }}
        title="Delete comparison set?"
        description="The underlying conversation records are not deleted — only this saved grouping."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
