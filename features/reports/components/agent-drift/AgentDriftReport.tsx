/**
 * Agent Drift report — report #1 of the reports module.
 *
 * Desktop: master-detail. The RollupTable (one row per agent with drift) on the
 * left; selecting an agent mounts the SAME <AgentUsagesEngine> the Find Usages
 * window uses as the detail pane — zero forked detail UI. Mobile: rollup card
 * list → tap pushes the detail view with a back header.
 *
 * mode="user" reads agx_usage_report (the caller's agents); mode="admin" reads
 * agx_usage_report_admin (platform-wide). Admin gating is inherited from the
 * (admin) route layout.
 */

"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDriftReport } from "@/features/agents/hooks/useDriftReport";
import type { ReportSortKey } from "@/features/agents/redux/usages/usages.selectors";
import { AgentUsagesEngine } from "@/features/agents/components/usages/AgentUsagesEngine";
import { DriftSeverityBadge } from "@/features/agents/components/usages/DriftSeverityBadge";
import { DRIFT_SEVERITY_ORDER } from "@/features/agents/components/usages/severity";
import { RollupTable } from "./RollupTable";

export function AgentDriftReport({ mode = "user" }: { mode?: "user" | "admin" }) {
  const isMobile = useIsMobile();
  const [sort, setSort] = useState<{ key: ReportSortKey; desc: boolean }>({
    key: "breaking",
    desc: true,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const { status, error, rows, adminRows, totals, refresh } = useDriftReport(mode, sort);

  const onSort = (key: ReportSortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  const header = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2.5">
      <h1 className="text-sm font-semibold text-foreground">
        Agent Drift{mode === "admin" ? " · all users" : ""}
      </h1>
      <span className="text-xs text-muted-foreground">
        {totals.agents} agent{totals.agents !== 1 ? "s" : ""} with drift
      </span>
      <div className="flex items-center gap-1.5">
        {DRIFT_SEVERITY_ORDER.map((sev) =>
          totals.totals[sev] > 0 ? (
            <DriftSeverityBadge key={sev} severity={sev} count={totals.totals[sev]} />
          ) : null,
        )}
      </div>
      <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs" onClick={refresh}>
        {status === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />}
        Refresh
      </Button>
    </div>
  );

  if (status === "failed") {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">{error ?? "Could not load the report."}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // ── Mobile: list → push detail ──────────────────────────────────────────
  if (isMobile) {
    if (selected) {
      return (
        <div className="flex h-dvh flex-col">
          <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
            <button onClick={() => setSelected(null)} className="text-muted-foreground" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium text-foreground">Agent detail</span>
          </div>
          <div className="min-h-0 flex-1">
            <AgentUsagesEngine key={selected} agentId={selected} mode={mode} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-dvh flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {status === "loading" ? (
            <ReportSkeleton />
          ) : (
            <RollupTable
              mode={mode}
              rows={rows}
              adminRows={adminRows}
              selectedAgentId={selected}
              onSelect={setSelected}
              sort={sort}
              onSort={onSort}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Desktop: master-detail split ────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden">
      {header}
      <div className="flex min-h-0 flex-1">
        <div className="w-1/2 min-w-[360px] overflow-y-auto border-r border-border">
          {status === "loading" ? (
            <ReportSkeleton />
          ) : (
            <RollupTable
              mode={mode}
              rows={rows}
              adminRows={adminRows}
              selectedAgentId={selected}
              onSelect={setSelected}
              sort={sort}
              onSort={onSort}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {selected ? (
            <AgentUsagesEngine key={selected} agentId={selected} mode={mode} />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
              Select an agent to see its usages and drift detail.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
      ))}
    </div>
  );
}
