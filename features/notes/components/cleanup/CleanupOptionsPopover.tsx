"use client";

// CleanupOptionsPopover — the opt-in step. Toggles (defaults pre-set) grouped
// into Recommended / Extra, a LIVE change-count next to each, the protected-
// content summary (the power-user warning), and a Run button. For a prose
// note with nothing structured this is a single confident click.

import { Eraser, ShieldCheck, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  CLEANUP_OPERATION_META,
} from "@/lib/content-cleanup/operations";
import type {
  CleanupOperationGroup,
  CleanupOperationId,
  CleanupReport,
} from "@/lib/content-cleanup/types";

interface CleanupOptionsPopoverProps {
  enabled: ReadonlySet<CleanupOperationId>;
  onToggle: (id: CleanupOperationId, on: boolean) => void;
  preview: CleanupReport | null;
  onRun: () => void;
  onResetDefaults: () => void;
}

const GROUP_TITLE: Record<CleanupOperationGroup, string> = {
  recommended: "Recommended",
  extra: "Extra (opinionated)",
};

function changesFor(
  preview: CleanupReport | null,
  id: CleanupOperationId,
): number {
  return preview?.operations.find((o) => o.id === id)?.changes ?? 0;
}

export function CleanupOptionsPopover({
  enabled,
  onToggle,
  preview,
  onRun,
  onResetDefaults,
}: CleanupOptionsPopoverProps) {
  const protectedCount = preview?.protectedRegions.length ?? 0;
  const reviewCount =
    preview?.protectedRegions.filter((r) => r.confidence === "likely").length ??
    0;
  const totalChanges = preview?.stats.totalChanges ?? 0;
  const willChange = preview?.changed ?? false;

  const groups: CleanupOperationGroup[] = ["recommended", "extra"];

  return (
    <div className="w-[22rem] text-sm">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Eraser className="h-4 w-4 text-primary" />
        <span className="font-medium text-foreground">Clean up content</span>
      </div>

      {/* Protection summary / power-user warning */}
      <div className="px-3 pt-2">
        {protectedCount > 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-amber-300/60 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {protectedCount} protected section
              {protectedCount !== 1 ? "s" : ""} (code, JSON, tables) will be
              preserved.
              {reviewCount > 0 ? (
                <>
                  {" "}
                  {reviewCount} {reviewCount === 1 ? "is" : "are"} a heuristic
                  match — review them in the next step.
                </>
              ) : null}
            </span>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground">
            No code, JSON, or tables detected — safe to clean.
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
              {CLEANUP_OPERATION_META.filter((m) => m.group === group).map(
                (m) => {
                  const on = enabled.has(m.id);
                  const n = changesFor(preview, m.id);
                  return (
                    <label
                      key={m.id}
                      htmlFor={`cleanup-${m.id}`}
                      className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 hover:bg-accent/50"
                    >
                      <Switch
                        id={`cleanup-${m.id}`}
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
              ~{totalChanges} edit{totalChanges !== 1 ? "s" : ""}
            </>
          ) : (
            "Already clean"
          )}
        </div>
        <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={!willChange} onClick={onRun}>
          <Eraser className="h-3.5 w-3.5" /> Clean up
        </Button>
      </div>
    </div>
  );
}
