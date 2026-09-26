"use client";

/**
 * features/administration/kg-cost/components/KgCostDashboard.tsx
 *
 * Admin dashboard for auto-ingest spend (Step 1.9 of the KG activation plan).
 *
 * Four KPI tiles + two tables (org leaderboard + in-flight batches) + two
 * drill-down dialogs. Pure reads through the typed kgCostService → Python
 * backend. Admin gate already enforced by the (admin) layout AND by
 * `_require_admin` on every Python handler.
 *
 * No emojis, Lucide icons only, semantic color tokens — per CLAUDE.md.
 *
 * SIBLING SURFACE: this page shows batch submissions only as an aggregate
 * ("pending batches", "batch savings 7d"). Per-ITEM truth for the platform
 * Batch system — every `batch.work_item`, its delivery outcome, and the
 * answers that came back and were never delivered — lives at
 * `/administration/knowledge/batch`
 * (`features/administration/batch/FEATURE.md`). Do not grow a third cost
 * surface here; send the operator there.
 */
import { useEffect, useState } from "react";
import { formatDurationMs, formatRelativeTime } from "@ai-matrx/kit/format";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from "@/features/surfaces/manifests/admin-knowledge.manifest";
import {
  Wallet,
  Receipt,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  BrainCircuit,
  Brain,
  Lightbulb,
  TrendingUp,
  Layers,
  Database,
  Gauge,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FIELD_ACTION, useOrgAutoRagPreference } from "@/features/organizations/hooks/useOrgAutoRagPreference";
import { toastWriteFailure } from "@/lib/errors/toastWriteFailure";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { AppLink } from "@/components/navigation/AppLink";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  getKgCostSummary,
  listOrgCosts,
  getOrgCostDetail,
  listPendingBatches,
  getBatchDetail,
  fetchUnitEconomics,
  type KgCostSummaryResponse,
  type OrgCostRow,
  type OrgCostDetailResponse,
  type BatchRow,
  type BatchDetailResponse,
  type BatchStatus,
  type UnitEconomicsResponse,
  type UnitEconomicsBySourceKindRow,
  type UnitEconomicsRecentRun,
} from "../service/kgCostService";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `$${value.toFixed(4)}`;
}

