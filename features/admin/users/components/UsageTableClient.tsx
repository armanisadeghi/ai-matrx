"use client";

// Users & Access › Usage & Cost — PER USER.
//
// Replaces the per-model cx-dashboard view with what actually matters here:
// each user's AI requests, tokens, and STORED cost (chat.user_request rollup).
// Canonical MatrxDataTable: sort/filter every column, Copy-for-AI, timeframe
// facet, and ?user=<id> focus from the Accounts cross-link.

import AppLink from "@/components/navigation/AppLink";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { AdminUserRef } from "./AdminUserRef";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildAdminUserMenuSection } from "./admin-user-menu-section";
import { USERS_ADMIN_LOCATION } from "../constants";
import type { AdminUserUsageRow } from "../types";
import {
  originClassColor,
  originClassLabel,
  sortByOriginOrder,
} from "@/lib/usage/originClass";
import { pushAppHref } from "@/lib/deployment/navigate";
import { formatCount } from "@ai-matrx/kit/format";
import { formatAdminCost } from "@/components/cost/formatAdminCost";
import { adminCostColumns } from "@/components/cost/adminCostColumns";
import { readOf } from "@/components/read-state/ReadGate";

type Timeframe = "all" | "30d" | "7d" | "24h";

const TIMEFRAME_DAYS: Record<Exclude<Timeframe, "all">, number> = {
  "30d": 30,
  "7d": 7,
  "24h": 1,
};

const fmtCost = formatAdminCost;
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

/**
 * One user's spend split by witnessed origin, ordered by the trust ladder
 * rather than by size so a row reads the same way every time.
 */
function OriginBar({ row }: { row: AdminUserUsageRow }) {
  const parts = sortByOriginOrder(row.by_origin, (o) => o.origin_class).filter(
    (o) => o.total_cost > 0 || o.requests > 0,
  );
  if (parts.length === 0)
    return <span className="text-xs text-muted-foreground">—</span>;

  const total = parts.reduce((sum, o) => sum + o.total_cost, 0);
  // With no settled cost anywhere, split by request count instead of
  // collapsing the bar to nothing — the origin mix is still the answer.
  const weight = (o: (typeof parts)[number]) =>
    total > 0 ? o.total_cost / total : o.requests / (row.total_requests || 1);

  return (
    <div
      className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
      title={parts
        .map(
          (o) =>
            `${originClassLabel(o.origin_class)}: ${fmtCost(o.total_cost)} · ${formatCount(o.requests)} reqs`,
        )
        .join("\n")}
    >
      {parts.map((o) => (
        <div
          key={o.origin_class}
          className="h-full"
          style={{
            width: `${weight(o) * 100}%`,
            backgroundColor: originClassColor(o.origin_class),
          }}
        />
      ))}
    </div>
  );
}

/** Origin split as one scalar line — the copy/AI payload takes scalars only. */
function originSummaryLine(
  origins: readonly AdminUserUsageRow["by_origin"][number][],
): string {
  const parts = sortByOriginOrder(origins, (o) => o.origin_class).map(
    (o) =>
      `${originClassLabel(o.origin_class)} ${fmtCost(o.total_cost)}/${formatCount(o.requests)} reqs`,
  );
  return parts.join(", ") || "none recorded";
}

/** The origin class carrying the most cost (falling back to request count). */
function topOrigin(row: AdminUserUsageRow) {
  if (row.by_origin.length === 0) return null;
  return [...row.by_origin].sort(
    (a, b) => b.total_cost - a.total_cost || b.requests - a.requests,
  )[0];
}

function topOriginLabel(row: AdminUserUsageRow): string {
  const top = topOrigin(row);
  return top ? originClassLabel(top.origin_class) : "—";
}

function originTotalsFor(rows: readonly AdminUserUsageRow[]) {
  const acc = new Map<string, { requests: number; cost: number }>();
  for (const row of rows) {
    for (const origin of row.by_origin) {
      const current = acc.get(origin.origin_class) ?? { requests: 0, cost: 0 };
      current.requests += origin.requests;
      current.cost += origin.total_cost;
      acc.set(origin.origin_class, current);
    }
  }
  return sortByOriginOrder(
    [...acc.entries()].map(([origin_class, values]) => ({ origin_class, ...values })),
    (origin) => origin.origin_class,
  );
}

