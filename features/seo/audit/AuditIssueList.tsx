import { AlertTriangle, CheckCircle, OctagonAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AuditIssue } from "./types";

/**
 * AuditIssueList — the canonical renderer for deterministic audit issues
 * (errors + warnings from the social/headings/indexability evaluators).
 * Errors render destructive, warnings render warning-toned; an optional
 * success line shows when the list is clean.
 */
export function AuditIssueList({
  issues,
  successText,
  compact = false,
  className,
}: {
  issues: AuditIssue[];
  /** Rendered when there are no issues. Omit to render nothing when clean. */
  successText?: string;
  compact?: boolean;
  className?: string;
}) {
  const rowClass = compact ? "gap-2 text-xs" : "gap-2.5 text-xs";
  const iconClass = compact
    ? "mt-0.5 h-3 w-3 shrink-0"
    : "mt-0.5 h-3.5 w-3.5 shrink-0";

  if (!issues.length) {
    if (!successText) return null;
    return (
      <div className={cn("flex items-start text-success", rowClass, className)}>
        <CheckCircle className={iconClass} />
        <span>{successText}</span>
      </div>
    );
  }
  return (
    <div className={cn(compact ? "space-y-1.5" : "space-y-2.5", className)}>
      {issues.map((issue) => (
        <div
          key={issue.message}
          className={cn(
            "flex items-start",
            rowClass,
            issue.severity === "error" ? "text-destructive" : "text-warning",
          )}
        >
          {issue.severity === "error" ? (
            <OctagonAlert className={iconClass} />
          ) : (
            <AlertTriangle className={iconClass} />
          )}
          <span>{issue.message}</span>
        </div>
      ))}
    </div>
  );
}
