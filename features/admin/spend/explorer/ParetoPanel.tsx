// features/admin/spend/explorer/ParetoPanel.tsx
//
// THE 80/20 VIEW (Arman, 2026-09-12: "pages where they show you the eighty
// twenty rule that tells you where's eighty percent of your spending going …
// if you show everything that adds up to eighty percent in total, it would be
// a few entries, and then everything else could be summed up as other").
//
// For each dimension: 3–6 top rows, stopping once they reach 80%, then ONE
// fixed-bottom "everything else" row. Every row drills; every identity opens.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { usd } from "../format";
import type {
  SpendBreakdown,
  SpendDimension,
  SpendDimensionRow,
} from "../types";
import { DIMENSION_LABEL, identityHref, rowLabel } from "./labels";
import {
  buildSpendLeadingKpis,
  type SpendLeadingKpis,
} from "./TotalsStrip";
import { formatPercentFromFraction } from "@ai-matrx/kit/format";

const PARETO_DIMENSIONS: readonly SpendDimension[] = [
  "user",
  "session",
  "agent",
  "feature",
  "conversation",
  "model",
  "organization",
];

export interface ParetoCut {
  head: SpendDimensionRow[];
  headCost: number;
  restCost: number;
  restCount: number;
  distinct: number;
}

export interface ParetoParentContext {
  selectedWindow: string;
  window: SpendBreakdown["window"];
  filters: SpendBreakdown["filters"];
  leadingKpis: SpendLeadingKpis;
}

export function paretoCopyData(
  dim: SpendDimension,
  cut: ParetoCut,
  total: number,
  parent: ParetoParentContext,
) {
  return {
    parent,
    dimension: DIMENSION_LABEL[dim],
    windowTotal: total,
    shownCount: cut.head.length,
    distinctCount: cut.distinct,
    shownShare: total > 0 ? cut.headCost / total : 0,
    rows: cut.head.map((row) => ({
      key: row.key,
      label: rowLabel(dim, row),
      cost: row.cost,
      share: row.share,
    })),
    everythingElse: {
      count: cut.restCount,
      cost: cut.restCost,
      share: total > 0 ? cut.restCost / total : 0,
    },
  };
}

export function paretoCopyText(
  dim: SpendDimension,
  cut: ParetoCut,
  total: number,
  parent: ParetoParentContext,
): string {
  const data = paretoCopyData(dim, cut, total, parent);
  const activeFilters = Object.entries(parent.filters)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ");
  const kpis = parent.leadingKpis;
  return [
    "AI Matrx Admin — Platform Spend",
    `Window: ${parent.selectedWindow}`,
    `Filters: ${activeFilters || "None"}`,
    `Window total: ${kpis.windowTotal.value} · ${kpis.windowTotal.hint}`,
    `Manual: ${kpis.manual.value} · ${kpis.manual.hint}`,
    `Automated: ${kpis.automated.value} · ${kpis.automated.hint}`,
    `Requests: ${kpis.requests.value} · ${kpis.requests.hint}`,
    `Tokens in: ${kpis.tokensIn.value} · ${kpis.tokensIn.hint}`,
    `Explained by a request: ${kpis.explainedByRequest.value} · ${kpis.explainedByRequest.hint}`,
    "",
    `${data.dimension} — 80% of spend`,
    `${data.shownCount} of ${data.distinctCount} shown · ${formatPercentFromFraction(data.shownShare)} · Total ${usd(data.windowTotal)}`,
    ...data.rows.map(
      (row) => `${row.label}\t${formatPercentFromFraction(row.share)}\t${usd(row.cost)}`,
    ),
    `Everything else (${data.everythingElse.count} more)\t${formatPercentFromFraction(data.everythingElse.share)}\t${usd(data.everythingElse.cost)}`,
  ].join("\n");
}

export function paretoAgentPayload(
  dim: SpendDimension,
  cut: ParetoCut,
  total: number,
  totals: SpendBreakdown["totals"],
  parent: ParetoParentContext,
) {
  const kpis = parent.leadingKpis;
  const tokenInputTotal = totals.tokensIn + totals.tokensCached;
  const sliceHours = parent.filters.hour
    ? 1
    : parent.filters.day
      ? 24
      : totals.hours;
  return {
    kind: "spend-pareto-dimension",
    location: "AI Matrx Admin — Platform Spend — 80% of spend",
    description: `The rendered ${DIMENSION_LABEL[dim].toLowerCase()} concentration card for the selected spend window.`,
    data: paretoCopyData(dim, cut, total, parent),
    summary: paretoCopyText(dim, cut, total, parent),
    context: {
      selected_window: parent.selectedWindow,
      window_from: parent.window.from,
      window_to: parent.window.to,
      window_hours: parent.window.hours,
      filters: JSON.stringify(parent.filters),
      leading_kpis: JSON.stringify(parent.leadingKpis),
    },
    attributes: {
      dimension: dim,
      shown: cut.head.length,
      distinct: cut.distinct,
      total_cost: total,
      per_hour_cost: sliceHours > 0 ? totals.cost / sliceHours : 0,
      requests: totals.requests,
      conversations: totals.conversations,
      executions: totals.executions,
      paid_executions: totals.paidExecutions,
      tokens_in: tokenInputTotal,
      tokens_cached: totals.tokensCached,
      token_cache_share:
        tokenInputTotal > 0 ? totals.tokensCached / tokenInputTotal : 0,
      tokens_out: totals.tokensOut,
      manual_cost: totals.manualCost,
      manual_share: totals.cost > 0 ? totals.manualCost / totals.cost : 0,
      automated_cost: totals.automatedCost,
      automated_share:
        totals.cost > 0 ? totals.automatedCost / totals.cost : 0,
      linked_cost: totals.linkedCost,
      unlinked_cost: totals.unlinkedCost,
      explained_share: totals.cost > 0 ? totals.linkedCost / totals.cost : 0,
      window_total_display: kpis.windowTotal.value,
      window_total_detail: kpis.windowTotal.hint,
      manual_display: kpis.manual.value,
      manual_detail: kpis.manual.hint,
      automated_display: kpis.automated.value,
      automated_detail: kpis.automated.hint,
      requests_display: kpis.requests.value,
      requests_detail: kpis.requests.hint,
      tokens_in_display: kpis.tokensIn.value,
      tokens_in_detail: kpis.tokensIn.hint,
      explained_by_request_display: kpis.explainedByRequest.value,
      explained_by_request_detail: kpis.explainedByRequest.hint,
    },
  };
}

