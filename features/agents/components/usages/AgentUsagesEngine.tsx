/**
 * AgentUsagesEngine — the shared engine behind the Find Usages window, the
 * Find Usages (Admin) window, and the drift-report detail pane. One component,
 * two modes (user | admin); no forked variants.
 *
 * Render order: red-flags strip FIRST (resolution of every flag), then the
 * admin filter bar (admin mode), then usage rows grouped by type, then others'
 * aggregate usages (user mode), then historical context (muted, lazy).
 */

"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { useAgentUsages } from "@/features/agents/hooks/useAgentUsages";
import {
  makeSelectFilteredAdminRows,
  type AdminUsageFilters,
} from "@/features/agents/redux/usages/usages.selectors";
import type { UsageScope } from "@/features/agents/redux/usages/usages.slice";
import type {
  AgentUsageAggregate,
  AgentUsageRow,
} from "@/features/agents/redux/usages/usages.types";
import { RedFlagsStrip } from "./RedFlagsStrip";
import { UsageGroupList } from "./UsageGroupList";
import { UsageFiltersBar } from "./UsageFiltersBar";
import { AggregateUsagesSection } from "./AggregateUsagesSection";
import { UsageHistoricalContext } from "./UsageHistoricalContext";
import { NotifyOwnerDialog, type NotifyTarget } from "./NotifyOwnerDialog";

interface AgentUsagesEngineProps {
  agentId: string;
  mode: UsageScope;
}

export function AgentUsagesEngine({ agentId, mode }: AgentUsagesEngineProps) {
  const { status, error, groups, aggregates, summary, refresh } = useAgentUsages(agentId, mode);
  const [filters, setFilters] = useState<AdminUsageFilters>({});
  const [notify, setNotify] = useState<NotifyTarget | null>(null);

  const allRows = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Admin filtering happens client-side over the fetched rows.
  const selectFiltered = useMemo(
    () => makeSelectFilteredAdminRows(agentId, filters),
    [agentId, filters],
  );
  const filteredAdminRows = useAppSelector(selectFiltered);
  const rows = mode === "admin" ? filteredAdminRows : allRows;

  const agentName = allRows[0]?.agentName ?? aggregates[0]?.agentName ?? "this agent";

  const openNotifyRow = (row: AgentUsageRow) => {
    setNotify({
      recipientIds: row.ownerUserId ? [row.ownerUserId] : row.orgManagerUserIds,
      contextLabel: agentName,
      drift: {
        agentId: row.agentId,
        agentName: row.agentName,
        currentVersion: row.currentVersion,
        breakingCount: row.worstSeverity === "breaking" ? 1 : 0,
        silentCount: row.worstSeverity === "silent_breaking" ? 1 : 0,
        severity: row.worstSeverity,
        usageType: row.usageType,
        usageId: row.usageId,
        usageLabel: row.label,
      },
    });
  };

  const openNotifyOrg = (agg: AgentUsageAggregate) => {
    setNotify({
      recipientIds: agg.orgManagerUserIds,
      contextLabel: `${agg.organizationName ?? "an organization"} (${agentName})`,
      drift: {
        agentId: agg.agentId,
        agentName: agg.agentName,
        currentVersion: agg.currentVersion,
        breakingCount: agg.breaking,
        silentCount: agg.silentBreaking,
        warningCount: agg.warning,
        severity: agg.worstSeverity,
      },
    });
  };

  const openInformAll = () => {
    const owners = Array.from(
      new Set(rows.map((r) => r.ownerUserId).filter((id): id is string => !!id)),
    );
    setNotify({
      recipientIds: owners,
      contextLabel: "all affected users",
      drift: {
        agentId,
        agentName,
        currentVersion: allRows[0]?.currentVersion,
        breakingCount: summary.bySeverity.breaking,
        silentCount: summary.bySeverity.silent_breaking,
        warningCount: summary.bySeverity.warning,
      },
    });
  };

  const affectedUsers = useMemo(
    () => new Set(rows.map((r) => r.ownerUserId).filter(Boolean)).size,
    [rows],
  );

  if (status === "loading" || status === "idle") {
    return <EngineSkeleton />;
  }

  if (status === "failed") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <AlertTriangle className="h-7 w-7 text-destructive" aria-hidden />
        <p className="text-sm text-muted-foreground">{error ?? "Could not load usages."}</p>
        <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
          <RotateCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <RedFlagsStrip agentId={agentId} scope={mode} summary={summary} />

      {mode === "admin" && (
        <UsageFiltersBar
          allRows={allRows}
          filters={filters}
          onChange={setFilters}
          onInformAll={openInformAll}
          affectedUserCount={affectedUsers}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <UsageGroupList
          rows={rows}
          scope={mode}
          showOwner={mode === "admin"}
          onNotify={openNotifyRow}
        />
        {mode === "user" && (
          <AggregateUsagesSection aggregates={aggregates} onNotifyOrg={openNotifyOrg} />
        )}
        <UsageHistoricalContext agentId={agentId} />
      </div>

      <NotifyOwnerDialog open={!!notify} target={notify} onClose={() => setNotify(null)} />
    </div>
  );
}

function EngineSkeleton() {
  return (
    <div className="space-y-2 p-3">
      <div className="h-9 animate-pulse rounded-md bg-muted/60" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-muted/40" />
      ))}
    </div>
  );
}
