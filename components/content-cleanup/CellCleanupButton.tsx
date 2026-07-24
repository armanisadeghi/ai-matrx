"use client";

// CellCleanupButton — the single entry point for cleaning a set of cells.
//
// Owns the two-step flow: a popover of opt-in operations with live per-op
// counts, then a frozen report handed to the review dialog. Grid-agnostic — it
// takes rows, fields, and a write callback, so user data tables, an imported
// CSV preview, or any future record grid all reuse this one control.
//
// `loadAllRows` exists because a grid usually only holds the current PAGE.
// Cleaning what you can see and calling it done is the wrong answer, so the
// popover pulls the full set on open and scans everything.

import { useEffect, useState } from "react";
import { Eraser } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { cleanCells } from "@/lib/content-cleanup/clean-cells";
import { DEFAULT_ENABLED_VALUE_OPERATIONS } from "@/lib/content-cleanup/value-operations";
import type {
  CellsCleanupReport,
  CleanableField,
  CleanableRow,
  RowPatch,
  ValueCleanupOperationId,
} from "@/lib/content-cleanup/value-types";
import { CellCleanupOptionsPopover } from "./CellCleanupOptionsPopover";
import { CellCleanupReviewDialog } from "./CellCleanupReviewDialog";

interface CellCleanupButtonProps {
  /** Columns to scan. Non-text cells are skipped by the engine regardless. */
  fields: readonly CleanableField[];
  /** Rows already in hand (the current page) — scanned until `loadAllRows` resolves. */
  rows: readonly CleanableRow[];
  /**
   * Pull EVERY row so the scan covers the whole table, not just the page.
   * Called once each time the popover opens. Omit when `rows` is already complete.
   */
  loadAllRows?: () => Promise<CleanableRow[]>;
  /** What is being cleaned, e.g. the table name. Shown in the review header. */
  scopeLabel: string;
  /** Write the accepted patches through the consumer's canonical write path. */
  onApply: (patches: RowPatch[]) => Promise<void>;
  disabled?: boolean;
  className?: string;
  /** Show the "Clean" text label next to the icon (desktop toolbars). */
  showLabel?: boolean;
}

export function CellCleanupButton({
  fields,
  rows,
  loadAllRows,
  scopeLabel,
  onApply,
  disabled = false,
  className,
  showLabel = true,
}: CellCleanupButtonProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [enabled, setEnabled] = useState<Set<ValueCleanupOperationId>>(
    () => new Set(DEFAULT_ENABLED_VALUE_OPERATIONS),
  );
  const [allRows, setAllRows] = useState<readonly CleanableRow[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [run, setRun] = useState<{ report: CellsCleanupReport; id: number } | null>(
    null,
  );
  const [reviewOpen, setReviewOpen] = useState(false);

  // Pull the full row set whenever the popover opens. A failure is loud and
  // falls back to the page rows rather than silently reporting a clean table.
  useEffect(() => {
    if (!popoverOpen || !loadAllRows) return;
    let cancelled = false;
    setScanning(true);
    void loadAllRows()
      .then((full) => {
        if (!cancelled) setAllRows(full);
      })
      .catch((err: unknown) => {
        console.error("[cell-cleanup] failed to load full row set", err);
        toast.error(
          "Could not load every row — scanning only the rows currently loaded.",
        );
      })
      .finally(() => {
        if (!cancelled) setScanning(false);
      });
    return () => {
      cancelled = true;
      setAllRows(null);
    };
  }, [popoverOpen, loadAllRows]);

  const scanRows = allRows ?? rows;

  // Live preview while the popover is open (compiler-memoized on inputs).
  let preview: CellsCleanupReport | null = null;
  if (popoverOpen) {
    preview = cleanCells(scanRows, fields, enabled);
  }

  const onToggle = (id: ValueCleanupOperationId, on: boolean) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const onResetDefaults = () =>
    setEnabled(new Set(DEFAULT_ENABLED_VALUE_OPERATIONS));

  const onRun = () => {
    if (!preview?.changed) {
      toast.info("Nothing to clean up");
      return;
    }
    const frozen = preview;
    setRun((prev) => ({ report: frozen, id: (prev?.id ?? 0) + 1 }));
    setPopoverOpen(false);
    setReviewOpen(true);
  };

  const handleApply = async (patches: RowPatch[]) => {
    await onApply(patches);
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            title="Clean up cell content"
            className={cn(
              "whitespace-nowrap text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20",
              !showLabel && "h-7 w-7 p-0",
              className,
            )}
          >
            <Eraser className={cn("h-3.5 w-3.5", showLabel && "md:mr-1.5")} />
            {showLabel && <span className="hidden md:inline">Clean</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <CellCleanupOptionsPopover
            enabled={enabled}
            onToggle={onToggle}
            preview={preview}
            scanning={scanning}
            scopeLabel={`${scanRows.length} row${scanRows.length !== 1 ? "s" : ""}`}
            onRun={onRun}
            onResetDefaults={onResetDefaults}
          />
        </PopoverContent>
      </Popover>

      {run && (
        <CellCleanupReviewDialog
          key={run.id}
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          report={run.report}
          scopeLabel={scopeLabel}
          onApply={handleApply}
        />
      )}
    </>
  );
}
