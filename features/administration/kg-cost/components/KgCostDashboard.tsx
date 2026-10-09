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
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { useAdminCost } from "@/components/cost/useAdminCost";
import { splitAdminCostColumns } from "@/components/cost/adminCostColumns";
import { useEffect, useState } from "react";
import {
  serverTableInitialState,
  useServerTable,
} from "@/features/admin/shared/server-table/useServerTable";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from "@/features/surfaces/manifests/admin-knowledge.manifest";
import {
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Brain,
  Lightbulb,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import { KpiGrid, KpiTile } from "@/components/official/kpi/KpiTile";
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
  searchOrgCosts,
  getOrgCostDetail,
  listPendingBatches,
  getBatchDetail,
  type KgCostSummaryResponse,
  type OrgCostRow,
  type OrgCostDetailResponse,
  type BatchRow,
  type BatchDetailResponse,
  type BatchStatus,
} from "../service/kgCostService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { readOf, type ReadOutcome } from "@ai-matrx/design-system";

import { KgCostExplorer } from "./KgCostExplorer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


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

function percentColorClass(percent: number): string {
  if (percent >= 100) return "text-destructive font-semibold";
  if (percent >= 80)
    return "text-orange-500 dark:text-orange-400 font-semibold";
  if (percent >= 50) return "text-foreground";
  return "text-muted-foreground";
}

// ---------------------------------------------------------------------------
// KPI tiles — the official KpiTile: one-line hint, definition in the `title` tooltip.
// ---------------------------------------------------------------------------

/** Six tiles fit one row only where "$0.0000 · 00,000 points" fits a tile. */
const KPI_GRID_CLASS = "lg:grid-cols-3 2xl:grid-cols-6";

function ReadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-ink"><span>{message}</span><Button variant="outline" onClick={onRetry}>Retry</Button><ErrorAlchemyMenu /></div>;
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
  const fmtUsd = useAdminCost();
  const orgsOverCap = summary?.orgs_over_80pct ?? 0;

  return (
    <KpiGrid className={KPI_GRID_CLASS}>
      <KpiTile
        label="Spend (24h)"
        value={summary ? fmtUsd(summary.spend_today_usd) : null}
        loading={loading}
      />
      <KpiTile
        label="Spend (7d)"
        value={summary ? fmtUsd(summary.spend_7d_usd) : null}
        loading={loading}
      />
      <KpiTile
        label="Orgs over 80% of cap"
        value={summary ? `${summary.orgs_over_80pct}` : null}
        tone={orgsOverCap > 0 ? "bad" : "neutral"}
        loading={loading}
      />
      <KpiTile
        label="Pending batches"
        value={summary ? `${summary.pending_batches}` : null}
        loading={loading}
      />
      {/* batch.savings_summary — the same actual tokens at the live catalog rate minus the
          batch bill, completed batch items, last 7 days; Platform Spend leads with it too. */}
      <KpiTile
        label="Batch savings (7d)"
        value={summary ? fmtUsd(summary.batch_savings_7d_usd ?? 0) : null}
        title="Live-rate cost of the same tokens, minus the batch bill."
        loading={loading}
      />
      <KpiTile
        label="NER coverage"
        value={fmtPercent(summary?.ner_coverage_pct)}
        title="Indexed chunks with entities extracted."
        loading={loading}
      />
    </KpiGrid>
  );
}

// ---------------------------------------------------------------------------
// Org leaderboard
// ---------------------------------------------------------------------------

const ORG_INITIAL_STATE = serverTableInitialState({ id: "daily_auto_rag_cost_used_usd", direction: "desc" });

