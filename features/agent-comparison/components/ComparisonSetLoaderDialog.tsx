"use client";

/**
 * ComparisonSetLoaderDialog
 *
 * Lists the current user's saved comparison sets and loads the selected
 * one into the current page (replacing whatever's currently there).
 *
 * The actual "load" semantics differ per mode — Mode 1 calls
 * `loadBattleSet`, Mode 2 calls `loadSettingsBattleSet`, etc. The
 * dialog stays mode-agnostic by accepting an explicit `loadFn`; if not
 * provided it defaults to the Mode 1 (open) loader so legacy callers
 * keep working.
 *
 * `modeFilter` optionally narrows the listed sets to those whose
 * metadata.mode matches. Useful so the Settings page doesn't show
 * Open-mode sets it can't actually load (and vice versa).
 */

import { useEffect, useMemo, useState } from "react";
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
import { listMyBattleSets, loadBattleSet } from "../redux/thunks";
import { deleteComparisonSet } from "../service/comparisonSetsService";
import type { ComparisonSetRow } from "../types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Custom loader. Receives the chosen set id and is expected to dispatch
   * whatever mode-specific load thunk applies. Defaults to Mode 1.
   */
  loadFn?: (setId: string) => Promise<void> | void;
  /**
   * Optional mode tag to filter the listed sets by `metadata.mode`. When
   * provided, sets whose metadata.mode !== this value are hidden. Pass
   * `"open"` for Mode 1, `"settings"` for Mode 2, etc. When omitted, all
   * sets show — useful for cross-mode browsing surfaces.
   */
  modeFilter?: string;
}

export function ComparisonSetLoaderDialog({
  open,
  onOpenChange,
  loadFn,
  modeFilter,
}: Props) {
  const dispatch = useAppDispatch();
  const [sets, setSets] = useState<ComparisonSetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const visibleSets = useMemo(() => {
    if (!modeFilter) return sets;
    return sets.filter((s) => {
      const meta = (s.metadata ?? {}) as { mode?: string };
      // Treat "no mode" as "open" so legacy Mode 1 sets show on the open page.
      const mode = meta.mode ?? "open";
      return mode === modeFilter;
    });
  }, [sets, modeFilter]);

  useEffect(() => {
    if (!open) return undefined;
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
      if (loadFn) {
        await loadFn(setId);
      } else {
        await dispatch(loadBattleSet({ setId })).unwrap();
      }
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

          <div className="max-h-[60dvh] overflow-y-auto -mx-2 px-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : visibleSets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {modeFilter
                  ? `No saved ${modeFilter}-mode comparison sets yet.`
                  : "No saved comparison sets yet."}
              </div>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md">
                {visibleSets.map((s) => {
                  const meta = (s.metadata ?? {}) as { mode?: string };
                  const mode = meta.mode ?? "open";
                  return (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <ModeBadge mode={mode} />
                        <div className="text-sm font-medium truncate">
                          {s.name}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
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
                  );
                })}
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

const MODE_BADGE_STYLES: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  settings: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  tools: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  "system-prompt": "bg-purple-500/15 text-purple-500 border-purple-500/30",
  "request-mod": "bg-rose-500/15 text-rose-500 border-rose-500/30",
};

function ModeBadge({ mode }: { mode: string }) {
  const className =
    MODE_BADGE_STYLES[mode] ??
    "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0 text-[9px] font-mono font-medium uppercase tracking-wider rounded border ${className}`}
    >
      {mode}
    </span>
  );
}
