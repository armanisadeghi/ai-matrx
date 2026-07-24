"use client";

// CellCleanupReviewDialog — the review-and-accept step for VALUE cleanup.
//
// Two views over the SAME frozen report:
//   "By type"  — one card per kind of change ("Removed backticks wrapping the
//                whole value"), each with real before -> after cell examples and
//                an Apply/Skip switch. This is the control surface.
//   "By cell"  — every affected cell, row by row, for the person who wants to
//                see the whole list before writing.
//
// Accepting/skipping a TYPE re-derives which cells are written: a cell survives
// only if at least one of the operations that touched it is still accepted, and
// its final value is recomputed from the accepted set — so a skipped type never
// leaks into the write through a cell some other type also touched.

import { useState } from "react";
import { Columns2, Eraser, ListChecks } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  buildValueOperationCards,
  cleanValue,
  toRowPatches,
} from "@/lib/content-cleanup/clean-cells";
import type {
  CellChange,
  CellsCleanupReport,
  RowPatch,
  ValueCleanupOperationId,
} from "@/lib/content-cleanup/value-types";

interface CellCleanupReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: CellsCleanupReport;
  /** What is being cleaned, e.g. the table name. */
  scopeLabel: string;
  /** Write the accepted patches. Resolves when the write completes. */
  onApply: (patches: RowPatch[]) => Promise<void>;
}

/** One before -> after cell example, rendered so the change is obvious. */
function CellExample({ change }: { change: CellChange }) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-1.5">
      <div className="mb-1 truncate text-[0.625rem] font-medium uppercase tracking-wide text-muted-foreground">
        {change.fieldLabel}
      </div>
      <div className="grid gap-1 @md:grid-cols-2">
        <div className="min-w-0 rounded bg-red-50 px-1.5 py-1 font-mono text-[0.6875rem] leading-snug text-red-900 dark:bg-red-950/30 dark:text-red-200">
          <span className="line-clamp-3 whitespace-pre-wrap break-words">
            {change.before}
          </span>
        </div>
        <div className="min-w-0 rounded bg-green-50 px-1.5 py-1 font-mono text-[0.6875rem] leading-snug text-green-900 dark:bg-green-950/30 dark:text-green-200">
          <span className="line-clamp-3 whitespace-pre-wrap break-words">
            {change.after || <em className="opacity-60">(empty)</em>}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CellCleanupReviewDialog({
  open,
  onOpenChange,
  report,
  scopeLabel,
  onApply,
}: CellCleanupReviewDialogProps) {
  // Compiler-memoized against `report`; stable across Apply/Skip toggles.
  const cards = buildValueOperationCards(report);

  // Every change type applied by default (one-click great result).
  const [accepted, setAccepted] = useState<Set<ValueCleanupOperationId>>(
    () => new Set(cards.map((c) => c.id)),
  );
  const [mode, setMode] = useState<"cards" | "cells">("cards");
  const [applying, setApplying] = useState(false);

  const toggle = (id: ValueCleanupOperationId, on: boolean) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };
  const applyAll = () => setAccepted(new Set(cards.map((c) => c.id)));
  const skipAll = () => setAccepted(new Set());

  // Re-derive the final cells from the ACCEPTED operations only. Recomputing
  // through the engine (rather than reusing `change.after`) is what keeps a
  // skipped type from riding along inside a multi-op cell.
  const finalChanges: CellChange[] = [];
  for (const change of report.changes) {
    const result = cleanValue(change.before, accepted);
    if (!result.changed) continue;
    finalChanges.push({ ...change, after: result.after, appliedOps: result.appliedOps });
  }
  const patches = toRowPatches(finalChanges);
  const willWrite = finalChanges.length > 0;

  const handleApply = async () => {
    setApplying(true);
    try {
      await onApply(patches);
      onOpenChange(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[88dvh] w-[92vw] max-w-3xl flex-col gap-0 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* pr-14 clears the Dialog's built-in close (X) button */}
        <DialogHeader className="shrink-0 flex-row items-center gap-2 space-y-0 border-b border-border px-4 py-3 pr-14">
          <Eraser className="h-4 w-4 shrink-0 text-primary" />
          <DialogTitle className="min-w-0 truncate text-sm">
            Review cleanup — {scopeLabel}
          </DialogTitle>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">
            {cards.length} type{cards.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-foreground">
              {finalChanges.length} cell{finalChanges.length !== 1 ? "s" : ""} in{" "}
              {patches.length} row{patches.length !== 1 ? "s" : ""}
            </span>
          </span>
          <div className="flex items-center overflow-hidden rounded-md border border-border">
            <button
              type="button"
              onClick={() => setMode("cards")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-[0.6875rem] transition-colors",
                mode === "cards"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="Review each type of change with an Apply/Skip switch"
            >
              <ListChecks className="h-3.5 w-3.5" />
              By type
            </button>
            <button
              type="button"
              onClick={() => setMode("cells")}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 text-[0.6875rem] transition-colors",
                mode === "cells"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="See every cell that will be written"
            >
              <Columns2 className="h-3.5 w-3.5" />
              By cell
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[0.6875rem]"
              onClick={applyAll}
              disabled={accepted.size === cards.length}
            >
              Apply all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[0.6875rem]"
              onClick={skipAll}
              disabled={accepted.size === 0}
            >
              Skip all
            </Button>
          </div>
        </div>

        {mode === "cards" ? (
          <div className="flex-1 min-h-0 space-y-2.5 overflow-y-auto bg-textured px-4 py-3">
            {cards.length === 0 ? (
              <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
                No changes were produced.
              </div>
            ) : (
              cards.map((card) => {
                const on = accepted.has(card.id);
                return (
                  <div
                    key={card.id}
                    className={cn(
                      "rounded-md border bg-card transition-colors",
                      on ? "border-primary/40" : "border-border opacity-60",
                    )}
                  >
                    <div className="flex items-center gap-2 px-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                        {card.human}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-px text-[0.625rem] tabular-nums text-muted-foreground">
                        {card.count}
                      </span>
                      <Switch
                        checked={on}
                        onCheckedChange={(v) => toggle(card.id, v)}
                        className="scale-90"
                        aria-label={`${on ? "Skip" : "Apply"} ${card.human}`}
                      />
                    </div>
                    <div className="space-y-1.5 border-t border-border px-3 py-2">
                      {card.examples.map((ex) => (
                        <CellExample
                          key={`${ex.rowId}-${ex.fieldName}`}
                          change={ex}
                        />
                      ))}
                      {card.count > card.examples.length && (
                        <div className="pt-0.5 text-[0.6875rem] text-muted-foreground">
                          + {card.count - card.examples.length} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto bg-textured px-4 py-3">
            {finalChanges.length === 0 ? (
              <div className="rounded-md border border-border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
                Nothing applied — toggle changes back on under “By type”.
              </div>
            ) : (
              finalChanges.map((change) => (
                <CellExample
                  key={`${change.rowId}-${change.fieldName}`}
                  change={change}
                />
              ))
            )}
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          <div className="ml-auto">
            <Button
              size="sm"
              className="h-8"
              disabled={!willWrite || applying}
              onClick={handleApply}
            >
              {applying
                ? "Applying…"
                : !willWrite
                  ? "Nothing applied"
                  : `Apply to ${finalChanges.length} cell${finalChanges.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
