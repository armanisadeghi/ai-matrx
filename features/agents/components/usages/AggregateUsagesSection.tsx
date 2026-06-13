/**
 * Others' usages, aggregated (user scope only). Counts per usage_type with
 * red-flag badges — no ids/labels, because deciding for someone else is not
 * the point. Org-managed-by-someone-else cards offer "Notify managers".
 */

"use client";

import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentUsageAggregate } from "@/features/agents/redux/usages/usages.types";
import { DriftSeverityBadge } from "./DriftSeverityBadge";
import { usageTypeMeta } from "./usageTypeMeta";

interface AggregateUsagesSectionProps {
  aggregates: AgentUsageAggregate[];
  onNotifyOrg?: (agg: AgentUsageAggregate) => void;
}

export function AggregateUsagesSection({ aggregates, onNotifyOrg }: AggregateUsagesSectionProps) {
  if (aggregates.length === 0) return null;

  const total = aggregates.reduce((n, a) => n + a.count, 0);

  return (
    <section className="border-t border-border">
      <header className="flex items-center gap-2 bg-muted/30 px-3 py-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <span className="text-xs font-semibold text-foreground">Used by others</span>
        <span className="text-xs text-muted-foreground">{total}</span>
      </header>
      <p className="px-3 pt-2 text-[11px] text-muted-foreground">
        Aggregate counts only — you can see that your change has blast radius, without acting on
        anyone else&apos;s behalf.
      </p>
      <div className="grid gap-2 p-3 sm:grid-cols-2">
        {aggregates.map((agg, i) => {
          const meta = usageTypeMeta(agg.usageType);
          const Icon = meta.icon;
          const canNotify = onNotifyOrg && agg.orgManagerUserIds.length > 0;
          return (
            <div
              key={`${agg.usageType}:${agg.organizationId ?? "none"}:${i}`}
              className="rounded-md border border-border bg-card/60 p-2.5"
            >
              <div className="flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <span className="text-xs font-medium text-foreground">{meta.plural}</span>
                <span className="text-xs text-muted-foreground">{agg.count}</span>
                {agg.organizationName && (
                  <span className="text-[11px] text-muted-foreground">· {agg.organizationName}</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                {agg.breaking > 0 && <DriftSeverityBadge severity="breaking" size="sm" count={agg.breaking} />}
                {agg.silentBreaking > 0 && (
                  <DriftSeverityBadge severity="silent_breaking" size="sm" count={agg.silentBreaking} />
                )}
                {agg.warning > 0 && <DriftSeverityBadge severity="warning" size="sm" count={agg.warning} />}
                {agg.breaking + agg.silentBreaking + agg.warning === 0 && (
                  <span className="text-[11px] text-muted-foreground">No red flags</span>
                )}
              </div>
              {canNotify && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-1.5 h-6 px-2 text-[11px]"
                  onClick={() => onNotifyOrg?.(agg)}
                >
                  Notify org managers
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
