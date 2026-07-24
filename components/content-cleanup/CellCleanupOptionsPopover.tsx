"use client";

// CellCleanupOptionsPopover — the opt-in step for VALUE cleanup across a set of
// cells. Toggles (defaults pre-set) grouped Recommended / Extra, each with a
// LIVE count of how many cells that operation would change, and a Run button.
//
// Generic on purpose: it renders the registry and a report, nothing else. Any
// grid — user data tables, an imported CSV preview, a scraped record set — gets
// the same control surface by handing it a report.

import { Eraser, RotateCcw, Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { VALUE_CLEANUP_OPERATION_META } from "@/lib/content-cleanup/value-operations";
import type {
  CellsCleanupReport,
  ValueCleanupOperationGroup,
  ValueCleanupOperationId,
} from "@/lib/content-cleanup/value-types";

interface CellCleanupOptionsPopoverProps {
  enabled: ReadonlySet<ValueCleanupOperationId>;
  onToggle: (id: ValueCleanupOperationId, on: boolean) => void;
  preview: CellsCleanupReport | null;
  /** True while the full data set is still being pulled for the scan. */
  scanning?: boolean;
  /** How the scanned scope is described, e.g. "28 rows". */
  scopeLabel?: string;
  onRun: () => void;
  onResetDefaults: () => void;
}

const GROUP_TITLE: Record<ValueCleanupOperationGroup, string> = {
  recommended: "Recommended",
  extra: "Extra (opinionated)",
};

function changesFor(
  preview: CellsCleanupReport | null,
  id: ValueCleanupOperationId,
): number {
  return preview?.operations.find((o) => o.id === id)?.changes ?? 0;
}

export function CellCleanupOptionsPopover({
  enabled,
  onToggle,
  preview,
  scanning = false,
  scopeLabel,
  onRun,
  onResetDefaults,
}: CellCleanupOptionsPopoverProps) {
  const cellsChanged = preview?.stats.cellsChanged ?? 0;
  const rowsChanged = preview?.stats.rowsChanged ?? 0;
  const willChange = preview?.changed ?? false;

  const groups: ValueCleanupOperationGroup[] = ["recommended", "extra"];

  return (
    <div className="w-[22rem] text-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Eraser className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">Clean up cells</span>
        {scopeLabel ? (
          <span className="ml-auto text-[0.6875rem] text-muted-foreground">
            {scopeLabel}
          </span>
        ) : null}
      </div>

      {/* Scope summary */}
      <div className="px-3 pt-2">
        {scanning ? (
          <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
            Scanning every row…
          </div>
        ) : willChange ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs text-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              {cellsChanged} cell{cellsChanged !== 1 ? "s" : ""} across{" "}
              {rowsChanged} row{rowsChanged !== 1 ? "s" : ""} would change. Only
              text cells are touched; numbers, dates and JSON are left alone.
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
            Nothing to clean with these options.
          </div>
        )}
      </div>

      {/* Operation toggles */}
      <div className="max-h-[20rem] overflow-y-auto px-3 py-2">
        {groups.map((group) => (
          <div key={group} className="mb-2 last:mb-0">
            <div className="mb-1 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {GROUP_TITLE[group]}
            </div>
            <div className="space-y-0.5">
              {VALUE_CLEANUP_OPERATION_META.filter((m) => m.group === group).map(
                (m) => {
                  const on = enabled.has(m.id);
                  const n = changesFor(preview, m.id);
                  return (
                    <label
                      key={m.id}
                      htmlFor={`cell-cleanup-${m.id}`}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
                    >
                      <Switch
                        id={`cell-cleanup-${m.id}`}
                        checked={on}
                        onCheckedChange={(v) => onToggle(m.id, v)}
                        className="mt-0.5 scale-90"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground">
                            {m.label}
                          </span>
                          {on && n > 0 && (
                            <span className="rounded bg-primary/10 px-1 text-[0.5625rem] font-medium tabular-nums text-primary">
                              {n}
                            </span>
                          )}
                        </div>
                        <div className="text-[0.6875rem] leading-snug text-muted-foreground">
                          {m.description}
                        </div>
                      </div>
                    </label>
                  );
                },
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onResetDefaults}
          className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" /> Defaults
        </button>
        <div className="ml-auto text-[0.6875rem] text-muted-foreground">
          {willChange ? (
            <>
              {cellsChanged} cell{cellsChanged !== 1 ? "s" : ""}
            </>
          ) : (
            "Already clean"
          )}
        </div>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={!willChange || scanning}
          onClick={onRun}
        >
          <Eraser className="h-3.5 w-3.5" /> Review
        </Button>
      </div>
    </div>
  );
}
