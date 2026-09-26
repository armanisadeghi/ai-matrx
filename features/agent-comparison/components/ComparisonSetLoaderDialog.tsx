"use client";

/**
 * ComparisonSetLoaderDialog — "Open a saved battle".
 *
 * Every saved battle has its own URL (`battleUrl`), so each row here is a
 * real link: a click opens it in place, cmd/ctrl-click opens it in a new tab,
 * and the battle page loads it from that URL through its own mode's loader.
 * The list starts on the current mode; "All modes" shows the rest, and a
 * battle from another mode opens on that mode's page.
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
import AppLink from "@/components/navigation/AppLink";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { listMyBattleSets } from "../redux/thunks";
import { deleteComparisonSet } from "../service/comparisonSetsService";
import {
  battleUrl,
  isBattleModeId,
  type BattleModeId,
} from "../shared/battleRoutes";
import type { ComparisonSetRow } from "../types";

const LIST_LIMIT = 100;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The mode of the page the dialog opens from; its battles are listed first. */
  mode: BattleModeId;
  /** The battle on screen, marked in the list. */
  activeSetId: string | null;
  /** Called after a battle is deleted, so the page can let go of it if it is on screen. */
  onDeleted?: (setId: string) => void;
}

function modeOf(row: ComparisonSetRow): string {
  const meta = (row.metadata ?? {}) as { mode?: string };
  // A row without a mode predates modes: it is an Open battle.
  return meta.mode ?? "open";
}

export function ComparisonSetLoaderDialog({
  open,
  onOpenChange,
  mode,
  activeSetId,
  onDeleted,
}: Props) {
  const dispatch = useAppDispatch();
  // null = not read yet for this opening (the list shows its loading state).
  const [sets, setSets] = useState<ComparisonSetRow[] | null>(null);
  const loading = open && sets === null;
  const [allModes, setAllModes] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allSets = sets ?? [];
  const visibleSets = allModes
    ? allSets
    : allSets.filter((s) => modeOf(s) === mode);

  const handleOpenChange = (next: boolean) => {
    // Re-read the list on every opening: battles are created on every first run.
    if (!next) setSets(null);
    onOpenChange(next);
  };

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    dispatch(listMyBattleSets())
      .unwrap()
      .then((rows) => {
        if (!cancelled) setSets(rows);
      })
      .catch((err) => {
        if (!cancelled) setSets([]);
        toast.error(
          `Couldn't list your saved battles: ${err instanceof Error ? err.message : err}`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, dispatch]);

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      await deleteComparisonSet(id);
      setSets((curr) => (curr ?? []).filter((s) => s.id !== id));
      onDeleted?.(id);
      toast.success("Battle deleted");
    } catch (err) {
      toast.error(
        `Couldn't delete the battle: ${err instanceof Error ? err.message : err}`,
      );
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Open a saved battle</DialogTitle>
            <DialogDescription>
              Every battle is saved when you first run it. Opening one replaces
              the battle on this page; it stays saved either way.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setAllModes(false)}
              aria-pressed={!allModes}
              className={cn(
                "h-7 px-2 rounded-md border",
                !allModes
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              This mode
            </button>
            <button
              type="button"
              onClick={() => setAllModes(true)}
              aria-pressed={allModes}
              className={cn(
                "h-7 px-2 rounded-md border",
                allModes
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              All modes
            </button>
            {allSets.length >= LIST_LIMIT && (
              <span className="ml-auto text-muted-foreground">
                Your {LIST_LIMIT} most recent
              </span>
            )}
          </div>

          <div className="max-h-[60dvh] overflow-y-auto -mx-2 px-2">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Reading your saved battles…</span>
              </div>
            ) : visibleSets.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {allModes
                  ? "You have no saved battles yet."
                  : "No saved battles in this mode yet. Try All modes."}
              </div>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md">
                {visibleSets.map((s) => {
                  const setMode = modeOf(s);
                  const href = isBattleModeId(setMode)
                    ? battleUrl(setMode, s.id)
                    : null;
                  const isActive = s.id === activeSetId;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <ModeBadge mode={setMode} />
                          {href ? (
                            <AppLink
                              href={href}
                              onClick={() => handleOpenChange(false)}
                              className="text-sm font-medium truncate hover:underline"
                            >
                              {s.name}
                            </AppLink>
                          ) : (
                            <span className="text-sm font-medium truncate">
                              {s.name}
                            </span>
                          )}
                          {isActive && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              on screen
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {href
                            ? new Date(s.updated_at).toLocaleString()
                            : `Saved in an unknown mode ("${setMode}"); it cannot be opened here.`}
                        </div>
                      </div>
                      {href && (
                        <Button size="sm" variant="outline" asChild>
                          <AppLink
                            href={href}
                            onClick={() => handleOpenChange(false)}
                          >
                            Open
                          </AppLink>
                        </Button>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        title="Delete this battle"
                        aria-label={`Delete ${s.name}`}
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
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
        title="Delete this battle?"
        description={
          confirmDeleteId && confirmDeleteId === activeSetId
            ? "This is the battle on screen. It leaves your saved battles and its link stops working; the page keeps what is on screen as a new, unsaved battle. The conversations stay in your chat history."
            : "It leaves your saved battles and its link stops working. The conversations stay in your chat history."
        }
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
  model: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  tuning: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  variations: "bg-teal-500/15 text-teal-500 border-teal-500/30",
  conversation: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
};

function ModeBadge({ mode }: { mode: string }) {
  const className =
    MODE_BADGE_STYLES[mode] ??
    "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0 text-[9px] font-mono font-medium uppercase tracking-wider rounded border shrink-0 ${className}`}
    >
      {mode}
    </span>
  );
}
