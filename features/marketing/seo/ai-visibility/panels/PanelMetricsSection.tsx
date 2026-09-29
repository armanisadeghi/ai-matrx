"use client";

// features/marketing/seo/ai-visibility/panels/PanelMetricsSection.tsx
//
// The six named metrics that replace the pooled "Named in answers X%" headline
// (brief: "Six named metrics replace the pooled headline").
//
// Every card shows: the display name, the value (a rate with its interval, or
// counts when there are too few question slots, or "Not set up" / "Not
// measured yet" — never 0%), the sample size, the method, and the line saying
// what the number does NOT prove — on screen, not in a tooltip.
//
// Nothing here sums, averages or pools. Each value is one server estimate for
// one stratum; "unprompted" and "we're named" sit side by side in one row.

import { useQuery } from "@tanstack/react-query";
import { EyeOff, Scale } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  InlineQueryError,
  LoadingSurface,
} from "@/features/marketing/components/shared/MarketingUi";
import { useAppDispatch } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";

import {
  aidedStatusName,
  formatComparison,
  formatMetricValue,
  groupMetrics,
  ladderRung,
  methodText,
  metricName,
  pivotByAidedStatus,
  sampleSizeText,
  stratumLabel,
  type MetricGroup,
} from "./format";
import { fetchPanelMetrics, panelQueryKeys } from "./panel-api";
import type { MetricEstimate, PanelMetrics } from "./types";

function EstimateCell({
  estimate,
  minCells,
}: {
  estimate: MetricEstimate | null;
  minCells: number;
}) {
  if (!estimate) {
    return (
      <div className="text-[11px] text-muted-foreground/70">Not asked this way</div>
    );
  }
  const text = formatMetricValue(estimate, minCells);
  return (
    <div className="min-w-0">
      <div
        className={cn(
          "font-semibold tabular-nums",
          text.kind === "rate" ? "text-base" : "text-xs",
          (text.kind === "unmeasured" || text.kind === "not_set_up") &&
            "text-muted-foreground",
        )}
      >
        {text.value}
      </div>
      {text.detail ? (
        <div className="text-[11px] leading-snug text-muted-foreground">
          {text.detail}
        </div>
      ) : null}
      {text.kind === "rate" || text.kind === "counts" ? (
        <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
          {sampleSizeText(estimate)}
        </div>
      ) : null}
      <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground/80">
        {methodText(estimate, minCells)}
      </div>
    </div>
  );
}

