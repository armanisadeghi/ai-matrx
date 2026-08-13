"use client";

/**
 * features/administration/canonicalization/components/BrokenFunctionSeverityFilterBar.tsx
 *
 * Severity toggles for the broken-functions table. The page opens on `real`
 * only — that is the whole point of the 2026-08-13 classification work: this
 * table held 101 rows of which 3 signatures were genuine breakage, and the noise
 * is what let two real bugs (the ON CONFLICT 42P10 pair) hide in plain sight.
 *
 * Nothing is hidden: every severity is a chip with its live count, so the
 * quiet classes are one click away and their size is visible without clicking.
 * A row that arrives with no severity at all (written before the column existed)
 * gets its own chip rather than being silently dropped — an unclassified finding
 * is a checker bug, not a clean report.
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  BROKEN_FUNCTION_SEVERITIES,
  type BrokenFunctionSeverity,
} from "../types";

export const SEVERITY_LABELS: Record<BrokenFunctionSeverity, string> = {
  real: "Real breakage",
  advisory: "Privilege risk",
  style: "Style only",
  suppressed: "Checker artifact",
  unchecked: "Not checkable",
};

export const SEVERITY_HINTS: Record<BrokenFunctionSeverity, string> = {
  real: "Genuine runtime failure. Fix these.",
  advisory:
    "Invoker-rights function walks the catalog and builds dynamic SQL with no privilege filter — it breaks for any caller who cannot read a discovered table.",
  style:
    "plpgsql_check warnings: unused variable, IMMUTABLE-vs-STABLE, type-differs-from-source. Never a runtime failure.",
  suppressed:
    "Explained by a checker limitation (self-created temp table, runtime-built relation name, shared trigger branch, or a cascade from one of those). The reason is on the row.",
  unchecked:
    "Trigger function attached to no table — there is no row shape to check it against.",
};

/** The default view: only what a human can act on. */
export const DEFAULT_SEVERITY_FILTER: BrokenFunctionSeverity[] = ["real"];

export function BrokenFunctionSeverityFilterBar({
  value,
  onChange,
  counts,
  unclassifiedCount,
  includeUnclassified,
  onToggleUnclassified,
}: {
  value: BrokenFunctionSeverity[];
  onChange: (next: BrokenFunctionSeverity[]) => void;
  counts: Record<BrokenFunctionSeverity, number>;
  unclassifiedCount: number;
  includeUnclassified: boolean;
  onToggleUnclassified: (next: boolean) => void;
}) {
  const toggle = (severity: BrokenFunctionSeverity) => {
    onChange(
      value.includes(severity)
        ? value.filter((s) => s !== severity)
        : [...value, severity],
    );
  };

  const isDefault =
    value.length === 1 && value[0] === "real" && !includeUnclassified;

  return (
    <div className="shrink-0 border-b border-border px-4 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Severity
        </span>
        {BROKEN_FUNCTION_SEVERITIES.map((severity) => {
          const active = value.includes(severity);
          return (
            <button
              key={severity}
              type="button"
              onClick={() => toggle(severity)}
              title={SEVERITY_HINTS[severity]}
              aria-pressed={active}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors",
                active
                  ? severity === "real"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : severity === "advisory"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      : "border-primary/40 bg-primary/10 text-foreground"
                  : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {SEVERITY_LABELS[severity]}
              <span className="tabular-nums opacity-70">
                {counts[severity]}
              </span>
            </button>
          );
        })}

        {unclassifiedCount > 0 ? (
          <button
            type="button"
            onClick={() => onToggleUnclassified(!includeUnclassified)}
            title="Rows with no severity at all — written before classification existed, or a classifier gap. Treat as a checker bug."
            aria-pressed={includeUnclassified}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11px] transition-colors",
              includeUnclassified
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-border bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            Unclassified
            <span className="tabular-nums opacity-70">
              {unclassifiedCount}
            </span>
          </button>
        ) : null}

        {isDefault ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => {
              onChange(DEFAULT_SEVERITY_FILTER);
              onToggleUnclassified(false);
            }}
          >
            Reset to real only
          </Button>
        )}
      </div>
    </div>
  );
}
