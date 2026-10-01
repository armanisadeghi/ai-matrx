// features/admin/spend/explorer/EstimatedCostPanel.tsx
//
// "Estimated · not invoiced" — ledger rows whose price is an ESTIMATE
// (`meters.estimated_usd`), e.g. the mandate reference patrol's container time
// priced at the published AWS Fargate rate. The explorer's totals are billed
// `cost` only, so these runs read as $0 there; this block shows them on their
// own and never adds them to an invoiced figure (hosting is billed by invoice,
// so adding them would count that money twice).
//
// Doc: features/admin/spend/FEATURE.md § Estimated cost

"use client";

import { useEffect, useState } from "react";
import { Calculator } from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

import { AdminCost } from "@/components/cost/AdminCost";
import { count, timestamp } from "../format";
import {
  ESTIMATED_SPEND_ROW_CAP,
  fetchEstimatedSpend,
  type EstimatedSpend,
  type EstimatedSpendRow,
} from "../service";

const columns: MatrxColumnDef<EstimatedSpendRow>[] = [
  {
    id: "source",
    header: "Source",
    accessorFn: (r) => r.source,
    width: 260,
    cell: (r) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-foreground">{r.source}</div>
        {r.linkKind ? (
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {r.linkKind}
            {r.linkId ? ` ${r.linkId.slice(0, 8)}` : ""}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    id: "at",
    header: "When",
    accessorFn: (r) => r.at,
    width: 150,
    cell: (r) => <span className="tabular-nums">{timestamp(r.at)}</span>,
  },
  {
    id: "estimated",
    header: "Estimated",
    accessorFn: (r) => r.estimatedUsd,
    width: 110,
    align: "right",
    cell: (r) => <span className="tabular-nums"><AdminCost usd={r.estimatedUsd} unknown="not measured" /></span>,
  },
  {
    id: "ledger",
    header: "Billed",
    accessorFn: (r) => r.ledgerCostUsd,
    width: 90,
    align: "right",
    cell: (r) => (
      <span className="tabular-nums text-muted-foreground"><AdminCost usd={r.ledgerCostUsd} unknown="not measured" /></span>
    ),
  },
];

export function EstimatedCostPanel({
  from,
  to,
  windowLabel,
  refreshKey = 0,
}: {
  from: Date;
  to: Date;
  windowLabel: string;
  refreshKey?: number;
}) {
  const [data, setData] = useState<EstimatedSpend | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    fetchEstimatedSpend({ from: new Date(fromIso), to: new Date(toIso), signal: controller.signal })
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(cause instanceof Error ? cause : new Error("The estimated cost read failed."));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fromIso, toIso, refreshKey]);

  const runs = data?.rows.length ?? 0;

  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      aria-busy={loading}
      aria-label="Estimated cost, not invoiced"
      data-testid="spend-estimated-cost"
    >
      <header className="flex min-w-0 flex-wrap items-center gap-2">
        <Calculator className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Estimated</h2>
        <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
          not invoiced · not in totals
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {windowLabel}
          {data ? ` · ${count(runs)} ${runs === 1 ? "run" : "runs"}` : ""}
          {data?.capped ? ` · first ${ESTIMATED_SPEND_ROW_CAP}` : ""}
        </span>
        <span className="ml-auto text-sm font-semibold tabular-nums text-foreground">
          {data ? <AdminCost usd={data.totalEstimatedUsd} unknown="not measured" /> : loading ? "…" : "—"}
        </span>
      </header>
      {error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
          Estimated cost unreadable ({error.message}).
          <ErrorAlchemyMenu />
        </div>
      ) : data && runs > 0 ? (
        <MatrxDataTable
          urlState={{ id: "spend-estimated-cost" }}
          data={data.rows}
          columns={columns}
          getRowId={(r) => r.id}
          pageSize={10}
          emptyState={{ title: "No estimated cost in this window." }}
        />
      ) : null}
    </section>
  );
}