function MetricCard({
  group,
  minCells,
}: {
  group: MetricGroup;
  minCells: number;
}) {
  const pivot = pivotByAidedStatus(group.estimates);
  const showColumns = pivot.columns.length > 1;
  return (
    <div
      className="flex min-w-0 flex-col rounded-lg border border-border/70 bg-card"
      data-surface-value={`panel_metric_${group.metric}`}
    >
      <div className="border-b border-border/60 px-3 py-2">
        <h3 className="text-sm font-semibold">{group.displayName}</h3>
        {group.doesNotProve ? (
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            <span className="font-medium">Does not prove: </span>
            {group.doesNotProve}
          </p>
        ) : null}
      </div>
      {group.estimates.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {group.metric === "campaign_response"
            ? "Not set up — needs a campaign test designed before anything is measured."
            : "Not measured yet."}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border/60">
          {showColumns ? (
            <div
              className="grid gap-3 px-3 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              style={{
                gridTemplateColumns: `minmax(0,1.2fr) repeat(${pivot.columns.length}, minmax(0,1fr))`,
              }}
            >
              <span>Group</span>
              {pivot.columns.map((column) => (
                <span key={column ?? "none"}>
                  {aidedStatusName(column) ?? "any"}
                </span>
              ))}
            </div>
          ) : null}
          {pivot.rows.map((row) => (
            <div
              key={row.label}
              className="grid gap-3 px-3 py-2"
              style={{
                gridTemplateColumns: showColumns
                  ? `minmax(0,1.2fr) repeat(${pivot.columns.length}, minmax(0,1fr))`
                  : "minmax(0,1.2fr) minmax(0,1fr)",
              }}
            >
              <span className="min-w-0 text-[11px] leading-snug text-muted-foreground">
                {row.label}
                {!showColumns && pivot.columns[0] ? (
                  <span className="block">{aidedStatusName(pivot.columns[0])}</span>
                ) : null}
              </span>
              {row.cells.map((cell, index) => (
                <EstimateCell
                  key={pivot.columns[index] ?? `c${index}`}
                  estimate={cell}
                  minCells={minCells}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PanelMetricsBody({ data }: { data: PanelMetrics }) {
  const groups = groupMetrics(data.metrics, data.definitions ?? []);
  const [first, second, ...rest] = groups;
  return (
    <div className="flex flex-col gap-3 p-3">
      {data.conditional_note ? (
        <p className="text-xs text-muted-foreground">{data.conditional_note}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <MetricCard group={first} minCells={data.min_cells_for_rate} />
        <MetricCard group={second} minCells={data.min_cells_for_rate} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rest.map((group) => (
          <MetricCard key={group.metric} group={group} minCells={data.min_cells_for_rate} />
        ))}
      </div>

      {data.comparisons.length > 0 ? (
        <div className="rounded-lg border border-border/70 bg-card">
          <p className="border-b border-border/60 px-3 py-2 text-sm font-semibold">
            Change between waves
          </p>
          <ul className="flex flex-col divide-y divide-border/60">
            {data.comparisons.map((comparison, index) => (
              <li
                key={`${comparison.metric}-${comparison.from_wave}-${comparison.to_wave}-${index}`}
                className="px-3 py-2 text-xs"
              >
                <span className="font-medium">{metricName(comparison.metric)}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {stratumLabel(comparison.stratum, { includeAided: true })} · wave{" "}
                  {comparison.from_wave} → {comparison.to_wave}
                </span>
                <div className="mt-0.5 tabular-nums">{formatComparison(comparison)}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.unclassified_questions > 0 ? (
        <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs">
          <span className="font-medium">
            Unclassified questions: {data.unclassified_questions.toLocaleString()}
          </span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            These were typed in by hand before the panel was designed, so they
            carry no set, band or prompted state and are not counted in any
            metric above. Design this panel to replace them with classified
            questions.
          </p>
        </div>
      ) : null}

      {data.evidence_ladder.length > 0 ? (
        <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Scale className="h-3.5 w-3.5" /> What a mention here is evidence of
          </p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[11px] text-muted-foreground">
            {data.evidence_ladder.map((rung, index) => (
              <li key={index} className={cn(index === 0 && "font-medium text-foreground")}>
                {ladderRung(rung)}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function PanelMetricsSection({
  panelId,
  organizationId,
  hiddenForBlindReview,
}: {
  panelId: string;
  organizationId: string;
  /** True while a blind review (gate 3) is open — measured results stay folded. */
  hiddenForBlindReview: boolean;
}) {
  const dispatch = useAppDispatch();
  const [showAnyway, setShowAnyway] = useState(false);
  const folded = hiddenForBlindReview && !showAnyway;
  const query = useQuery({
    queryKey: panelQueryKeys.metrics(panelId),
    queryFn: () => fetchPanelMetrics(dispatch, panelId, organizationId),
    enabled: !folded,
  });

  if (folded) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <EyeOff className="h-3.5 w-3.5" />
          Measurements are folded while the question list is under review, so
          current results cannot steer which questions are kept.
        </span>
        <Button size="sm" variant="outline" onClick={() => setShowAnyway(true)}>
          Show measurements anyway
        </Button>
      </div>
    );
  }
  if (query.isPending) return <LoadingSurface label="Loading measurements…" />;
  if (query.error) {
    return (
      <InlineQueryError
        what="this panel's measurements"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return <PanelMetricsBody data={query.data} />;
}