/** Search, column filters, sort and paging are answered by `admin_kg_cost_orgs` over EVERY organization. */
function OrgLeaderboard({
  tableProps,
  onPick,
}: {
  tableProps: ReturnType<typeof useServerTable<OrgCostRow>>["tableProps"];
  onPick: (orgId: string) => void;
}) {
  const fmtUsd = useAdminCost();
  const costColumns: MatrxColumnDef<OrgCostRow>[] = splitAdminCostColumns<OrgCostRow>([
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
          {fmtUsd(row.daily_auto_rag_cost_used_usd)}
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
          {fmtUsd(row.daily_auto_rag_budget_usd)}
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
  ], ["daily_auto_rag_cost_used_usd", "daily_auto_rag_budget_usd"]);
  // The "points" twin is the USD value times a rate the browser holds: the database cannot filter it
  // (filter the USD column), and it sorts exactly like its USD column.
  const columns = costColumns.map((c) =>
    typeof c.id === "string" && c.id.endsWith("_points") ? { ...c, filter: false as const } : c,
  );

  return (
    <MatrxDataTable
      tableId="administration/kg-cost/organizations"
      {...tableProps}
      columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: () => (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      ) }]}
      getRowId={(row) => row.organization_id}
      density="condensed"
      stickyHeader
      toolbar={{
        title: "Organizations",
        search: true,
        searchPlaceholder: "Search organizations…",
      }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      onRowOpen={(row) => onPick(row.organization_id)}

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
  read,
}: {
  batches: BatchRow[];
  loading: boolean;
  refreshing: boolean;
  total: number | null;
  onPick: (batchRowId: string) => void;
  read: ReadOutcome;
}) {
  const fmtUsd = useAdminCost();
  const columns: MatrxColumnDef<BatchRow>[] = splitAdminCostColumns<BatchRow>([
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
        <span className="tabular-nums">{fmtUsd(row.est_cost_usd)}</span>
      ),
    },
  ], ["est_cost_usd"]);

  return (
    <MatrxDataTable
      tableId="administration/kg-cost/pending-batches"
      data={batches}
      columns={[...(columns), { id: "custom-actions", header: "Actions", sortable: false, filter: false, customActions: () => (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      ) }]}
      getRowId={(row) => row.id}
      read={read}
      isLoading={loading}
      isFetching={refreshing}
      density="condensed"
      stickyHeader
      pageSize={0}
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
                Auto-ingest into the knowledge graph
              </Label>
              <p className="text-xs text-muted-foreground">
                Applies to the whole organization
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
              {/* On when a scope field is added; off by default; every suggestion waits for confirmation. */}
              <p className="text-xs text-muted-foreground">
                From indexed content — you confirm each one
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

        {pref.error && <p className="text-xs text-destructive">{pref.error} <ErrorAlchemyMenu error={pref.error} /></p>}
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
  const fmtUsd = useAdminCost();
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
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-ink">
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        )}

        {!error && detail && (
          <ScrollArea className="max-h-[70dvh]">
            <div className="space-y-5 pr-3">
              {/* Header stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">
                    Used today
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {fmtUsd(detail.used_today_usd)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Budget</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {fmtUsd(detail.budget_usd)}
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
                    columns={splitAdminCostColumns<OrgCostDetailResponse["daily_series"][number]>([
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
                    ], ["cost_usd"])}
                    getRowId={(row) => row.date}
                    density="condensed"
                    stickyHeader
                    pageSize={0}
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
                    columns={splitAdminCostColumns<OrgCostDetailResponse["top_sources"][number]>([
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
                    ], ["cost_usd"])}
                    getRowId={(row) => row.source}
                    density="condensed"
                    stickyHeader
                    pageSize={0}
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
                    columns={splitAdminCostColumns<OrgCostDetailResponse["batch_summary"][number]>([
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
                    ], ["total_cost_usd"])}
                    getRowId={(row) => row.status}
                    density="condensed"
                    stickyHeader
                    pageSize={0}
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
  const fmtUsd = useAdminCost();
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
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-ink">
            {error}
            <ErrorAlchemyMenu error={error} />
          </div>
        )}

        {!error && detail && (
          <ScrollArea className="max-h-[70dvh]">
            <div className="space-y-4 pr-3">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Provider</dt>
                <dd className="font-mono">{detail.provider}</dd>

                <dt className="text-muted-foreground">Kind</dt>
                <dd>{humanizeIdentifier(detail.kind)}</dd>

                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={detail.status} />
                </dd>

                <dt className="text-muted-foreground">Provider batch ID</dt>
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
                    <ErrorAlchemyMenu />
                  </h3>
                  <pre className="rounded-md border border-border bg-muted/50 p-3 text-xs overflow-x-auto">
                    {JSON.stringify(detail.error, null, 2)}
                    <ErrorAlchemyMenu />
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
// Main dashboard
// ---------------------------------------------------------------------------

export function KgCostDashboard() {
  const [summary, setSummary] = useState<KgCostSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const orgTable = useServerTable<OrgCostRow>(
    async (state) => {
      const page = await searchOrgCosts(state);
      return { rows: page.items, total: page.total };
    },
    ORG_INITIAL_STATE,
    "organizations",
  );
  const orgs = orgTable.rows;
  const reloadOrgs = orgTable.reload;

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

  // The header Refresh re-reads the organization page too.
  useEffect(() => {
    if (refreshTick > 0) reloadOrgs();
  }, [refreshTick, reloadOrgs]);

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
        </div>
        <div className="flex items-center gap-2">
          <AppLink
            href="/administration/knowledge/kg-cost/explore"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            data-kg-cost-explore-link=""
          >
            Explore unit economics
          </AppLink>
          <AppLink
            href="/administration/knowledge/batch"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Batch system
          </AppLink>
          <Button
            icon={<RefreshCw />}
            variant="outline"
            onClick={() => setRefreshTick((t) => t + 1)}
            disabled={summaryLoading || orgTable.loading || batchesLoading}
          >
            Refresh
          </Button>
        </div>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          <KpiTiles summary={summary} loading={summaryLoading} />
          {summaryError && <ReadFailure message={summaryError} onRetry={() => setRefreshTick((t) => t + 1)} />}

          <section data-kg-cost-unit-economics="" className="h-[40rem] overflow-hidden rounded-md border border-border">
            <KgCostExplorer />
          </section>

          <section>
            <OrgLeaderboard tableProps={orgTable.tableProps} onPick={setOpenOrgId} />
          </section>

          <section>
            <PendingBatchesTable
              read={readOf({ loading: batchesLoading, error: batchesError }, { what: "in-flight batches", onRetry: () => setRefreshTick((t) => t + 1) })}
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
