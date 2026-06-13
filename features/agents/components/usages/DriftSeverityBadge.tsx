/**
 * The one severity badge — consumed by find-usages rows, the red-flags strip,
 * the drift report, the agents-page banner, and the DM chips. Driven entirely
 * by DRIFT_SEVERITY_META so retuning severity presentation is a one-file change.
 */

"use client";

import { cn } from "@/lib/utils";
import type { DriftSeverity } from "@/features/agents/redux/usages/usages.types";
import { DRIFT_SEVERITY_META } from "./severity";

interface DriftSeverityBadgeProps {
  severity: DriftSeverity;
  /** Optional count rendered after the label (e.g. "Breaking 3"). */
  count?: number;
  /** Compact = icon + count only (no label). */
  size?: "sm" | "md";
  /** Hide the label, show only icon (+ count). */
  iconOnly?: boolean;
  className?: string;
}

export function DriftSeverityBadge({
  severity,
  count,
  size = "md",
  iconOnly = false,
  className,
}: DriftSeverityBadgeProps) {
  const meta = DRIFT_SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <span
      title={meta.description}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium whitespace-nowrap",
        meta.badgeClass,
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {!iconOnly && <span>{meta.label}</span>}
      {count != null && <span className="tabular-nums opacity-90">{count}</span>}
    </span>
  );
}
