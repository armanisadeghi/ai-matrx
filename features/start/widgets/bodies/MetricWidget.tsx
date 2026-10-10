"use client";

// features/start/widgets/bodies/MetricWidget.tsx — one KPI: the dashboard's own count (read-only reuse of
// `useDashboardMetrics` + `METRIC_CARDS`; the dashboard feature is not edited here).
import Link from "next/link";
import { METRIC_CARDS } from "@/features/dashboard/constants/metricCards";
import { useDashboardMetrics } from "@/features/dashboard/hooks/useDashboardMetrics";
import ShellIcon from "@/features/shell/components/ShellIcon";
import type { StartWidgetBodyProps } from "../types";
import { WidgetNotice } from "../frame";

export function MetricWidget({ config }: StartWidgetBodyProps) {
  const { metrics, isLoading, isError } = useDashboardMetrics();
  const card = METRIC_CARDS.find((c) => c.key === config.metric);
  if (!card) return <WidgetNotice>{`No count named "${config.metric ?? ""}"`}</WidgetNotice>;
  const value = metrics[card.key];
  return (
    <Link href={card.href} data-clickable className="flex h-full items-center gap-3 rounded px-2 hover:bg-muted">
      <ShellIcon name={card.iconName} className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        {isLoading ? (
          <span aria-busy="true" className="block h-7 w-12 animate-pulse rounded bg-muted" />
        ) : (
          <span className="block h-7 text-2xl font-semibold leading-7 tabular-nums">
            {isError ? "—" : value.toLocaleString()}
          </span>
        )}
        <span className="block truncate text-xs text-muted-foreground">
          {isError ? "Count unavailable" : !isLoading && value === 0 ? card.emptyHint : card.label}
        </span>
      </div>
    </Link>
  );
}
