// features/admin/spend/explorer/TotalsStrip.tsx
//
// The window's numbers in one row: what it cost, how much of that someone
// asked for versus what ran on its own, how many requests and executions, and
// the tokens behind it. Tiles, not a chart — one number each.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { count, usd } from "../format";
import type { SpendBreakdown } from "../types";
import { compactNumber, percent } from "./labels";

function Tile({
  label,
  value,
  hint,
  tone = "normal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "normal" | "manual" | "automated";
}) {
  return (
    <div className="flex min-w-0 flex-col justify-between rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-1.5 truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {tone !== "normal" ? (
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-sm ${tone === "manual" ? "bg-chart-2" : "bg-chart-1"}`}
          />
        ) : null}
        {label}
      </div>
      <div className="truncate text-lg font-semibold leading-tight tabular-nums text-foreground">
        {value}
      </div>
      {hint ? <div className="truncate text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function TotalsStrip({ data }: { data: SpendBreakdown }) {
  const t = data.totals;
  // A slice filtered to one hour or one day spans that, not the whole window;
  // dividing by the window's hours would caption a $27 hour as "$0.57 per hour".
  const sliceHours = data.filters.hour ? 1 : data.filters.day ? 24 : t.hours;
  const perHour = sliceHours > 0 ? t.cost / sliceHours : 0;
  const cached = t.tokensIn + t.tokensCached > 0 ? t.tokensCached / (t.tokensIn + t.tokensCached) : 0;
  return (
    <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
      <Tile
        label="Window total"
        value={usd(t.cost)}
        hint={
          data.filters.hour
            ? `one hour · ${count(t.paidExecutions)} paid executions`
            : `${usd(perHour)} per hour · ${count(t.paidExecutions)} paid executions`
        }
      />
      <Tile
        label="Manual"
        tone="manual"
        value={usd(t.manualCost)}
        hint={`${percent(t.cost > 0 ? t.manualCost / t.cost : 0)} — a person or an API caller asked`}
      />
      <Tile
        label="Automated"
        tone="automated"
        value={usd(t.automatedCost)}
        hint={`${percent(t.cost > 0 ? t.automatedCost / t.cost : 0)} — child agents, workflows, schedules`}
      />
      <Tile
        label="Requests"
        value={count(t.requests)}
        hint={`${count(t.conversations)} conversations · ${count(t.executions)} ledger rows`}
      />
      <Tile
        label="Tokens in"
        value={compactNumber(t.tokensIn + t.tokensCached)}
        hint={`${percent(cached)} served from cache · ${compactNumber(t.tokensOut)} out`}
      />
      <Tile
        label="Explained by a request"
        value={percent(t.cost > 0 ? t.linkedCost / t.cost : 0)}
        hint={
          t.unlinkedCost > 0
            ? `${usd(t.unlinkedCost)} attributed from the execution's own context`
            : "every dollar has an app, feature and model"
        }
      />
    </div>
  );
}
