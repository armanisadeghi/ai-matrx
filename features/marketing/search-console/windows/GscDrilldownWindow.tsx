"use client";

/**
 * The ONE generic Search Console drill-down panel — a floating WindowPanel
 * showing any (site, dimension, filters, period) slice: summary tiles, a
 * mini performance chart, and the full dimension table. Multi-instance:
 * several panels can float at once for side-by-side comparison, and a row
 * click inside a panel re-drills into ANOTHER panel (page → queries →
 * pages → …). Copy / Copy-as-JSON / Copy-for-AI in the panel header.
 */

import { useMemo, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { useOpenGscDrilldownWindow } from "@/features/overlays/openers/gscDrilldownWindow";
import { KpiBand } from "@/features/marketing/search-console/components/KpiBand";
import { PerformanceChart } from "@/features/marketing/search-console/components/PerformanceChart";
import { GscDimensionTable } from "@/features/marketing/search-console/components/GscDimensionTable";
import {
  useGscSummary,
  useGscTimeseries,
} from "@/features/marketing/search-console/hooks/useGscQuery";
import { gscSummaryCopy } from "@/features/marketing/search-console/lib/copy-payloads";
import { resolvePeriods } from "@/features/marketing/search-console/lib/url-state";
import { panelDrillFor } from "@/features/marketing/search-console/lib/drills";
import type {
  GscCompareMode,
  GscDimension,
  GscFilters,
  GscMetric,
  GscRangeKey,
} from "@/features/marketing/search-console/types";

export interface GscDrilldownWindowProps {
  onClose: () => void;
  siteId: string;
  siteName?: string | null;
  dimension: GscDimension;
  filters?: GscFilters;
  range?: GscRangeKey;
  customFrom?: string | null;
  customTo?: string | null;
  compare?: GscCompareMode;
  title?: string;
}

const DIMENSION_TITLES: Record<GscDimension, string> = {
  query: "Queries",
  page: "Pages",
  country: "Countries",
  device: "Devices",
  search_appearance: "Appearance",
};

export default function GscDrilldownWindow({
  onClose,
  siteId,
  siteName = null,
  dimension,
  filters = {},
  range = "90d",
  customFrom = null,
  customTo = null,
  compare = "none",
  title,
}: GscDrilldownWindowProps) {
  const openDrilldown = useOpenGscDrilldownWindow();
  const [visibleMetrics, setVisibleMetrics] = useState<readonly GscMetric[]>([
    "clicks",
    "impressions",
  ]);
  const periods = useMemo(
    () => resolvePeriods({ range, customFrom, customTo, compare }),
    [range, customFrom, customTo, compare],
  );
  const summary = useGscSummary(siteId, periods, filters);
  const timeseries = useGscTimeseries(siteId, periods, filters);

  const panelTitle =
    title ??
    `${DIMENSION_TITLES[dimension]} — ${siteName ?? "Search Console"}`;
  const copy = gscSummaryCopy({
    siteId,
    siteName,
    periods,
    filters,
    summary: summary.data ?? null,
  });

  return (
    <WindowPanel
      title={panelTitle}
      width={860}
      height={620}
      onClose={onClose}
      actionsRight={
        <CopyButtons
          size="xs"
          label={panelTitle}
          human={copy.human}
          agent={copy.agent}
          json={() => ({
            site_id: siteId,
            dimension,
            filters,
            period: periods,
            summary: summary.data ?? null,
          })}
        />
      }
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden bg-background p-2">
        <KpiBand
          siteId={siteId}
          siteName={siteName}
          periods={periods}
          filters={filters}
          summary={summary.data}
          isLoading={summary.isLoading}
          visibleMetrics={visibleMetrics}
          onToggleMetric={(metric) =>
            setVisibleMetrics((prev) => {
              if (prev.includes(metric)) {
                const next = prev.filter((m) => m !== metric);
                return next.length > 0 ? next : prev;
              }
              return [...prev, metric];
            })
          }
          compact
        />
        <PerformanceChart
          siteId={siteId}
          siteName={siteName}
          periods={periods}
          filters={filters}
          rows={timeseries.data ?? []}
          visibleMetrics={visibleMetrics}
          height={150}
        />
        <div className="min-h-0 flex-1">
          <GscDimensionTable
            siteId={siteId}
            siteName={siteName}
            dimension={dimension}
            periods={periods}
            filters={filters}
            copySurface={`Search Console — drill-down panel (${DIMENSION_TITLES[dimension]})`}
            pageSize={25}
            onDrill={(row) => {
              const drill = panelDrillFor(dimension, row);
              openDrilldown({
                siteId,
                siteName,
                dimension: drill.dimension,
                filters: { ...filters, ...drill.filters },
                range,
                customFrom,
                customTo,
                compare,
                title: drill.label,
              });
            }}
            drillHint="Click a row to open its breakdown in another panel"
            panelRange={{ range, customFrom, customTo, compare }}
          />
        </div>
      </div>
    </WindowPanel>
  );
}
