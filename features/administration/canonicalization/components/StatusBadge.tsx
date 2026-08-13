"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  FAIL: "border-destructive/30 bg-destructive/10 text-destructive",
  WARN: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PASS: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  SKIP: "border-border bg-muted text-muted-foreground",
};

/** Colored badge for check/gate statuses (`PASS`/`FAIL`/`WARN`/`SKIP`, case-insensitive). */
export function GateStatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status ?? "").toUpperCase();
  const style = STATUS_STYLES[key] ?? "border-border bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", style)}>
      {status ?? "—"}
    </Badge>
  );
}

const SEVERITY_STYLES: Record<string, string> = {
  real: "border-destructive/30 bg-destructive/10 text-destructive",
  advisory:
    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  style: "border-border bg-muted text-muted-foreground",
  suppressed: "border-border bg-muted text-muted-foreground",
  unchecked: "border-border bg-muted text-muted-foreground",
};

/**
 * Colored badge for a `audit.broken_functions` severity. Only `real` reads as a
 * defect — everything else is deliberately quiet, because that is the whole
 * point of the classification (see BrokenFunctionSeverity in ../types).
 */
export function SeverityBadge({
  severity,
}: {
  severity: string | null | undefined;
}) {
  const key = (severity ?? "").toLowerCase();
  const style = SEVERITY_STYLES[key] ?? "border-border bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("font-mono text-[10px]", style)}>
      {severity ?? "unclassified"}
    </Badge>
  );
}

/** Colored badge for a boolean flag, with configurable good/bad polarity. */
export function BoolBadge({
  value,
  trueLabel = "Yes",
  falseLabel = "No",
  invert = false,
}: {
  value: boolean | null | undefined;
  trueLabel?: string;
  falseLabel?: string;
  /** When true, `true` renders as the "bad" (destructive) color — e.g. currently_broken. */
  invert?: boolean;
}) {
  if (value == null) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        —
      </Badge>
    );
  }
  const isGood = invert ? !value : value;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px]",
        isGood
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-destructive/30 bg-destructive/10 text-destructive",
      )}
    >
      {value ? trueLabel : falseLabel}
    </Badge>
  );
}
