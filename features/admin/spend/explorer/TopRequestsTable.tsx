// features/admin/spend/explorer/TopRequestsTable.tsx
//
// The most expensive individual requests in the window with every dimension
// on the row — the line item Arman can click to see "what was this, who asked,
// on which model, how many calls, did it finish". A request opens its
// conversation; its person, agent and organization drill the explorer.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { timestamp, usd } from "../format";
import type { SpendDimension, SpendRequestRow } from "../types";
import { compactNumber, percent } from "./labels";

function Drill({
  label,
  dim,
  value,
  onDrill,
}: {
  label: string | null;
  dim: SpendDimension;
  value: string | null;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      onClick={() => onDrill(dim, value)}
      className="max-w-full truncate text-left text-foreground hover:underline"
      title="Look only at this"
    >
      {label ?? value}
    </button>
  );
}

export function TopRequestsTable({
  rows,
  onDrill,
}: {
  rows: SpendRequestRow[];
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const columns: MatrxColumnDef<SpendRequestRow>[] = [
    {
      id: "at",
      header: "When",
      accessorFn: (r) => r.at,
      width: 150,
      cell: (r) => <span className="text-muted-foreground">{timestamp(r.at)}</span>,
    },
    {
      id: "cost",
      header: "Cost",
      accessorFn: (r) => r.cost,
      defaultSortDirection: "desc",
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums font-medium">
          {usd(r.cost)}
          <span className="ml-1 text-[10px] text-muted-foreground">{percent(r.share)}</span>
        </span>
      ),
    },
    {
      id: "conversation",
      header: "Conversation",
      accessorFn: (r) => r.conversation ?? r.feature,
      width: 260,
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <Drill
            label={r.conversation ?? (r.conversationId ? "Untitled conversation" : `(${r.source})`)}
            dim="conversation"
            value={r.conversationId}
            onDrill={onDrill}
          />
          {r.conversationId ? (
            <Link
              href={`/chat/${r.conversationId}`}
              className="shrink-0 text-muted-foreground hover:text-primary"
              title="Open the conversation"
              aria-label="Open the conversation"
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      id: "user",
      header: "Person",
      accessorFn: (r) => r.user ?? "",
      width: 180,
      cell: (r) => <Drill label={r.user} dim="user" value={r.userId} onDrill={onDrill} />,
    },
    {
      id: "agent",
      header: "Agent",
      accessorFn: (r) => r.agent ?? "",
      width: 170,
      cell: (r) => <Drill label={r.agent} dim="agent" value={r.agentId} onDrill={onDrill} />,
    },
    {
      id: "feature",
      header: "Feature",
      accessorFn: (r) => r.feature,
      filter: "select",
      width: 150,
      cell: (r) => <Drill label={r.feature} dim="feature" value={r.feature} onDrill={onDrill} />,
    },
    {
      id: "model",
      header: "Model",
      accessorFn: (r) => r.model ?? "",
      filter: "select",
      width: 150,
      cell: (r) => <Drill label={r.model} dim="model" value={r.model} onDrill={onDrill} />,
    },
    {
      id: "trigger",
      header: "Trigger",
      accessorFn: (r) => r.trigger,
      filter: "select",
      width: 100,
      cell: (r) => (
        <span className={r.trigger === "manual" ? "text-foreground" : "text-muted-foreground"}>
          {r.trigger === "manual" ? "manual" : "automated"}
          <span className="ml-1 text-[10px] text-muted-foreground">{r.origin}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Outcome",
      accessorFn: (r) => `${r.status ?? ""}${r.finishReason ? ` ${r.finishReason}` : ""}`,
      filter: "select",
      width: 130,
      cell: (r) =>
        r.status === null ? (
          <span className="text-muted-foreground">no request row</span>
        ) : r.status === "completed" && r.finishReason !== "max_tokens" ? (
          <span className="text-muted-foreground">completed</span>
        ) : (
          <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-destructive">
            {r.status}
            {r.finishReason && r.finishReason !== "stop" ? ` · ${r.finishReason}` : ""}
          </span>
        ),
    },
    {
      id: "calls",
      header: "Calls / tools",
      accessorFn: (r) => r.iterations,
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {r.iterations} / {r.toolCalls}
        </span>
      ),
    },
    {
      id: "tokens",
      header: "Tokens in / cached / out",
      accessorFn: (r) => r.tokensIn + r.tokensCached,
      width: 170,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {compactNumber(r.tokensIn)} / {compactNumber(r.tokensCached)} / {compactNumber(r.tokensOut)}
        </span>
      ),
    },
    {
      id: "organization",
      header: "Organization",
      accessorFn: (r) => r.organization,
      filter: "select",
      width: 160,
      cell: (r) => (
        <Drill label={r.organization} dim="organization" value={r.organizationId} onDrill={onDrill} />
      ),
    },
    {
      id: "app",
      header: "App",
      accessorFn: (r) => r.app,
      filter: "select",
      width: 130,
      cell: (r) => <Drill label={r.app} dim="app" value={r.app} onDrill={onDrill} />,
    },
  ];

  return (
    <MatrxDataTable
      urlState={{ id: "spend-requests" }}
      data={rows}
      columns={columns}
      getRowId={(r) => r.executionId}
      defaultSort={{ id: "cost", direction: "desc" }}
      pageSize={20}
      emptyState={{ title: "No requests in this window." }}
      toolbar={{ search: true, searchPlaceholder: "Search requests…" }}
    />
  );
}
