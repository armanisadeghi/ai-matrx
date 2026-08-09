"use client";

// Users & Access › Usage & Cost — PER USER.
//
// Replaces the per-model cx-dashboard view with what actually matters here:
// each user's AI requests, tokens, and STORED cost (chat.user_request rollup).
// Canonical MatrxDataTable: sort/filter every column, Copy-for-AI, timeframe
// facet, and ?user=<id> focus from the Accounts cross-link.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { AdminUserRef } from "./AdminUserRef";
import { USERS_ADMIN_LOCATION } from "../constants";
import type { AdminUserUsageRow } from "../types";

type Timeframe = "all" | "30d" | "7d" | "24h";

const TIMEFRAME_DAYS: Record<Exclude<Timeframe, "all">, number> = {
  "30d": 30,
  "7d": 7,
  "24h": 1,
};

const fmtInt = new Intl.NumberFormat();
function fmtCost(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export function UsageTableClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusUser = searchParams.get("user");

  const [rows, setRows] = useState<AdminUserUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");

  const load = useCallback(async (tf: Timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (tf !== "all") {
        const from = new Date();
        from.setDate(from.getDate() - TIMEFRAME_DAYS[tf]);
        qs.set("from", from.toISOString());
      }
      const res = await fetch(`/api/admin/users/usage?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load usage");
      setRows(json.rows as AdminUserUsageRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(timeframe);
  }, [load, timeframe]);

  const focused = useMemo(
    () => (focusUser ? rows.filter((r) => r.user_id === focusUser) : rows),
    [rows, focusUser],
  );

  const totals = useMemo(() => {
    return focused.reduce(
      (acc, r) => {
        acc.requests += r.total_requests;
        acc.tokens += r.total_tokens;
        acc.cost += r.total_cost;
        return acc;
      },
      { requests: 0, tokens: 0, cost: 0 },
    );
  }, [focused]);

  const columns = useMemo((): MatrxColumnDef<AdminUserUsageRow>[] => {
    return [
      {
        id: "email",
        accessorKey: "email",
        header: "User",
        width: 220,
        cell: (r) => <AdminUserRef userId={r.user_id} email={r.email} />,
      },
      {
        id: "total_requests",
        accessorKey: "total_requests",
        header: "Requests",
        filter: "number",
        align: "right",
        cell: (r) => <span className="tabular-nums text-sm">{fmtInt.format(r.total_requests)}</span>,
        width: 100,
      },
      {
        id: "total_tokens",
        accessorKey: "total_tokens",
        header: "Total tokens",
        filter: "number",
        align: "right",
        cell: (r) => <span className="tabular-nums text-sm">{fmtInt.format(r.total_tokens)}</span>,
        width: 130,
      },
      {
        id: "input_tokens",
        accessorKey: "input_tokens",
        header: "Input",
        filter: "number",
        align: "right",
        cell: (r) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {fmtInt.format(r.input_tokens)}
          </span>
        ),
        width: 110,
      },
      {
        id: "output_tokens",
        accessorKey: "output_tokens",
        header: "Output",
        filter: "number",
        align: "right",
        cell: (r) => (
          <span className="tabular-nums text-xs text-muted-foreground">
            {fmtInt.format(r.output_tokens)}
          </span>
        ),
        width: 110,
      },
      {
        id: "total_cost",
        accessorKey: "total_cost",
        header: "Cost",
        filter: "number",
        align: "right",
        cell: (r) => (
          <span className="tabular-nums text-sm font-medium">{fmtCost(r.total_cost)}</span>
        ),
        width: 100,
      },
      {
        id: "distinct_models",
        accessorKey: "distinct_models",
        header: "Models",
        filter: "number",
        align: "right",
        cell: (r) => <span className="tabular-nums text-sm">{r.distinct_models}</span>,
        width: 80,
      },
      {
        id: "last_activity",
        accessorKey: "last_activity",
        header: "Last activity",
        cell: (r) => (
          <span className="text-xs text-muted-foreground">{fmtDate(r.last_activity)}</span>
        ),
        width: 160,
      },
      {
        id: "user_id",
        accessorKey: "user_id",
        header: "User ID",
        cellKind: "uuid",
        sortable: false,
        filter: false,
        width: 120,
      },
    ];
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {focusUser ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">
            Focused on one user ({focused[0]?.email ?? focusUser})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-2 text-xs"
            onClick={() => router.push("/administration/users/usage")}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Requests</div>
          <div className="text-lg font-semibold tabular-nums">
            {fmtInt.format(totals.requests)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Total tokens</div>
          <div className="text-lg font-semibold tabular-nums">
            {fmtInt.format(totals.tokens)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Total cost</div>
          <div className="text-lg font-semibold tabular-nums">{fmtCost(totals.cost)}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={focused}
          columns={columns}
          getRowId={(r) => r.user_id}
          isLoading={loading}
          pageSize={50}
          emptyState={{
            title: "No usage",
            description: "No AI usage in this timeframe.",
          }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search user…",
            facets: [
              {
                type: "button-group",
                id: "usage-timeframe",
                value: timeframe,
                defaultValue: "all",
                options: [
                  { value: "all", label: "All time" },
                  { value: "30d", label: "30d" },
                  { value: "7d", label: "7d" },
                  { value: "24h", label: "24h" },
                ],
                onChange: (v) => setTimeframe(v as Timeframe),
              },
            ],
          }}
          copy={{
            label: "User usage",
            listLabel: "Per-user usage (this view)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "user-usage",
            listKind: "user-usage",
            rowDescription: "One user's AI usage & cost rollup.",
            listDescription: "Filtered/sorted per-user usage currently visible.",
            humanRow: (r) =>
              [
                `${r.email ?? r.user_id}: ${fmtInt.format(r.total_requests)} requests, ${fmtInt.format(r.total_tokens)} tokens, ${fmtCost(r.total_cost)}`,
                `models=${r.distinct_models} last=${r.last_activity ?? "?"}`,
              ].join("\n"),
            rowAttributes: (r) => ({
              user_id: r.user_id,
              email: r.email,
              requests: r.total_requests,
              cost: r.total_cost,
            }),
            listAttributes: (visible) => ({
              users: visible.length,
              timeframe,
            }),
          }}
        />
      </div>
    </div>
  );
}
