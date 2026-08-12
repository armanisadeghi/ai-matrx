"use client";

/**
 * Plan lint — the whole-tree pre-flight card in the Setup work order.
 * DIAGNOSES only (the rungs below act); every finding names its offending
 * routes so the fix is one click away in the tree. Pure client math over the
 * already-loaded plan (`setup/lint.ts`) — re-runs automatically on refetch.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PlanNodeRow } from "../../types";
import { lintPlan, type LintFinding } from "../lint";
import { SetupSection } from "./SetupSection";

const ROUTE_CAP = 8;

const SEVERITY_STYLES: Record<LintFinding["severity"], string> = {
  error: "bg-destructive",
  warning: "bg-amber-500",
  info: "bg-muted-foreground/50",
};

export function PlanLintSection({ nodes }: { nodes: PlanNodeRow[] }) {
  const report = useMemo(() => lintPlan(nodes), [nodes]);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  if (report.nodesChecked === 0) return null;

  return (
    <SetupSection title="Plan lint">
      {report.findings.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          Clean — {report.nodesChecked} pages, no structural problems.
        </p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {report.nodesChecked} pages checked
            {report.errors > 0 ? ` · ${report.errors} blocking` : ""}
            {report.warnings > 0 ? ` · ${report.warnings} to review` : ""}
            {report.infos > 0 ? ` · ${report.infos} coverage` : ""}
          </p>
          {report.findings.map((finding) => {
            const expanded = open[finding.key] ?? false;
            const shown = expanded
              ? finding.routes.slice(0, ROUTE_CAP * 4)
              : [];
            return (
              <div key={finding.key} className="rounded border border-border">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-foreground hover:bg-muted/40"
                  onClick={() =>
                    setOpen((current) => ({
                      ...current,
                      [finding.key]: !expanded,
                    }))
                  }
                >
                  {finding.severity === "error" ? (
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  ) : (
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        SEVERITY_STYLES[finding.severity],
                      )}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">{finding.label}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {finding.count}
                  </span>
                  {finding.routes.length > 0 ? (
                    expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )
                  ) : null}
                </button>
                {expanded && shown.length > 0 ? (
                  <ul className="border-t border-border px-2 py-1.5">
                    {shown.map((route, index) => (
                      <li
                        key={`${route}-${index}`}
                        className="truncate font-mono text-xs text-muted-foreground"
                      >
                        {route}
                      </li>
                    ))}
                    {finding.routes.length > shown.length ? (
                      <li className="text-xs text-muted-foreground">
                        +{finding.routes.length - shown.length} more
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </SetupSection>
  );
}