/** The fewest top rows whose cumulative share reaches `target`. */
export function paretoCut(
  rows: SpendDimensionRow[],
  distinct: number,
  total: number,
  target = 0.8,
  minItems = 3,
  maxItems = 6,
): ParetoCut {
  const sorted = [...rows].sort((a, b) => b.cost - a.cost);
  const head: SpendDimensionRow[] = [];
  let headCost = 0;
  for (const row of sorted) {
    if (head.length >= maxItems) break;
    if (head.length >= minItems && total > 0 && headCost / total >= target)
      break;
    head.push(row);
    headCost += row.cost;
  }
  // "Everything else" is the total minus the head — it includes the rows the
  // RPC capped away, so the shares always add up to the window.
  const restCost = Math.max(0, total - headCost);
  const restCount = Math.max(0, distinct - head.length);
  return { head, headCost, restCost, restCount, distinct };
}

function ParetoCard({
  dim,
  cut,
  total,
  totals,
  parent,
  onDrill,
}: {
  dim: SpendDimension;
  cut: ParetoCut;
  total: number;
  totals: SpendBreakdown["totals"];
  parent: ParetoParentContext;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const headShare = total > 0 ? cut.headCost / total : 0;
  return (
    <div className="flex min-w-0 flex-col rounded-md border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <span className="text-sm font-semibold text-foreground">
          {DIMENSION_LABEL[dim]}
        </span>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
          <span className="truncate">
            {cut.head.length} of {cut.distinct} · {formatPercentFromFraction(headShare)}
          </span>
          <span className="shrink-0 font-medium text-foreground">
            Total {usd(total)}
          </span>
          <CopyButtons
            size="xs"
            className="shrink-0"
            label={`${DIMENSION_LABEL[dim]} — 80% of spend`}
            human={() => paretoCopyText(dim, cut, total, parent)}
            json={() => paretoCopyData(dim, cut, total, parent)}
            agent={() =>
              paretoAgentPayload(dim, cut, total, totals, parent)
            }
          />
        </div>
      </div>
      <ul className="flex h-full flex-col">
        {cut.head.map((row) => {
          const href = identityHref(dim, row.key);
          const label = rowLabel(dim, row);
          return (
            <li
              key={row.key}
              className="group relative flex items-center gap-2 px-3 py-1"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0.5 left-0 rounded-r-sm bg-primary/10"
                style={{ width: `${Math.max(0.5, row.share * 100)}%` }}
              />
              <button
                type="button"
                onClick={() => onDrill(dim, row.key)}
                className="relative min-w-0 flex-1 truncate text-left text-xs text-foreground hover:underline"
                title={`Look only at ${label}`}
              >
                {label}
              </button>
              <span className="relative w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                {formatPercentFromFraction(row.share)}
              </span>
              <span className="relative w-16 shrink-0 text-right text-xs font-medium tabular-nums text-foreground">
                {usd(row.cost)}
              </span>
              {href ? (
                <Link
                  href={href}
                  className="relative shrink-0 text-muted-foreground opacity-0 hover:text-primary group-hover:opacity-100"
                  title="Open"
                  aria-label={`Open ${label}`}
                   target="_blank"
                   rel="noopener noreferrer"
                 >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                <span className="relative h-3 w-3 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
        <li className="mt-auto flex items-center gap-2 border-t border-dashed border-border px-3 py-1 text-[11px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate">
            Everything else ({cut.restCount} more)
          </span>
          <span className="w-10 shrink-0 text-right tabular-nums">
            {formatPercentFromFraction(total > 0 ? cut.restCost / total : 0)}
          </span>
          <span className="w-16 shrink-0 text-right tabular-nums">
            {usd(cut.restCost)}
          </span>
          <span className="h-3 w-3 shrink-0" aria-hidden />
        </li>
        {cut.head.length === 0 ? (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            Nothing in this window.
          </li>
        ) : null}
      </ul>
    </div>
  );
}

export function ParetoPanel({
  data,
  windowLabel,
  onDrill,
}: {
  data: SpendBreakdown;
  windowLabel: string;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const total = data.totals.cost;
  const parent: ParetoParentContext = {
    selectedWindow: windowLabel,
    window: data.window,
    filters: data.filters,
    leadingKpis: buildSpendLeadingKpis(data),
  };
  // A dimension already filtered to one value has nothing to say here.
  const dims = PARETO_DIMENSIONS.filter((dim) => !data.filters[dim]);
  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {dims.map((dim) => {
        const d = data.dimensions[dim];
        const cut = paretoCut(d.rows, d.distinct, total);
        return (
          <ParetoCard
            key={dim}
            dim={dim}
            cut={cut}
            total={total}
            totals={data.totals}
            parent={parent}
            onDrill={onDrill}
          />
        );
      })}
    </div>
  );
}
