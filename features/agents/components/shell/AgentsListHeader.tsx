"use client";

import Link from "next/link";
import { useEffect } from "react";
import { FileChartColumn, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDriftAlerts } from "@/features/agents/hooks/useDriftAlerts";
import { DriftSeverityBadge } from "@/features/agents/components/usages/DriftSeverityBadge";
import {
  DRIFT_SEVERITY_META,
  sumSeverityCounts,
  worstSeverityFromCounts,
} from "@/features/agents/components/usages/severity";
import type { DriftSeverity } from "@/features/agents/redux/usages/usages.types";

const INFO_ONLY = new Set<DriftSeverity>(["info"]);

export function AgentsListHeader() {
  const { alerts, markViewed } = useDriftAlerts();

  useEffect(() => {
    for (const a of alerts) {
      if (!a.viewedAt) markViewed(a.id);
    }
  }, [alerts, markViewed]);

  const totals = sumSeverityCounts(
    alerts.map((a) => ({
      breaking: a.breakingCount,
      silent_breaking: a.silentCount,
      warning: a.warningCount,
      info: a.infoCount,
    })),
  );
  const worstSev = worstSeverityFromCounts(totals, INFO_ONLY);
  const meta = worstSev ? DRIFT_SEVERITY_META[worstSev] : null;

  return (
    <div className="flex items-center w-full gap-2 px-1">
      <Webhook className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="text-sm font-semibold text-foreground">Agents</span>

      <Button
        asChild
        variant="ghost"
        size="sm"
        className={cn(
          "ml-auto h-7 gap-1.5 px-2 text-xs",
          meta
            ? cn(
                meta.textClass,
                meta.bgClass,
                "border hover:opacity-90",
                meta.borderClass,
              )
            : "text-muted-foreground",
        )}
      >
        <Link
          href="/reports/agent-drift"
          title={meta?.description ?? "Open agent drift report"}
        >
          {worstSev ? (
            <DriftSeverityBadge
              severity={worstSev}
              count={totals[worstSev]}
              size="sm"
              iconOnly
              className="border-0 bg-transparent p-0"
            />
          ) : (
            <FileChartColumn className="h-3.5 w-3.5" />
          )}
          Drift report
        </Link>
      </Button>
    </div>
  );
}
