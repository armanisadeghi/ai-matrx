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
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDriftReport } from "@/features/agents/hooks/useDriftReport";
import type { ReportSortKey } from "@/features/agents/redux/usages/usages.selectors";
import { AgentUsagesEngine } from "@/features/agents/components/usages/AgentUsagesEngine";
import { RollupTable } from "./RollupTable";
import { AgentDriftReportHeader } from "./AgentDriftReportHeader";

export function AgentDriftReport({
  mode = "user",
}: {
  mode?: "user" | "admin";
}) {
  const isMobile = useIsMobile();
  const [sort, setSort] = useState<{ key: ReportSortKey; desc: boolean }>({
    key: "breaking",
    desc: true,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const { status, error, rows, adminRows, totals, refresh } = useDriftReport(
    mode,
    sort,
  );

  const onSort = (key: ReportSortKey) =>
    setSort((s) =>
      s.key === key ? { key, desc: !s.desc } : { key, desc: true },
    );

  const showMobileDetail = isMobile && selected !== null;
  const summary = { agents: totals.agents, totals: totals.totals };

  const body = (() => {
    if (status === "failed") {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            {error ?? "Could not load the report."}
          </p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      );
    }

    if (showMobileDetail) {
      return (
        <div className="min-h-0 flex-1">
          <AgentUsagesEngine key={selected} agentId={selected} mode={mode} />
        </div>
      );
    }

    if (isMobile) {
      return (
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
              summary={summary}
            />
          )}
        </div>
      );
    }

    return (
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
              summary={summary}
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
    );
  })();

  return (
    <>
      <AgentDriftReportHeader
        mode={mode}
        loading={status === "loading"}
        mobileDetail={showMobileDetail}
        onBackFromDetail={() => setSelected(null)}
        onRefresh={refresh}
      />

      <div
        className="flex h-full flex-col overflow-hidden"
        style={{ paddingTop: "var(--shell-header-h)" }}
      >
        {body}
      </div>
    </>
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