export function UsageTableClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const focusUser = searchParams.get("user");

  const [rows, setRows] = useState<AdminUserUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("all");
  const [clickedRow, setClickedRow] = useState<AdminUserUsageRow | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

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
      const nextRows = json.rows as AdminUserUsageRow[];
      setRows(nextRows);
      const available = new Set(nextRows.map((row) => row.user_id));
      setSelectedUserIds((current) => current.filter((id) => available.has(id)));
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

  // Origin split across every visible row — the same question as the per-user
  // bar, asked of the whole view.
  const originTotals = useMemo(() => originTotalsFor(focused), [focused]);

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
        cell: (r) => (
          <span className="tabular-nums text-sm">
            {formatCount(r.total_requests)}
          </span>
        ),
        width: 100,
      },
      {
        id: "total_tokens",
        accessorKey: "total_tokens",
        header: "Total tokens",
        filter: "number",
        align: "right",
        cell: (r) => (
          <span className="tabular-nums text-sm">
            {formatCount(r.total_tokens)}
          </span>
        ),
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
            {formatCount(r.input_tokens)}
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
            {formatCount(r.output_tokens)}
          </span>
        ),
        width: 110,
      },
      ...adminCostColumns<AdminUserUsageRow>({ id: "total_cost", value: (r) => r.total_cost }),
      {
        id: "distinct_models",
        accessorKey: "distinct_models",
        header: "Models",
        filter: "number",
        align: "right",
        cell: (r) => (
          <span className="tabular-nums text-sm">{r.distinct_models}</span>
        ),
        width: 80,
      },
      {
        id: "by_origin",
        accessorKey: "by_origin",
        header: "Origin mix",
        sortable: false,
        filter: false,
        cell: (r) => <OriginBar row={r} />,
        width: 140,
      },
      {
        id: "top_origin",
        // Sortable/filterable text answer to "what mostly drove this user's
        // spend" — the bar shows the mix, this shows the headline.
        accessorFn: (r: AdminUserUsageRow) => topOriginLabel(r),
        header: "Top origin",
        filter: "text",
        cell: (r) => (
          <span className="text-xs">{topOriginLabel(r)}</span>
        ),
        width: 120,
      },
      {
        id: "last_activity",
        accessorKey: "last_activity",
        header: "Last activity",
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {fmtDate(r.last_activity)}
          </span>
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
      {/* The read's failure is said once, by the table (read=). */}
      {/* COPY MODE (lane DRILL-USAGE-PAGE): the new explorer sits beside this page until Arman
          validates it; nothing redirects. */}
      <div className="flex items-center justify-end text-xs">
        <AppLink
          href="/administration/usage"
          data-usage-try-new
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Try the new usage page
        </AppLink>
      </div>

      {focusUser ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">
            Focused on one user ({focused[0]?.email ?? focusUser})
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 gap-1 px-2 text-xs"
            onClick={() => pushAppHref(router, "/administration/users/usage")}
          >
            <X className="h-3 w-3" /> Clear
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Requests</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatCount(totals.requests)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Total tokens</div>
          <div className="text-lg font-semibold tabular-nums">
            {formatCount(totals.tokens)}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] text-muted-foreground">Total cost</div>
          <div className="text-lg font-semibold tabular-nums">
            {fmtCost(totals.cost)}
          </div>
        </div>
      </div>

      {originTotals.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 text-[11px] text-muted-foreground">
            Spend by origin — what kind of thing initiated it
          </div>
          <div className="mb-2 flex h-2 w-full overflow-hidden rounded-full bg-muted">
            {originTotals.map((o) => (
              <div
                key={o.origin_class}
                className="h-full"
                style={{
                  width: `${totals.cost > 0 ? (o.cost / totals.cost) * 100 : 0}%`,
                  backgroundColor: originClassColor(o.origin_class),
                }}
                title={`${originClassLabel(o.origin_class)}: ${fmtCost(o.cost)}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {originTotals.map((o) => (
              <div
                key={o.origin_class}
                className="flex items-center gap-1.5 text-xs"
              >
                <div
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: originClassColor(o.origin_class) }}
                />
                <span>{originClassLabel(o.origin_class)}</span>
                <span className="font-mono tabular-nums">{fmtCost(o.cost)}</span>
                <span className="text-muted-foreground">
                  ({formatCount(o.requests)})
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <NonEditableContextMenu
          sourceFeature="admin"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
          resolveContextOnOpen={(element) => {
            const id = element
              ?.closest("[data-row-id]")
              ?.getAttribute("data-row-id");
            const row = id ? (focused.find((r) => r.user_id === id) ?? null) : null;
            setClickedRow(row);
            if (!row) return null;
            return {
              content: `${row.email ?? row.user_id}: ${formatCount(row.total_requests)} requests, ${fmtCost(row.total_cost)}`,
            };
          }}
          extraSections={[
            buildAdminUserMenuSection(
              clickedRow
                ? { id: clickedRow.user_id, email: clickedRow.email }
                : null,
            ),
          ]}
        >
        <MatrxDataTable
          urlState={{ id: "user-usage" }}
          data={focused}
          columns={columns}
          getRowId={(r) => r.user_id}
          selection={{
            selectedIds: selectedUserIds.filter((id) => focused.some((row) => row.user_id === id)),
            onSelectedIdsChange: setSelectedUserIds,
            noun: "user",
          }}
          isLoading={loading}
          pageSize={50}
          read={readOf({ loading, error }, { what: "usage", onRetry: () => void load(timeframe) })}
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
                onChange: (v) => {
                  setSelectedUserIds([]);
                  setTimeframe(v as Timeframe);
                },
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
            listDescription:
              "Filtered/sorted per-user usage currently visible.",
            humanRow: (r) =>
              [
                `${r.email ?? r.user_id}: ${formatCount(r.total_requests)} requests, ${formatCount(r.total_tokens)} tokens, ${fmtCost(r.total_cost)}`,
                `models=${r.distinct_models} last=${r.last_activity ?? "?"}`,
                `by origin: ${originSummaryLine(r.by_origin)}`,
              ].join("\n"),
            rowAttributes: (r) => ({
              user_id: r.user_id,
              email: r.email,
              requests: r.total_requests,
              cost: r.total_cost,
              top_origin: topOriginLabel(r),
              by_origin: originSummaryLine(r.by_origin),
            }),
            listAttributes: (visible) => ({
              users: visible.length,
              timeframe,
              by_origin: originTotalsFor(visible)
                .map(
                  (o) =>
                    `${originClassLabel(o.origin_class)} ${fmtCost(o.cost)}/${formatCount(o.requests)}`,
                )
                .join(", "),
            }),
          }}
        />
        </NonEditableContextMenu>
      </div>
    </div>
  );
}
