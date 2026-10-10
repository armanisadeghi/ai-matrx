"use client";

/**
 * Hard-cost reconciliation — /administration/usage/reconciliation.
 *
 * Per window and provider: what the vendor says it charged, what we recorded, the points we charged
 * against the points the recorded cost converts to, calls nobody was charged for, and the drift.
 * Rows are `billing.hard_cost_reconciliation` (one per run x window x provider, written by the
 * `hard_cost_reconciliation` system task — aidream services/billing/FEATURE.md). Platform admins
 * only: the table's RLS (`platform_admin_read`) is the gate; any other seat reads zero rows.
 */

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { ReadFailure } from "@ai-matrx/design-system";
import { xmlElement, xmlText } from "@ai-matrx/chat/surfaces/runtime/context-bundle";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_HARD_COST_RECONCILIATION_SURFACE_NAME,
  createHardCostReconciliationScope,
} from "@/features/surfaces/manifests/admin-hard-cost-reconciliation.manifest";
import { createClient } from "@/utils/supabase/client";

export type ReconciliationRow = {
  id: string;
  provider: string;
  window_kind: string;
  window_start: string;
  window_end: string;
  status: string;
  recorded_rows: number;
  unpriced_rows: number;
  recorded_usd: number | null;
  recorded_units: number | null;
  expected_points: number;
  charged_points: number;
  points_drift: number;
  uncharged_rows: number;
  uncharged_usd: number | null;
  provider_actual_units: number | null;
  provider_actual_usd: number | null;
  recorded_usd_in_provider_interval: number | null;
  provider_drift_usd: number | null;
  provider_drift_pct: number | null;
  findings: string[] | null;
  details: { platform_paid_rows?: number; platform_paid_usd?: number; org_billed_rows?: number; org_billed_points?: number } | null;
  created_at: string;
};

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const usd = (v: number | null) => (v === null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(4)}`);
const fmt = (v: number | null) => (v === null ? "—" : v.toLocaleString());

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "ok"
      ? "border-success/40 text-success"
      : status === "drift"
        ? "border-destructive/40 text-destructive"
        : "text-muted-foreground";
  return (
    <Badge variant="outline" className={cls}>
      {status}
    </Badge>
  );
}

const COLUMNS: MatrxColumnDef<ReconciliationRow>[] = [
  { id: "created", header: "Run", accessorFn: (r) => r.created_at, filter: "date", width: 150, cell: (r) => new Date(r.created_at).toLocaleString() },
  { id: "window", header: "Window", accessorFn: (r) => r.window_kind, filter: "select", width: 90 },
  { id: "from", header: "From", accessorFn: (r) => r.window_start, filter: "date", width: 150, cell: (r) => new Date(r.window_start).toLocaleString(), mobileHidden: true },
  { id: "provider", header: "Provider", accessorFn: (r) => r.provider, filter: "select", width: 120 },
  { id: "status", header: "Status", accessorFn: (r) => r.status, filter: "select", width: 110, cell: (r) => <StatusBadge status={r.status} /> },
  { id: "vendor-usd", header: "Vendor reported", accessorFn: (r) => num(r.provider_actual_usd) ?? -1, filter: "number", width: 120, align: "right", cell: (r) => usd(num(r.provider_actual_usd)) },
  { id: "vendor-units", header: "Vendor units", accessorFn: (r) => num(r.provider_actual_units) ?? -1, filter: "number", width: 110, align: "right", cell: (r) => fmt(num(r.provider_actual_units)), mobileHidden: true },
  { id: "recorded-usd", header: "Recorded", accessorFn: (r) => num(r.recorded_usd) ?? 0, filter: "number", width: 110, align: "right", cell: (r) => usd(num(r.recorded_usd)) },
  { id: "recorded-in-interval", header: "Recorded in vendor interval", accessorFn: (r) => num(r.recorded_usd_in_provider_interval) ?? -1, filter: "number", width: 150, align: "right", cell: (r) => usd(num(r.recorded_usd_in_provider_interval)), mobileHidden: true },
  { id: "rows", header: "Rows", accessorFn: (r) => r.recorded_rows, filter: "number", width: 80, align: "right", cell: (r) => fmt(r.recorded_rows) },
  { id: "charged", header: "Points charged", accessorFn: (r) => Number(r.charged_points), filter: "number", width: 120, align: "right", cell: (r) => fmt(Number(r.charged_points)) },
  { id: "expected", header: "Points expected", accessorFn: (r) => Number(r.expected_points), filter: "number", width: 120, align: "right", cell: (r) => fmt(Number(r.expected_points)) },
  { id: "uncharged", header: "Uncharged rows", accessorFn: (r) => r.uncharged_rows, filter: "number", width: 110, align: "right", cell: (r) => fmt(r.uncharged_rows) },
  { id: "platform-paid", header: "Platform-paid rows", accessorFn: (r) => r.details?.platform_paid_rows ?? 0, filter: "number", width: 130, align: "right", cell: (r) => fmt(r.details?.platform_paid_rows ?? 0), mobileHidden: true },
  { id: "org-billed", header: "Org-billed rows", accessorFn: (r) => r.details?.org_billed_rows ?? 0, filter: "number", width: 120, align: "right", cell: (r) => fmt(r.details?.org_billed_rows ?? 0), mobileHidden: true },
  { id: "drift-usd", header: "Drift $", accessorFn: (r) => num(r.provider_drift_usd) ?? 0, filter: "number", width: 100, align: "right", cell: (r) => usd(num(r.provider_drift_usd)) },
  { id: "drift-pct", header: "Drift %", accessorFn: (r) => num(r.provider_drift_pct) ?? 0, filter: "number", width: 90, align: "right", cell: (r) => (r.provider_drift_pct === null ? "—" : `${Number(r.provider_drift_pct).toFixed(1)}%`) },
  { id: "findings", header: "Findings", accessorFn: (r) => (r.findings ?? []).join("; "), width: 320 },
];

const money = (v: number | null) => (v === null ? null : v.toFixed(4));

/** The newest run for each window and provider as one bundle (what the page's top rows hold), inside the context budget. */
export function buildReconciliationSummary(rows: ReconciliationRow[]): string {
  const newest = new Map<string, ReconciliationRow>();
  for (const r of rows) {
    const key = `${r.window_kind}|${r.provider}`;
    const have = newest.get(key);
    if (!have || r.created_at > have.created_at) newest.set(key, r);
  }
  const latest = [...newest.values()].sort((a, b) => a.window_kind.localeCompare(b.window_kind) || a.provider.localeCompare(b.provider));
  const MAX_ROWS = 40;
  const shown = latest.slice(0, MAX_ROWS);
  const count = (status: string) => latest.filter((r) => r.status === status).length;
  return xmlElement(
    "reconciliation",
    {
      runs: new Set(rows.map((r) => r.created_at.slice(0, 16))).size,
      total_rows: rows.length,
      ok: count("ok"),
      drift: count("drift"),
      unverifiable: count("unverifiable"),
      shown: shown.length < latest.length ? shown.length : null,
    },
    shown.map((r) =>
      xmlElement(
        "row",
        {
          window: r.window_kind,
          from: r.window_start.slice(0, 10),
          provider: r.provider,
          status: r.status,
          vendor_usd: money(num(r.provider_actual_usd)),
          recorded_usd: money(num(r.recorded_usd)),
          drift_usd: money(num(r.provider_drift_usd)),
          drift_pct: r.provider_drift_pct === null ? null : Number(r.provider_drift_pct).toFixed(1),
          points_charged: Number(r.charged_points),
          points_expected: Number(r.expected_points),
          uncharged_rows: r.uncharged_rows || null,
          run: r.created_at.slice(0, 16),
        },
        [xmlText("findings", (r.findings ?? []).join("; "), { max: 240 })],
      ),
    ),
  );
}

export function HardCostReconciliationTable() {
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let live = true;
    createClient()
      .schema("billing")
      .from("hard_cost_reconciliation")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000)
      .then(({ data, error: err }) => {
        if (!live) return;
        if (err) setError(err.message);
        else setRows((data ?? []) as unknown as ReconciliationRow[]);
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [attempt]);

  const getScope = () =>
    createHardCostReconciliationScope(
      error
        ? { load_error: error }
        : loading
          ? {}
          : { reconciliation_summary: buildReconciliationSummary(rows), row_count: rows.length },
    );

  if (error) {
    return (
      <SurfaceRuntimeProvider surfaceName={ADMIN_HARD_COST_RECONCILIATION_SURFACE_NAME} getScope={getScope}>
        <ReadFailure error={new Error(error)} what="the hard-cost reconciliation" onRetry={retry} />
      </SurfaceRuntimeProvider>
    );
  }

  return (
    <SurfaceRuntimeProvider surfaceName={ADMIN_HARD_COST_RECONCILIATION_SURFACE_NAME} getScope={getScope}>
    <div className="min-h-0 flex-1">
      <MatrxDataTable
        tableId="admin-hard-cost-reconciliation"
        data={rows}
        columns={COLUMNS}
        getRowId={(r) => r.id}
        isLoading={loading}
        stickyHeader
        density="condensed"
        pageSize={100}
        defaultSort={{ id: "created", direction: "desc" }}
        coverage={{ noun: "reconciliation", answeredBy: "client", loaded: rows.length, total: loading ? undefined : rows.length }}
        toolbar={{ title: "Hard-cost reconciliation", search: true }}
        emptyState={{ title: "No reconciliation has run yet", description: "The daily system task writes the first rows." }}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}
