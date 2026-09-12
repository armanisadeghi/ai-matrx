// features/admin/spend/explorer/DigHerePanel.tsx
//
// "Dig here": one summary table — signal, cost, share, count — and, under any
// row you open, the detail table for that signal with numeric columns. No
// sentences on screen; the definition of each signal and the line it is
// measured against live in the row's tooltip and in FEATURE.md.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";

import { timestamp, usd } from "../format";
import type { SpendBreakdown, SpendDimension } from "../types";
import { compactNumber, percent, shortLocal } from "./labels";

type Cell = React.ReactNode;

interface SignalSpec {
  key: string;
  title: string;
  /** The definition + threshold, tooltip only. */
  tooltip: string;
  cost: number;
  n: number;
  /** Rows the RPC returned (capped); `n` may exceed this. */
  listed: number;
  columns: string[];
  /** Numeric columns get right alignment. */
  numeric: boolean[];
  rows: Array<{ id: string; cells: Cell[]; href?: string | null; onDrill?: () => void }>;
}

function DrillCell({ label, onDrill }: { label: string; onDrill?: () => void }) {
  if (!onDrill) return <span className="truncate">{label}</span>;
  return (
    <button
      type="button"
      onClick={onDrill}
      className="block max-w-full truncate text-left hover:underline"
    >
      {label}
    </button>
  );
}

