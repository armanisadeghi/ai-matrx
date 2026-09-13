// features/admin/spend/explorer/DimensionTables.tsx
//
// Every dimension of the window as a table, one tab each. The same columns
// everywhere: what it is, what it cost, its share, how much of it someone
// asked for, requests, tokens, when it last ran. Clicking a name drills the
// whole explorer into that value; identities also open in place.
//
// Tables are page-scrolled, never a scroll inside the page's scroll: the
// container is unbounded (no `h-*`), so the data table lays out at its content
// height and only the page scrolls.
//
// Doc: features/admin/spend/FEATURE.md

"use client";

import { useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

// Tabs come through the host wrapper, never straight from the package: the
// wrapper is where "a tab activates on a plain click" lives (see
// `components/ui/tabs.tsx`).
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { count, timestamp, usd } from "../format";
import {
  SPEND_DIMENSIONS,
  type SpendBreakdown,
  type SpendDimension,
  type SpendDimensionRow,
} from "../types";
import {
  DIMENSION_HINT,
  DIMENSION_LABEL,
  compactNumber,
  identityHref,
  percent,
  rowLabel,
} from "./labels";

function ShareBar({ share }: { share: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-muted">
        <div
          className="h-full bg-primary/70"
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </div>
      <span className="w-9 text-right tabular-nums text-muted-foreground">
        {percent(share)}
      </span>
    </div>
  );
}

function columnsFor(
  dim: SpendDimension,
  onDrill: (dim: SpendDimension, key: string) => void,
): MatrxColumnDef<SpendDimensionRow>[] {
  return [
    {
      id: "label",
      header: DIMENSION_LABEL[dim],
      accessorFn: (r) => rowLabel(dim, r),
      width: 300,
      cell: (r) => {
        const label = rowLabel(dim, r);
        const href = identityHref(dim, r.key);
        return (
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onDrill(dim, r.key)}
              className="min-w-0 flex-1 truncate text-left font-medium text-foreground hover:underline"
              title={`Look only at ${label}`}
            >
              {label}
            </button>
            {href ? (
              <Link
                href={href}
                className="shrink-0 text-muted-foreground hover:text-primary"
                title="Open"
                aria-label={`Open ${label}`}
              >
                <ExternalLink className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "cost",
      header: "Cost",
      accessorFn: (r) => r.cost,
      defaultSortDirection: "desc",
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums font-medium">{usd(r.cost)}</span>
      ),
    },
    {
      id: "share",
      header: "Share",
      accessorFn: (r) => r.share,
      width: 120,
      cell: (r) => <ShareBar share={r.share} />,
    },
    {
      id: "manual",
      header: "Manual",
      accessorFn: (r) => r.manualCost,
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {usd(r.manualCost)}
        </span>
      ),
    },
    {
      id: "automated",
      header: "Automated",
      accessorFn: (r) => r.automatedCost,
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {usd(r.automatedCost)}
        </span>
      ),
    },
    {
      id: "requests",
      header: "Requests",
      accessorFn: (r) => r.requests,
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {count(r.requests)}
        </span>
      ),
    },
    {
      id: "per_request",
      header: "Per request",
      accessorFn: (r) => (r.requests > 0 ? r.cost / r.requests : 0),
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">
          {r.requests > 0 ? usd(r.cost / r.requests) : "—"}
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
          {compactNumber(r.tokensIn)} / {compactNumber(r.tokensCached)} /{" "}
          {compactNumber(r.tokensOut)}
        </span>
      ),
    },
    {
      id: "last_at",
      header: "Last activity",
      accessorFn: (r) => r.lastAt ?? "",
      width: 160,
      cell: (r) => (
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {timestamp(r.lastAt)}
        </span>
      ),
    },
  ];
}

export function DimensionTables({
  data,
  onDrill,
}: {
  data: SpendBreakdown;
  onDrill: (dim: SpendDimension, key: string) => void;
}) {
  const [tab, setTab] = useState<SpendDimension>("user");
  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as SpendDimension)}>
      <TabsList className="h-auto flex-wrap justify-start">
        {SPEND_DIMENSIONS.map((dim) => {
          const d = data.dimensions[dim];
          return (
            <TabsTrigger
              key={dim}
              value={dim}
              className="gap-1.5 text-xs"
              title={DIMENSION_HINT[dim]}
            >
              {DIMENSION_LABEL[dim]}
              <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                {d.distinct}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
      {SPEND_DIMENSIONS.map((dim) => {
        const d = data.dimensions[dim];
        return (
          <TabsContent
            key={dim}
            value={dim}
            className="mt-2 flex flex-col gap-1.5"
          >
            {d.otherN > 0 ? (
              <p className="text-xs tabular-nums text-muted-foreground">
                Top {d.rows.length} of {d.distinct} · Other {usd(d.otherCost)}
              </p>
            ) : null}
            <MatrxDataTable
              urlState={{ id: `spend-${dim}` }}
              data={d.rows}
              columns={columnsFor(dim, onDrill)}
              getRowId={(r) => r.key}
              defaultSort={{ id: "cost", direction: "desc" }}
              pageSize={15}
              emptyState={{ title: "Nothing in this window." }}
              toolbar={{
                search: true,
                searchPlaceholder: `Search ${DIMENSION_LABEL[dim].toLowerCase()}…`,
              }}
            />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