function fmtUsdShort(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(4)}`;
}

/** THE relative-time voice: @ai-matrx/kit/format owns "3m ago". */
function fmtRelativeTime(iso: string | null | undefined): string {
  return formatRelativeTime(iso, { style: "short" });
}

const STATUS_VARIANT: Record<
  BatchStatus,
  "secondary" | "default" | "destructive" | "outline"
> = {
  pending: "secondary",
  in_progress: "default",
  completed: "outline",
  failed: "destructive",
  cancelled: "outline",
  expired: "destructive",
};

function StatusBadge({ status }: { status: BatchStatus }) {
  return (
    <Badge variant={STATUS_VARIANT[status]} className="font-mono">
      {status}
    </Badge>
  );
}

/** numeric(12,6) columns arrive as strings over jsonb — never trust the wire type. */
function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtCompactTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(ms: number | string | null | undefined): string {
  const value = num(ms);
  if (!value) return "—";
  // THE compact duration voice (@ai-matrx/kit/format): 250ms, 5.2s, 5m 30s.
  return formatDurationMs(value, { style: "compact" });
}

function isStuckRun(row: UnitEconomicsRecentRun): boolean {
  if (row.status !== "running") return false;
  const started = new Date(row.started_at).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started > 10 * 60 * 1000;
}

function percentColorClass(percent: number): string {
  if (percent >= 100) return "text-destructive font-semibold";
  if (percent >= 80)
    return "text-orange-500 dark:text-orange-400 font-semibold";
  if (percent >= 50) return "text-foreground";
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// KPI tiles
// ---------------------------------------------------------------------------

function KpiTile({
  label,
  value,
  icon,
  loading,
  highlight,
  hint,
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  loading: boolean;
  highlight?: boolean;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="opacity-60">{icon}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <span className={highlight ? "text-destructive" : "text-foreground"}>
            {value ?? "—"}
          </span>
        )}
      </div>
      {hint && !loading && (
        <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function ReadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"><span>{message}</span><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>;
}

function readFailureMessage(error: unknown, subject: string): string {
  return error instanceof Error && error.message ? error.message : `Could not load ${subject}.`;
}

function fmtPercent(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value))
    return null;
  return `${value.toFixed(1)}%`;
}

function KpiTiles({
  summary,
  loading,
}: {
  summary: KgCostSummaryResponse | null;
  loading: boolean;
}) {
  // Defensive: `ner_coverage_pct` is being added on the Python side; until
  // it lands the tile renders "—" with the explainer copy. Once present,
  // the value flows through cleanly.
  const nerCoverage = summary?.ner_coverage_pct;
  const nerValue = fmtPercent(nerCoverage);
  const nerHint =
    nerCoverage === undefined
      ? "Backfill brings this up to 100%."
      : nerValue
        ? "of indexed chunks have entities extracted. Backfill brings this up to 100%."
        : "Live coverage not yet reported by the backend.";

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
      <KpiTile
        label="Spend today (all orgs)"
        value={summary ? fmtUsdShort(summary.spend_today_usd) : null}
        icon={<Wallet className="h-3.5 w-3.5" />}
        loading={loading}
      />
      <KpiTile
        label="Spend last 7 days"
        value={summary ? fmtUsdShort(summary.spend_7d_usd) : null}
        icon={<Receipt className="h-3.5 w-3.5" />}
        loading={loading}
      />
      <KpiTile
        label="Orgs over 80% of cap"
        value={summary ? `${summary.orgs_over_80pct}` : null}
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        loading={loading}
        highlight={(summary?.orgs_over_80pct ?? 0) > 0}
      />
      <KpiTile
        label="Pending batches"
        value={summary ? `${summary.pending_batches}` : null}
        icon={<Clock className="h-3.5 w-3.5" />}
        loading={loading}
      />
      <KpiTile
        label="Batch savings (7d)"
        value={
          summary ? fmtUsdShort(summary.batch_savings_7d_usd ?? 0) : null
        }
        icon={<Receipt className="h-3.5 w-3.5" />}
        loading={loading}
        hint="The same actual tokens at the live catalog rate, minus the batch bill — completed batch items, last 7 days (batch.savings_summary, the figure the platform spend dashboard leads with)."
      />
      <KpiTile
        label="Live NER coverage"
        value={nerValue}
        icon={<BrainCircuit className="h-3.5 w-3.5" />}
        loading={loading}
        hint={nerHint}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org leaderboard
// ---------------------------------------------------------------------------

function OrgLeaderboard({
  orgs,
  loading,
  refreshing,
  total,
  onPick,
}: {
  orgs: OrgCostRow[];
  loading: boolean;
  refreshing: boolean;
  total: number | null;
  onPick: (orgId: string) => void;
}) {
  const columns: MatrxColumnDef<OrgCostRow>[] = [
    {
      id: "organization",
      header: "Organization",
      accessorFn: (row) => row.organization_name ?? row.organization_id,
      filter: "text",
      width: 240,
      cell: (row) => (
        <EntityRef
          token="organization"
          id={row.organization_id}
          name={row.organization_name ?? row.organization_id}
          showIcon={false}
          wrap
          onOpen={() => onPick(row.organization_id)}
          className="font-medium"
        />
      ),
    },
    {
      accessorKey: "daily_auto_rag_cost_used_usd",
      header: "Used today",
      filter: "number",
      align: "right",
      width: 125,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(row.daily_auto_rag_cost_used_usd)}
        </span>
      ),
    },
    {
      accessorKey: "daily_auto_rag_budget_usd",
      header: "Budget",
      filter: "number",
      align: "right",
      width: 115,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(row.daily_auto_rag_budget_usd)}
        </span>
      ),
    },
    {
      accessorKey: "percent_used",
      header: "% used",
      filter: "number",
      align: "right",
      width: 95,
      cell: (row) => (
        <span className={`tabular-nums ${percentColorClass(row.percent_used)}`}>
          {row.percent_used.toFixed(1)}%
        </span>
      ),
    },
    {
      accessorKey: "last_charge_at",
      header: "Last charge",
      filter: "date",
      width: 140,
      cell: (row) => (
        <span className="text-muted-foreground">
          {fmtRelativeTime(row.last_charge_at)}
        </span>
      ),
    },
  ];

  return (
    <MatrxDataTable
      tableId="administration/kg-cost/organizations"
      data={orgs}
      columns={columns}
      getRowId={(row) => row.organization_id}
      isLoading={loading}
      isFetching={refreshing}
      density="condensed"
      stickyHeader
      pageSize={0}
      hidePagination
      copy={false}
      toolbar={{
        title: "Organizations",
        search: true,
        searchPlaceholder: "Search organizations…",
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      coverage={{ noun: "organization", total: total ?? undefined, cap: 200, answeredBy: "source" }}
      onRowOpen={(row) => onPick(row.organization_id)}
      rowActions={() => (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
      emptyState={{
        title: "No organization preferences yet",
        description: "Counters fill as auto-ingest cost lands.",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// In-flight batches
// ---------------------------------------------------------------------------

function PendingBatchesTable({
  batches,
  loading,
  refreshing,
  total,
  onPick,
}: {
  batches: BatchRow[];
  loading: boolean;
  refreshing: boolean;
  total: number | null;
  onPick: (batchRowId: string) => void;
}) {
  const columns: MatrxColumnDef<BatchRow>[] = [
    {
      accessorKey: "custom_id",
      header: "Custom ID",
      filter: "text",
      width: 250,
      cell: (row) => (
        <span className="font-mono text-xs" title={row.custom_id ?? undefined}>
          {row.custom_id ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "provider",
      header: "Provider",
      filter: "select",
      width: 125,
      cell: (row) => (
        <Badge variant="outline" className="font-mono">
          {row.provider}
        </Badge>
      ),
    },
    {
      id: "organization",
      header: "Org",
      accessorFn: (row) =>
        row.organization_name ?? row.organization_id ?? "personal",
      filter: "text",
      width: 180,
      cell: (row) =>
        row.organization_id ? (
          <EntityRef
            token="organization"
            id={row.organization_id}
            name={row.organization_name ?? row.organization_id}
            showIcon={false}
            openInNewTab
          />
        ) : (
          <span className="italic text-muted-foreground">personal</span>
        ),
    },
    {
      accessorKey: "submitted_at",
      header: "Submitted",
      filter: "date",
      width: 140,
      cell: (row) => (
        <span className="text-muted-foreground">
          {fmtRelativeTime(row.submitted_at)}
        </span>
      ),
    },
    {
      accessorKey: "poll_count",
      header: "Polls",
      filter: "number",
      align: "right",
      width: 80,
      cell: (row) => <span className="tabular-nums">{row.poll_count}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      filter: "select",
      width: 125,
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      accessorKey: "est_cost_usd",
      header: "Est. cost",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">{fmtUsdShort(row.est_cost_usd)}</span>
      ),
    },
  ];

  return (
    <MatrxDataTable
      tableId="administration/kg-cost/pending-batches"
      data={batches}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={loading}
      isFetching={refreshing}
      density="condensed"
      stickyHeader
      pageSize={0}
      hidePagination
      copy={false}
      toolbar={{
        title: "In-flight batches",
        search: true,
        searchPlaceholder: "Search in-flight batches…",
        actions: (
          <AppLink
            href="/administration/knowledge/batch"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Per-item batch view
          </AppLink>
        ),
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      coverage={{ noun: "batch", total: total ?? undefined, cap: 100, answeredBy: "source" }}
      onRowOpen={(row) => onPick(row.id)}
      rowActions={() => (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
      emptyState={{
        title: "No in-flight batches",
        description:
          "Pending submissions appear here within seconds of dispatch; completion lands within the provider SLA.",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Org auto-ingest controls (admin-editable)
// ---------------------------------------------------------------------------

/**
 * Admin-editable auto-ingest switches for one org, embedded in the org-detail
 * dialog. Reuses `useOrgAutoRagPreference` — the SAME React → Supabase write
 * path the org owners' settings panel uses — so an operator can flip the
 * master auto-Knowledge switch and the suggestion sweeps for any org. Cost
 * figures (used / budget / window) keep coming from the read-only Python
 * `kgCostService` shown above; these switches just edit booleans on the row.
 * (The per-org "index non-PDF content" switch was removed 2026-09-26: nothing
 * reads it since the `knowledge.intelligence_policy_*` knobs decide.)
 */
function OrgAutoIngestControls({ orgId }: { orgId: string }) {
  const pref = useOrgAutoRagPreference(orgId);

  const handleToggleEnabled = (next: boolean) => {
    void pref
      .setEnabled(next)
      .then(() =>
        toast.success(next ? "Auto-Knowledge enabled" : "Auto-Knowledge disabled"),
      )
      .catch((err) => toastWriteFailure(err, { action: FIELD_ACTION.enabled }));
  };

  const handleToggleSuggestionSweeps = (next: boolean) => {
    void pref
      .setSuggestionSweeps(next)
      .then(() =>
        toast.success(
          next
            ? "Scope-value suggestions enabled"
            : "Scope-value suggestions disabled",
        ),
      )
      .catch((err) => toastWriteFailure(err, { action: FIELD_ACTION.suggestionSweeps }));
  };

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Auto-ingest controls</h3>
      <div className="space-y-2 rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-2 min-w-0">
            <Brain className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <Label htmlFor="admin-org-auto-rag" className="text-sm">
                Auto knowledge-graph (master)
              </Label>
              <p className="text-xs text-muted-foreground">
                Org-wide on/off for auto-ingest into the knowledge graph.
              </p>
            </div>
          </div>
          {pref.loading ? (
            <Skeleton className="h-6 w-10" />
          ) : (
            <Switch
              id="admin-org-auto-rag"
              checked={pref.enabled}
                aria-busy={pref.pendingField === "enabled" || undefined}
              onCheckedChange={handleToggleEnabled}
              disabled={pref.saving}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-2">
          <div className="flex items-start gap-2 min-w-0">
            <Lightbulb className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <Label htmlFor="admin-org-suggestion-sweeps" className="text-sm">
                Suggest scope values from existing content
              </Label>
              <p className="text-xs text-muted-foreground">
                On = when a scope/field is added, suggest values from
                already-indexed content. Always requires confirmation. Off by
                default.
              </p>
            </div>
          </div>
          {pref.loading ? (
            <Skeleton className="h-6 w-10" />
          ) : (
            <Switch
              id="admin-org-suggestion-sweeps"
              checked={pref.suggestionSweeps}
                aria-busy={pref.pendingField === "suggestionSweeps" || undefined}
              onCheckedChange={handleToggleSuggestionSweeps}
              disabled={!pref.enabled || pref.saving}
            />
          )}
        </div>

        {pref.error && <p className="text-xs text-destructive">{pref.error}</p>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Org detail dialog
// ---------------------------------------------------------------------------

function OrgDetailDialog({
  orgId,
  onClose,
  onDetailChange,
}: {
  orgId: string | null;
  onClose: () => void;
  onDetailChange: (detail: OrgCostDetailResponse | null) => void;
}) {
  const [detail, setDetail] = useState<OrgCostDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return undefined;
    setLoading(true);
    setError(null);
    setDetail(null);
    onDetailChange(null);
    const controller = new AbortController();
    getOrgCostDetail(orgId, { signal: controller.signal })
      .then((value) => {
        setDetail(value);
        onDetailChange(value);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load org detail");
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [orgId, onDetailChange]);

  return (
    <Dialog open={orgId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {detail?.organization_name ?? orgId?.slice(0, 8) ?? "Organization"}{" "}
            cost detail
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {detail && (
          <ScrollArea className="max-h-[70dvh]">
            <div className="space-y-5 pr-3">
              {/* Header stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    Used today
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {fmtUsdShort(detail.used_today_usd)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Budget</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {fmtUsdShort(detail.budget_usd)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    Window started
                  </div>
                  <div className="text-sm tabular-nums">
                    {fmtRelativeTime(detail.window_start)}
                  </div>
                </div>
              </div>

              {/* Admin-editable auto-ingest switches for this org */}
              <OrgAutoIngestControls orgId={detail.organization_id} />

              {/* 30-day daily series */}
              <section>
                  <MatrxDataTable
                    tableId="administration/kg-cost/org-detail/daily-cost"
                    data={detail.daily_series}
                    columns={[
                      {
                        accessorKey: "date",
                        header: "Date",
                        filter: "date",
                        cell: (row) => (
                          <span className="font-mono text-xs">{row.date}</span>
                        ),
                      },
                      {
                        accessorKey: "cost_usd",
                        header: "Cost",
                        filter: "number",
                        align: "right",
                        cell: (row) => (
                          <span className="tabular-nums">
                            {fmtUsd(row.cost_usd)}
                          </span>
                        ),
                      },
                    ]}
                    getRowId={(row) => row.date}
                    density="condensed"
                    stickyHeader
                    pageSize={0}
                    hidePagination
                    toolbar={{ title: "Last 30 days", search: false }}
                    emptyState={{ title: "No cost in this window." }}
                    detail={{ enabled: false }}
                    window={{ enabled: false }}
                    coverage={{
                      noun: "daily cost",
                      total: detail.daily_series.length,
                      answeredBy: "source",
                    }}
                  />
              </section>

              {/* Top sources */}
              <section>
                  <MatrxDataTable
                    tableId="administration/kg-cost/org-detail/top-sources"
                    data={detail.top_sources}
                    columns={[
                      {
                        accessorKey: "source",
                        header: "Source",
                        filter: "text",
                        cell: (row) => (
                          <span className="font-mono text-xs">{row.source}</span>
                        ),
                      },
                      {
                        accessorKey: "cost_usd",
                        header: "Cost",
                        filter: "number",
                        align: "right",
                        cell: (row) => (
                          <span className="tabular-nums">
                            {fmtUsd(row.cost_usd)}
                          </span>
                        ),
                      },
                      {
                        accessorKey: "count",
                        header: "Events",
                        filter: "number",
                        align: "right",
                        cell: (row) => (
                          <span className="tabular-nums">{row.count}</span>
                        ),
                      },
                    ]}
                    getRowId={(row) => row.source}
                    density="condensed"
                    stickyHeader
                    pageSize={0}
                    hidePagination
                    toolbar={{ title: "Top sources (30 days)", search: false }}
                    emptyState={{ title: "No source breakdown available." }}
                    detail={{ enabled: false }}
                    window={{ enabled: false }}
                    coverage={{
                      noun: "source",
                      total: detail.top_sources.length,
                      answeredBy: "source",
                    }}
                  />
              </section>

              {/* Batch summary */}
              <section>
                  <MatrxDataTable
                    tableId="administration/kg-cost/org-detail/batches-by-status"
                    data={detail.batch_summary}
                    columns={[
                      {
                        accessorKey: "status",
                        header: "Status",
                        filter: "select",
                        cell: (row) => <StatusBadge status={row.status} />,
                      },
                      {
                        accessorKey: "count",
                        header: "Count",
                        filter: "number",
                        align: "right",
                        cell: (row) => (
                          <span className="tabular-nums">{row.count}</span>
                        ),
                      },
                      {
                        accessorKey: "total_cost_usd",
                        header: "Total cost",
                        filter: "number",
                        align: "right",
                        cell: (row) => (
                          <span className="tabular-nums">
                            {fmtUsd(row.total_cost_usd)}
                          </span>
                        ),
                      },
                    ]}
                    getRowId={(row) => row.status}
                    density="condensed"
                    stickyHeader
                    pageSize={0}
                    hidePagination
                    toolbar={{ title: "Batches by status", search: false }}
                    emptyState={{ title: "No batch submissions yet." }}
                    detail={{ enabled: false }}
                    window={{ enabled: false }}
                    coverage={{
                      noun: "batch status",
                      total: detail.batch_summary.length,
                      answeredBy: "source",
                    }}
                  />
              </section>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Batch detail dialog
// ---------------------------------------------------------------------------

function BatchDetailDialog({
  batchRowId,
  onClose,
  onDetailChange,
}: {
  batchRowId: string | null;
  onClose: () => void;
  onDetailChange: (detail: BatchDetailResponse | null) => void;
}) {
  const [detail, setDetail] = useState<BatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchRowId) return undefined;
    setLoading(true);
    setError(null);
    setDetail(null);
    onDetailChange(null);
    const controller = new AbortController();
    getBatchDetail(batchRowId, { signal: controller.signal })
      .then((value) => {
        setDetail(value);
        onDetailChange(value);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          e instanceof Error ? e.message : "Failed to load batch detail",
        );
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [batchRowId, onDetailChange]);

  return (
    <Dialog
      open={batchRowId !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {detail ? `Batch ${detail.custom_id}` : "Batch detail"}
          </DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {detail && (
          <ScrollArea className="max-h-[70dvh]">
            <div className="space-y-4 pr-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Provider</dt>
                <dd className="font-mono">{detail.provider}</dd>

                <dt className="text-muted-foreground">Kind</dt>
                <dd className="font-mono">{detail.kind}</dd>

                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={detail.status} />
                </dd>

                <dt className="text-muted-foreground">Provider batch_id</dt>
                <dd className="font-mono text-xs break-all">
                  {detail.batch_id ?? "—"}
                </dd>

                <dt className="text-muted-foreground">Organization</dt>
                <dd>
                  {detail.organization_id ? (
                    <EntityRef
                      token="organization"
                      id={detail.organization_id}
                      name={detail.organization_name ?? detail.organization_id}
                      showIcon={false}
                      openInNewTab
                      wrap
                    />
                  ) : (
                    "personal"
                  )}
                </dd>

                {/* No `user` token exists in the entity registry, so there is
                    no door to offer and none is fabricated. What the old markup
                    DID do is destroy the id: `.slice(0, 8)…` is neither
                    openable nor copyable, which is the worst of both. The full
                    id at least answers "who ran this?" when pasted into the
                    users console. */}
                <dt className="text-muted-foreground">User</dt>
                <dd className="break-all font-mono text-xs">
                  {detail.created_by ?? "—"}
                </dd>

                {/* THE most valuable door on a cost dashboard: `source_kind` IS
                    a canonical entity token and `source_id` its id, so
                    "which document cost me this?" was always answerable and was
                    being rendered as the string "document:8f3a…". Same shape as
                    the events audit. A `source_kind` outside the token set
                    degrades to plain text inside the primitive, so every value
                    is safe. `openInNewTab` because this is an admin surface —
                    `/documents/{id}` and friends live on the main host, so a
                    same-tab click would be a cross-origin load that discards
                    the dashboard (see proxy.ts's satellite gate). */}
                <dt className="text-muted-foreground">Source</dt>
                <dd className="font-mono text-xs">
                  {detail.source_kind && detail.source_id ? (
                    <>
                      {detail.source_kind}:{" "}
                      <EntityRef
                        token={detail.source_kind}
                        id={detail.source_id}
                        name={detail.source_id}
                        showIcon={false}
                        openInNewTab
                        wrap
                      />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>

                <dt className="text-muted-foreground">Submitted</dt>
                <dd>
                  {new Date(detail.submitted_at).toLocaleString()} (
                  {fmtRelativeTime(detail.submitted_at)})
                </dd>

                <dt className="text-muted-foreground">Completed</dt>
                <dd>
                  {detail.completed_at
                    ? new Date(detail.completed_at).toLocaleString()
                    : "—"}
                </dd>

                <dt className="text-muted-foreground">Poll count</dt>
                <dd className="tabular-nums">{detail.poll_count}</dd>

                <dt className="text-muted-foreground">Estimated cost</dt>
                <dd className="tabular-nums">{fmtUsd(detail.est_cost_usd)}</dd>

                <dt className="text-muted-foreground">Actual cost</dt>
                <dd className="tabular-nums">{fmtUsd(detail.cost_usd)}</dd>

                <dt className="text-muted-foreground">Tokens in / out</dt>
                <dd className="tabular-nums">
                  {detail.tokens_in ?? "—"} / {detail.tokens_out ?? "—"}
                </dd>
              </dl>

              {detail.response_uri && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold">Response URI</h3>
                  <a
                    href={detail.response_uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    {detail.response_uri}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </section>
              )}

              {Boolean(detail.error) && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold text-destructive">
                    Error
                  </h3>
                  <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs overflow-x-auto">
                    {JSON.stringify(detail.error, null, 2)}
                  </pre>
                </section>
              )}

              <section>
                <h3 className="mb-1 text-sm font-semibold">Metadata</h3>
                <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs overflow-x-auto">
                  {JSON.stringify(detail.metadata ?? {}, null, 2)}
                </pre>
              </section>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Unit economics — per-run ledger (public.fn_kg_cost_unit_economics)
// ---------------------------------------------------------------------------

function BySourceKindTable({
  rows,
  loading,
}: {
  rows: UnitEconomicsBySourceKindRow[];
  loading: boolean;
}) {
  const columns: MatrxColumnDef<UnitEconomicsBySourceKindRow>[] = [
    {
      accessorKey: "source_kind",
      header: "Kind",
      filter: "select",
      width: 160,
      frozen: true,
      cell: (row) => (
        <span className="font-mono text-xs">
          {row.source_kind}
          {num(row.stuck_running) > 0 && (
            <Badge variant="destructive" className="ml-2 font-mono text-[10px]">
              {num(row.stuck_running)} stuck
            </Badge>
          )}
        </span>
      ),
    },
    {
      accessorKey: "runs",
      header: "Runs",
      filter: "number",
      align: "right",
      width: 80,
      cell: (row) => <span className="tabular-nums">{row.runs}</span>,
    },
    {
      accessorKey: "successes",
      header: "OK",
      filter: "number",
      align: "right",
      width: 75,
      cell: (row) => <span className="tabular-nums">{row.successes}</span>,
    },
    {
      accessorKey: "errors",
      header: "Errors",
      filter: "number",
      align: "right",
      width: 80,
      cell: (row) => <span className="tabular-nums">{row.errors}</span>,
    },
    {
      accessorKey: "skips",
      header: "Skipped",
      filter: "number",
      align: "right",
      width: 85,
      cell: (row) => <span className="tabular-nums">{row.skips}</span>,
    },
    {
      accessorKey: "stuck_running",
      header: "Stuck",
      filter: "number",
      align: "right",
      width: 80,
      cell: (row) => (
        <span className="tabular-nums">{num(row.stuck_running)}</span>
      ),
    },
    {
      accessorKey: "p50_cost_usd",
      header: "p50",
      filter: "number",
      align: "right",
      width: 100,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.p50_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "p90_cost_usd",
      header: "p90",
      filter: "number",
      align: "right",
      width: 100,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.p90_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "max_cost_usd",
      header: "Max",
      filter: "number",
      align: "right",
      width: 100,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.max_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "cost_per_1k_chars_usd",
      header: "$ / 1k chars",
      filter: "number",
      align: "right",
      width: 125,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.cost_per_1k_chars_usd))}
        </span>
      ),
    },
    {
      accessorKey: "embedding_cost_usd",
      header: "Embedding",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.embedding_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "extraction_cost_usd",
      header: "Extraction",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.extraction_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "cleanup_cost_usd",
      header: "Cleanup",
      filter: "number",
      align: "right",
      width: 105,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.cleanup_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "enrichment_cost_usd",
      header: "Enrichment",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.enrichment_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "cache_hit_pct",
      header: "Cache hit %",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">
          {num(row.cache_hit_pct).toFixed(1)}%
        </span>
      ),
    },
  ];

  return (
    <MatrxDataTable
      tableId="administration/kg-cost/by-source-kind"
      data={rows}
      columns={columns}
      getRowId={(row) => row.source_kind}
      isLoading={loading}
      density="condensed"
      stickyHeader
      pageSize={0}
      hidePagination
      copy={false}
      toolbar={{
        title: "By source kind",
        search: true,
        searchPlaceholder: "Search source kinds…",
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      coverage={{ noun: "source kind", total: rows.length, answeredBy: "source" }}
      emptyState={{ title: "No ingest runs in this window" }}
    />
  );
}

function RecentRunsTable({
  rows,
  loading,
}: {
  rows: UnitEconomicsRecentRun[];
  loading: boolean;
}) {
  const columns: MatrxColumnDef<UnitEconomicsRecentRun>[] = [
    {
      accessorKey: "started_at",
      header: "Started",
      filter: "date",
      width: 145,
      frozen: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {fmtCompactTime(row.started_at)}
        </span>
      ),
    },
    {
      accessorKey: "source_kind",
      header: "Kind",
      filter: "select",
      width: 130,
      cell: (row) => <span className="font-mono text-xs">{row.source_kind}</span>,
    },
    {
      id: "source_id",
      header: "Source ID",
      accessorFn: (row) => row.source_id || "—",
      filter: "text",
      width: 140,
      cell: (row) => (
        <span className="font-mono text-xs">
          {row.source_id ? (
            <EntityRef
              token={row.source_kind}
              id={row.source_id}
              name={row.source_id}
              showIcon={false}
              openInNewTab
            >
              <span className="whitespace-nowrap">{row.source_id.slice(0, 8)}…</span>
            </EntityRef>
          ) : (
            "—"
          )}
        </span>
      ),
    },
    {
      accessorKey: "triggered_by",
      header: "Triggered by",
      filter: "text",
      width: 170,
      cell: (row) => (
        <span
          className="block max-w-[10rem] truncate text-xs text-muted-foreground"
          title={row.triggered_by ?? undefined}
        >
          {row.triggered_by ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      filter: "select",
      width: 125,
      cell: (row) => {
        const stuck = isStuckRun(row);
        return (
          <div className="flex flex-col gap-0.5">
            <Badge
              variant={
                row.status === "success"
                  ? "outline"
                  : row.status === "error"
                    ? "destructive"
                    : "secondary"
              }
              className="w-fit font-mono text-[10px]"
            >
              {row.status}
            </Badge>
            {stuck && (
              <span className="text-[10px] font-semibold text-destructive">
                stuck &gt; 10m
              </span>
            )}
            {row.status === "skipped" && row.skip_reason && (
              <span className="text-[10px] text-muted-foreground">
                {row.skip_reason}
              </span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "cost_is_exact",
      header: "Exact cost",
      filter: "boolean",
      width: 100,
      cell: (row) => (
        <span className="text-xs text-muted-foreground">
          {row.cost_is_exact ? "exact" : "inexact"}
        </span>
      ),
    },
    {
      accessorKey: "chunks_written",
      header: "Chunks written",
      filter: "number",
      align: "right",
      width: 125,
      cell: (row) => (
        <span className="tabular-nums text-xs">{num(row.chunks_written)}</span>
      ),
    },
    {
      accessorKey: "chunks_reused",
      header: "Chunks reused",
      filter: "number",
      align: "right",
      width: 120,
      cell: (row) => (
        <span className="tabular-nums text-xs">{num(row.chunks_reused)}</span>
      ),
    },
    {
      accessorKey: "embedding_cost_usd",
      header: "Embedding",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.embedding_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "extraction_cost_usd",
      header: "Extraction",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.extraction_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "cleanup_cost_usd",
      header: "Cleanup",
      filter: "number",
      align: "right",
      width: 105,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.cleanup_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "enrichment_cost_usd",
      header: "Enrichment",
      filter: "number",
      align: "right",
      width: 110,
      cell: (row) => (
        <span className="tabular-nums">
          {fmtUsdShort(num(row.enrichment_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "total_cost_usd",
      header: "Total",
      filter: "number",
      align: "right",
      width: 105,
      cell: (row) => (
        <span className="font-medium tabular-nums">
          {fmtUsdShort(num(row.total_cost_usd))}
        </span>
      ),
    },
    {
      accessorKey: "duration_ms",
      header: "Duration",
      filter: "number",
      align: "right",
      width: 100,
      cell: (row) => (
        <span className="tabular-nums text-xs text-muted-foreground">
          {fmtDuration(row.duration_ms)}
        </span>
      ),
    },
  ];

  return (
    <MatrxDataTable
      tableId="administration/kg-cost/recent-runs"
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={loading}
      density="condensed"
      stickyHeader
      pageSize={0}
      hidePagination
      copy={false}
      toolbar={{
        title: "Recent runs",
        search: true,
        searchPlaceholder: "Search recent runs…",
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      coverage={{ noun: "run", cap: 50, answeredBy: "client" }}
      rowClassName={(row) => (isStuckRun(row) ? "bg-destructive/5" : undefined)}
      emptyState={{ title: "No runs recorded yet" }}
    />
  );
}

const UNIT_ECON_DAY_OPTIONS = [7, 30, 90] as const;

function UnitEconomicsSection({ refreshTick, onRetry }: { refreshTick: number; onRetry: () => void }) {
  const [data, setData] = useState<UnitEconomicsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<(typeof UNIT_ECON_DAY_OPTIONS)[number]>(30);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetchUnitEconomics(days, { signal: controller.signal })
      .then(setData)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          e instanceof Error ? e.message : "Failed to load unit economics",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, refreshTick]);

  const stuckRunning =
    data?.by_source_kind.reduce((sum, r) => sum + num(r.stuck_running), 0) ??
    0;
  const cacheHits =
    data?.by_source_kind.reduce(
      (sum, r) => sum + num(r.embedding_cache_hits),
      0,
    ) ?? 0;
  const cacheCalls =
    data?.by_source_kind.reduce((sum, r) => sum + num(r.embedding_calls), 0) ??
    0;
  const cacheHitPct =
    cacheHits + cacheCalls > 0 ? (100 * cacheHits) / (cacheHits + cacheCalls) : null;

  const rawMultiplier = data?.enrichment.multiplier;
  const multiplierValue =
    rawMultiplier === null || rawMultiplier === undefined
      ? null
      : num(rawMultiplier);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Unit economics — per-run ledger
        </h2>
        <div className="flex items-center gap-1">
          {UNIT_ECON_DAY_OPTIONS.map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
              disabled={loading && days === d}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {error && <ReadFailure message={error} onRetry={onRetry} />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <KpiTile
          label={`Window total (${days}d)`}
          value={data ? fmtUsdShort(num(data.totals.total_cost_usd)) : null}
          icon={<Wallet className="h-3.5 w-3.5" />}
          loading={loading}
        />
        <KpiTile
          label="Projected monthly"
          value={
            data ? fmtUsdShort(num(data.totals.projected_monthly_usd)) : null
          }
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          loading={loading}
          hint={
            data
              ? `10x load: ${fmtUsdShort(num(data.totals.projected_monthly_10x_usd))}`
              : undefined
          }
        />
        <KpiTile
          label="Enrichment multiplier"
          value={
            data
              ? multiplierValue !== null
                ? `${multiplierValue.toFixed(1)}x`
                : "n/a"
              : null
          }
          icon={<Layers className="h-3.5 w-3.5" />}
          loading={loading}
          hint={
            data && multiplierValue === null
              ? "n/a — need runs both with and without enrich"
              : undefined
          }
        />
        <KpiTile
          label="Embedding cache-hit rate"
          value={
            data ? (cacheHitPct !== null ? `${cacheHitPct.toFixed(1)}%` : "—") : null
          }
          icon={<Database className="h-3.5 w-3.5" />}
          loading={loading}
        />
        <KpiTile
          label="Stuck running"
          value={data ? `${stuckRunning}` : null}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          loading={loading}
          highlight={stuckRunning > 0}
        />
        <KpiTile
          label="Inexact-cost runs"
          value={data ? `${data.totals.inexact_cost_runs}` : null}
          icon={<Gauge className="h-3.5 w-3.5" />}
          loading={loading}
        />
      </div>

      <div className="mt-4">
        <BySourceKindTable rows={data?.by_source_kind ?? []} loading={loading} />
      </div>

      <div className="mt-4">
        <RecentRunsTable rows={data?.recent_runs ?? []} loading={loading} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export function KgCostDashboard() {
  const [summary, setSummary] = useState<KgCostSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [orgs, setOrgs] = useState<OrgCostRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);
  const [orgsRefreshing, setOrgsRefreshing] = useState(false);
  const [orgsTotal, setOrgsTotal] = useState<number | null>(null);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesRefreshing, setBatchesRefreshing] = useState(false);
  const [batchesTotal, setBatchesTotal] = useState<number | null>(null);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [openOrgId, setOpenOrgId] = useState<string | null>(null);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);
  const [orgDetail, setOrgDetail] = useState<OrgCostDetailResponse | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchDetailResponse | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(null);
    getKgCostSummary({ signal: controller.signal })
      .then(setSummary)
      .catch((error: unknown) => { if (!controller.signal.aborted) setSummaryError(readFailureMessage(error, "cost summary")); })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    if (orgs.length === 0) setOrgsLoading(true); else setOrgsRefreshing(true);
    setOrgsError(null);
    listOrgCosts({ limit: 200 }, { signal: controller.signal })
      .then((r) => { setOrgs(r.items); setOrgsTotal(r.total); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setOrgsError(readFailureMessage(error, "organizations")); })
      .finally(() => {
        if (!controller.signal.aborted) { setOrgsLoading(false); setOrgsRefreshing(false); }
      });
    return () => controller.abort();
  }, [refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    if (batches.length === 0) setBatchesLoading(true); else setBatchesRefreshing(true);
    setBatchesError(null);
    listPendingBatches({ limit: 100 }, { signal: controller.signal })
      .then((r) => { setBatches(r.items); setBatchesTotal(r.total); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setBatchesError(readFailureMessage(error, "in-flight batches")); })
      .finally(() => {
        if (!controller.signal.aborted) { setBatchesLoading(false); setBatchesRefreshing(false); }
      });
    return () => controller.abort();
  }, [refreshTick]);

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME}
      getScope={() => createAdminKnowledgeScope({
        knowledge_section: "kg_cost",
        ...(summary ? { kg_cost_summary: { ...summary } } : {}),
        kg_cost_org_rows: orgs,
        kg_cost_batch_rows: batches,
        ...(openOrgId ? { kg_cost_open_org_id: openOrgId } : {}),
        ...(orgDetail ? { kg_cost_org_detail: { ...orgDetail } } : {}),
        ...(openBatchId ? { kg_cost_open_batch_id: openBatchId } : {}),
        ...(batchDetail ? { kg_cost_batch_detail: { ...batchDetail } } : {}),
      })}
    >
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <h1 className="text-lg font-semibold">KG Cost</h1>
          <p className="text-xs text-muted-foreground">
            Auto-ingest spend per org and in-flight provider Batch API
            submissions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <AppLink
            href="/administration/knowledge/batch"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Batch system
          </AppLink>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={summaryLoading || orgsLoading || batchesLoading}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          <KpiTiles summary={summary} loading={summaryLoading} />
          {summaryError && <ReadFailure message={summaryError} onRetry={() => setRefreshTick((t) => t + 1)} />}

          <UnitEconomicsSection refreshTick={refreshTick} onRetry={() => setRefreshTick((t) => t + 1)} />

          <section>
            {orgsError && <ReadFailure message={orgsError} onRetry={() => setRefreshTick((t) => t + 1)} />}
            <OrgLeaderboard
              orgs={orgs}
              loading={orgsLoading}
              refreshing={orgsRefreshing}
              total={orgsTotal}
              onPick={setOpenOrgId}
            />
          </section>

          <section>
            {batchesError && <ReadFailure message={batchesError} onRetry={() => setRefreshTick((t) => t + 1)} />}
            <PendingBatchesTable
              batches={batches}
              loading={batchesLoading}
              refreshing={batchesRefreshing}
              total={batchesTotal}
              onPick={setOpenBatchId}
            />
          </section>
        </div>
      </ScrollArea>

      <OrgDetailDialog orgId={openOrgId} onClose={() => setOpenOrgId(null)} onDetailChange={setOrgDetail} />
      <BatchDetailDialog
        batchRowId={openBatchId}
        onClose={() => setOpenBatchId(null)}
        onDetailChange={setBatchDetail}
      />
    </div>
    </SurfaceRuntimeProvider>
  );
}