function DetailTable({ spec }: { spec: SignalSpec }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-[11px] text-muted-foreground">
          {spec.columns.map((c, i) => (
            <th
              key={c}
              className={`px-2 py-1 font-medium ${spec.numeric[i] ? "text-right" : "text-left"}`}
            >
              {c}
            </th>
          ))}
          <th className="w-6" />
        </tr>
      </thead>
      <tbody>
        {spec.rows.map((r) => (
          <tr key={r.id} className="border-b border-border/60 last:border-0">
            {r.cells.map((cell, i) => (
              <td
                key={i}
                className={`max-w-[22rem] px-2 py-1 ${spec.numeric[i] ? "text-right tabular-nums" : "truncate"}`}
              >
                {cell}
              </td>
            ))}
            <td className="px-1 py-1">
              {r.href ? (
                <Link
                  href={r.href}
                  className="text-muted-foreground hover:text-primary"
                  aria-label="Open"
                >
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
            </td>
          </tr>
        ))}
        {spec.n > spec.listed ? (
          <tr>
            <td
              colSpan={spec.columns.length + 1}
              className="px-2 py-1 text-[11px] tabular-nums text-muted-foreground"
            >
              {spec.listed} of {spec.n} listed
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export function DigHerePanel({
  data,
  onDrill,
}: {
  data: SpendBreakdown;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const s = data.signals;
  const total = data.totals.cost;
  const [open, setOpen] = useState<string | null>(null);

  const specs: SignalSpec[] = [
    {
      key: "hogs",
      title: "Conversation hogs",
      tooltip: `One conversation ≥ ${s.conversationHogs.threshold}% of the window`,
      cost: s.conversationHogs.cost,
      n: s.conversationHogs.n,
      listed: s.conversationHogs.rows.length,
      columns: ["Conversation", "Person", "Agent", "Trigger", "Requests", "Share", "Cost"],
      numeric: [false, false, false, false, true, true, true],
      rows: s.conversationHogs.rows.map((r) => ({
        id: r.conversationId,
        href: `/chat/${r.conversationId}`,
        cells: [
          <DrillCell
            key="c"
            label={r.conversation ?? "Untitled"}
            onDrill={() => onDrill("conversation", r.conversationId)}
          />,
          r.user ?? "—",
          r.agent ?? "—",
          r.trigger ?? "—",
          r.requests,
          percent(r.share),
          usd(r.cost),
        ],
      })),
    },
    {
      key: "context",
      title: "Context-heavy conversations",
      tooltip: `≥ ${compactNumber(s.contextHeavy.threshold)} tokens of context per model call`,
      cost: s.contextHeavy.cost,
      n: s.contextHeavy.n,
      listed: s.contextHeavy.rows.length,
      columns: ["Conversation", "Person", "Agent", "Tokens / call", "Calls", "Requests", "Cost"],
      numeric: [false, false, false, true, true, true, true],
      rows: s.contextHeavy.rows.map((r) => ({
        id: r.conversationId,
        href: `/chat/${r.conversationId}`,
        cells: [
          <DrillCell
            key="c"
            label={r.conversation ?? "Untitled"}
            onDrill={() => onDrill("conversation", r.conversationId)}
          />,
          r.user ?? "—",
          r.agent ?? "—",
          compactNumber(r.avgContext),
          r.calls,
          r.requests,
          usd(r.cost),
        ],
      })),
    },
    {
      key: "iterations",
      title: "Looped requests",
      tooltip: `≥ ${s.iterationHeavy.threshold} model calls in one request`,
      cost: s.iterationHeavy.cost,
      n: s.iterationHeavy.n,
      listed: s.iterationHeavy.rows.length,
      columns: ["When", "Conversation", "Person", "Agent", "Calls", "Tools", "Cost"],
      numeric: [false, false, false, false, true, true, true],
      rows: s.iterationHeavy.rows.map((r) => ({
        id: r.requestId,
        href: r.conversationId ? `/chat/${r.conversationId}` : null,
        cells: [
          timestamp(r.at),
          <DrillCell
            key="c"
            label={r.conversation ?? r.feature ?? "—"}
            onDrill={
              r.conversationId
                ? () => onDrill("conversation", r.conversationId ?? "")
                : undefined
            }
          />,
          r.user ?? "—",
          r.agent ?? "—",
          r.iterations,
          r.toolCalls,
          usd(r.cost),
        ],
      })),
    },
    {
      key: "failed",
      title: "Failed / truncated",
      tooltip: "Requests that failed, were abandoned, or hit max_tokens",
      cost: s.failedSpend.cost,
      n: s.failedSpend.n,
      listed: s.failedSpend.rows.length,
      columns: ["When", "Outcome", "Conversation", "Person", "Agent", "Cost"],
      numeric: [false, false, false, false, false, true],
      rows: s.failedSpend.rows.map((r) => ({
        id: r.requestId,
        href: r.conversationId ? `/chat/${r.conversationId}` : null,
        cells: [
          timestamp(r.at),
          `${r.status ?? "?"}${r.finishReason ? ` · ${r.finishReason}` : ""}`,
          <DrillCell
            key="c"
            label={r.conversation ?? r.feature ?? "—"}
            onDrill={
              r.conversationId
                ? () => onDrill("conversation", r.conversationId ?? "")
                : undefined
            }
          />,
          r.user ?? "—",
          r.agent ?? "—",
          usd(r.cost),
        ],
      })),
    },
    {
      key: "spikes",
      title: "Spike hours",
      tooltip: `> ${s.spikeHours.threshold}× the median hour (${usd(s.spikeHours.medianHour)})`,
      cost: s.spikeHours.cost,
      n: s.spikeHours.n,
      listed: s.spikeHours.rows.length,
      columns: ["Hour", "× median", "Executions", "Top person", "Top feature", "Cost"],
      numeric: [false, true, true, false, false, true],
      rows: s.spikeHours.rows.map((r) => ({
        id: r.hour,
        cells: [
          <DrillCell key="h" label={shortLocal(r.hour)} onDrill={() => onDrill("hour", r.hour)} />,
          r.multiple ?? "—",
          r.n,
          r.topUser ?? "—",
          r.topFeature ?? "—",
          usd(r.cost),
        ],
      })),
    },
    {
      key: "bursts",
      title: "Repeat bursts",
      tooltip: `≥ ${s.repeatBursts.threshold} requests from one person + agent + feature in 10 minutes`,
      cost: s.repeatBursts.cost,
      n: s.repeatBursts.n,
      listed: s.repeatBursts.rows.length,
      columns: ["When", "Person", "Agent", "Feature", "Trigger", "Requests", "Cost"],
      numeric: [false, false, false, false, false, true, true],
      rows: s.repeatBursts.rows.map((r) => ({
        id: `${r.bucket}-${r.user}-${r.agent}-${r.feature}`,
        cells: [
          timestamp(r.bucket),
          r.user ?? "—",
          r.agent ?? "—",
          r.feature ?? "—",
          r.trigger ?? "—",
          r.requests,
          usd(r.cost),
        ],
      })),
    },
    {
      key: "unpriced",
      title: "Unpriced model calls",
      tooltip: "API calls with no price on file — under-counted by an unknown amount",
      cost: 0,
      n: s.unpriced.n,
      listed: s.unpriced.n > 0 ? 1 : 0,
      columns: ["Calls", "Requests"],
      numeric: [true, true],
      rows:
        s.unpriced.n > 0
          ? [{ id: "unpriced", cells: [s.unpriced.n, s.unpriced.requests] }]
          : [],
    },
  ];

  specs.sort((a, b) => b.cost - a.cost);

  return (
    <div className="overflow-x-auto rounded-md border border-border bg-card">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-[11px] text-muted-foreground">
            <th className="w-6" />
            <th className="px-2 py-1.5 text-left font-medium">Signal</th>
            <th className="px-2 py-1.5 text-right font-medium">Cost</th>
            <th className="px-2 py-1.5 text-right font-medium">Share</th>
            <th className="px-2 py-1.5 text-right font-medium">Count</th>
          </tr>
        </thead>
        <tbody>
          {specs.map((spec) => {
            const isOpen = open === spec.key;
            const share = total > 0 ? spec.cost / total : 0;
            const hot = share >= 0.25;
            const empty = spec.n === 0;
            return (
              <SignalRows
                key={spec.key}
                spec={spec}
                isOpen={isOpen}
                hot={hot}
                empty={empty}
                share={share}
                onToggle={() => setOpen(isOpen ? null : spec.key)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SignalRows({
  spec,
  isOpen,
  hot,
  empty,
  share,
  onToggle,
}: {
  spec: SignalSpec;
  isOpen: boolean;
  hot: boolean;
  empty: boolean;
  share: number;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-border/60 ${empty ? "text-muted-foreground" : "cursor-pointer hover:bg-accent/40"}`}
        onClick={empty ? undefined : onToggle}
        title={spec.tooltip}
      >
        <td className="px-1 py-1.5 text-muted-foreground">
          {empty ? null : isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </td>
        <td className="px-2 py-1.5 font-medium">{spec.title}</td>
        <td
          className={`px-2 py-1.5 text-right tabular-nums font-medium ${hot ? "text-destructive" : ""}`}
        >
          {spec.key === "unpriced" ? "—" : empty ? "none" : usd(spec.cost)}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {spec.key === "unpriced" || empty ? "—" : percent(share)}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{spec.n}</td>
      </tr>
      {isOpen && !empty ? (
        <tr className="border-b border-border">
          <td colSpan={5} className="bg-muted/30 px-2 py-1">
            <DetailTable spec={spec} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
