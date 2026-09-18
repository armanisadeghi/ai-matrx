// features/admin/spend/explorer/DigHerePanel.tsx
//
// "Dig here": one canonical summary table and, below it at full width, one
// canonical compact detail table for the selected signal. No hand-built nested
// table or inset detail row survives here.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { timestamp, usd } from "../format";
import type { SpendBreakdown, SpendDimension } from "../types";
import { compactNumber, shortLocal } from "./labels";
import { formatPercentFromFraction } from "@ai-matrx/kit/format";

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
  rows: Array<{
    id: string;
    cells: Cell[];
    values: Array<string | number>;
    href?: string | null;
  }>;
}

function DrillCell({
  label,
  onDrill,
}: {
  label: string;
  onDrill?: () => void;
}) {
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

type SignalDetailRow = SignalSpec["rows"][number];

function DetailTable({ spec }: { spec: SignalSpec }) {
  const columns: MatrxColumnDef<SignalDetailRow>[] = spec.columns.map(
    (header, index) => ({
      id: `value-${index}`,
      header,
      accessorFn: (row) => row.values[index] ?? "",
      filter: spec.numeric[index] ? "number" : "auto",
      align: spec.numeric[index] ? "right" : "left",
      width: index === 0 ? 210 : spec.numeric[index] ? 100 : 150,
      cell: (row) => (
        <div
          className={
            spec.numeric[index]
              ? "whitespace-nowrap tabular-nums"
              : "max-w-[22rem] truncate"
          }
        >
          {row.cells[index]}
        </div>
      ),
    }),
  );

  return (
    <MatrxDataTable
      data={spec.rows}
      columns={columns}
      getRowId={(row) => row.id}
      detail={{ enabled: false }}
      pageSize={10}
      hidePagination={spec.rows.length <= 10}
      className="text-xs"
      tableClassName="[&_td]:py-1 [&_th]:py-1"
      emptyState={{ title: "No matching rows." }}
      toolbar={{
        title: spec.title,
        search: true,
        searchPlaceholder: `Search ${spec.title.toLowerCase()}…`,
        leading:
          spec.n > spec.listed ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {spec.listed} of {spec.n} listed
            </span>
          ) : undefined,
      }}
      rowActions={(row) =>
        row.href ? (
          <Link
            href={row.href}
            className="inline-flex h-10 w-10 items-center justify-center text-muted-foreground hover:text-primary"
            aria-label="Open"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </Link>
        ) : null
      }
    />
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
      columns: [
        "Conversation",
        "Person",
        "Agent",
        "Trigger",
        "Requests",
        "Share",
        "Cost",
      ],
      numeric: [false, false, false, false, true, true, true],
      rows: s.conversationHogs.rows.map((r) => ({
        id: r.conversationId,
        href: `/chat/${r.conversationId}`,
        values: [
          r.conversation ?? "Untitled",
          r.user ?? "",
          r.agent ?? "",
          r.trigger ?? "",
          r.requests,
          r.share,
          r.cost,
        ],
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
          formatPercentFromFraction(r.share),
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
      columns: [
        "Conversation",
        "Person",
        "Agent",
        "Tokens / call",
        "Calls",
        "Requests",
        "Cost",
      ],
      numeric: [false, false, false, true, true, true, true],
      rows: s.contextHeavy.rows.map((r) => ({
        id: r.conversationId,
        href: `/chat/${r.conversationId}`,
        values: [
          r.conversation ?? "Untitled",
          r.user ?? "",
          r.agent ?? "",
          r.avgContext,
          r.calls,
          r.requests,
          r.cost,
        ],
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
      columns: [
        "When",
        "Conversation",
        "Person",
        "Agent",
        "Calls",
        "Tools",
        "Cost",
      ],
      numeric: [false, false, false, false, true, true, true],
      rows: s.iterationHeavy.rows.map((r) => ({
        id: r.requestId,
        href: r.conversationId ? `/chat/${r.conversationId}` : null,
        values: [
          r.at,
          r.conversation ?? r.feature ?? "",
          r.user ?? "",
          r.agent ?? "",
          r.iterations,
          r.toolCalls,
          r.cost,
        ],
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
        values: [
          r.at,
          `${r.status ?? ""} ${r.finishReason ?? ""}`.trim(),
          r.conversation ?? r.feature ?? "",
          r.user ?? "",
          r.agent ?? "",
          r.cost,
        ],
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
      columns: [
        "Hour",
        "× median",
        "Executions",
        "Top person",
        "Top feature",
        "Cost",
      ],
      numeric: [false, true, true, false, false, true],
      rows: s.spikeHours.rows.map((r) => ({
        id: r.hour,
        values: [
          r.hour,
          r.multiple ?? 0,
          r.n,
          r.topUser ?? "",
          r.topFeature ?? "",
          r.cost,
        ],
        cells: [
          <DrillCell
            key="h"
            label={shortLocal(r.hour)}
            onDrill={() => onDrill("hour", r.hour)}
          />,
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
      columns: [
        "When",
        "Person",
        "Agent",
        "Feature",
        "Trigger",
        "Requests",
        "Cost",
      ],
      numeric: [false, false, false, false, false, true, true],
      rows: s.repeatBursts.rows.map((r) => ({
        id: `${r.bucket}-${r.user}-${r.agent}-${r.feature}`,
        values: [
          r.bucket,
          r.user ?? "",
          r.agent ?? "",
          r.feature ?? "",
          r.trigger ?? "",
          r.requests,
          r.cost,
        ],
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
      tooltip:
        "API calls with no price on file — under-counted by an unknown amount",
      cost: 0,
      n: s.unpriced.n,
      listed: s.unpriced.n > 0 ? 1 : 0,
      columns: ["Calls", "Requests"],
      numeric: [true, true],
      rows:
        s.unpriced.n > 0
          ? [
              {
                id: "unpriced",
                values: [s.unpriced.n, s.unpriced.requests],
                cells: [s.unpriced.n, s.unpriced.requests],
              },
            ]
          : [],
    },
  ];

  specs.sort((a, b) => b.cost - a.cost);

  const summaryColumns: MatrxColumnDef<SignalSpec>[] = [
    {
      id: "signal",
      header: "Signal",
      accessorFn: (spec) => spec.title,
      width: 280,
      cell: (spec) => (
        <div className="flex min-w-0 items-center gap-1.5" title={spec.tooltip}>
          {spec.n > 0 ? (
            open === spec.key ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span className="truncate font-medium">{spec.title}</span>
        </div>
      ),
    },
    {
      id: "cost",
      header: "Cost",
      accessorFn: (spec) => spec.cost,
      filter: "number",
      defaultSortDirection: "desc",
      width: 100,
      align: "right",
      cell: (spec) => {
        const share = total > 0 ? spec.cost / total : 0;
        return (
          <span
            className={`whitespace-nowrap font-medium tabular-nums ${share >= 0.25 ? "text-destructive" : ""}`}
          >
            {spec.key === "unpriced"
              ? "—"
              : spec.n === 0
                ? "none"
                : usd(spec.cost)}
          </span>
        );
      },
    },
    {
      id: "share",
      header: "Share",
      accessorFn: (spec) => (total > 0 ? spec.cost / total : 0),
      filter: "number",
      width: 90,
      align: "right",
      cell: (spec) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {spec.key === "unpriced" || spec.n === 0
            ? "—"
            : formatPercentFromFraction(total > 0 ? spec.cost / total : 0)}
        </span>
      ),
    },
    {
      id: "count",
      header: "Count",
      accessorFn: (spec) => spec.n,
      filter: "number",
      width: 90,
      align: "right",
      cell: (spec) => <span className="tabular-nums">{spec.n}</span>,
    },
  ];

  const openSpec =
    specs.find((spec) => spec.key === open && spec.n > 0) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <MatrxDataTable
        data={specs}
        columns={summaryColumns}
        getRowId={(spec) => spec.key}
        selectedId={open}
        onSelectedIdChange={setOpen}
        onRowOpen={(spec) =>
          setOpen(spec.n === 0 || open === spec.key ? null : spec.key)
        }
        detail={{ enabled: false }}
        reorderableColumns={false}
        defaultSort={{ id: "cost", direction: "desc" }}
        pageSize={0}
        hidePagination
        className="text-xs"
        tableClassName="[&_td]:py-1 [&_th]:py-1"
        toolbar={{ title: "Dig here", search: false }}
      />
      {openSpec ? <DetailTable spec={openSpec} /> : null}
    </div>
  );
}
