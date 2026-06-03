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
 */
import { useEffect, useState } from "react";
import {
  Wallet,
  Receipt,
  AlertTriangle,
  Clock,
  RefreshCw,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  getKgCostSummary,
  listOrgCosts,
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

function fmtRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}

const STATUS_VARIANT: Record<BatchStatus, "secondary" | "default" | "destructive" | "outline"> = {
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
  if (percent >= 80) return "text-orange-500 dark:text-orange-400 font-semibold";
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
}: {
  label: string;
  value: string | null;
  icon: React.ReactNode;
  loading: boolean;
  highlight?: boolean;
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
    </div>
  );
}

function KpiTiles({ summary, loading }: { summary: KgCostSummaryResponse | null; loading: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org leaderboard
// ---------------------------------------------------------------------------

function OrgLeaderboard({
  orgs,
  loading,
  onPick,
}: {
  orgs: OrgCostRow[];
  loading: boolean;
  onPick: (orgId: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (orgs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No organization_preferences rows yet. Counters fill as auto-ingest cost lands.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Organization</TableHead>
          <TableHead className="text-right">Used today</TableHead>
          <TableHead className="text-right">Budget</TableHead>
          <TableHead className="text-right">%</TableHead>
          <TableHead>Last charge</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orgs.map((row) => (
          <TableRow
            key={row.organization_id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onPick(row.organization_id)}
          >
            <TableCell className="font-medium">
              {row.organization_name ?? (
                <span className="text-muted-foreground">
                  {row.organization_id.slice(0, 8)}…
                </span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmtUsdShort(row.daily_auto_rag_cost_used_usd)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmtUsdShort(row.daily_auto_rag_budget_usd)}
            </TableCell>
            <TableCell
              className={`text-right tabular-nums ${percentColorClass(row.percent_used)}`}
            >
              {row.percent_used.toFixed(1)}%
            </TableCell>
            <TableCell className="text-muted-foreground">
              {fmtRelativeTime(row.last_charge_at)}
            </TableCell>
            <TableCell>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// In-flight batches
// ---------------------------------------------------------------------------

function PendingBatchesTable({
  batches,
  loading,
  onPick,
}: {
  batches: BatchRow[];
  loading: boolean;
  onPick: (batchRowId: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (batches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No in-flight batches. (Pending submissions appear here within seconds of
        a matrx-batch dispatch; completion lands within ~24h of the provider SLA.)
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Custom ID</TableHead>
          <TableHead>Provider</TableHead>
          <TableHead>Org</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead className="text-right">Polls</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Est. cost</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((row) => (
          <TableRow
            key={row.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => onPick(row.id)}
          >
            <TableCell className="font-mono text-xs">
              {row.custom_id.length > 30
                ? `${row.custom_id.slice(0, 30)}…`
                : row.custom_id}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className="font-mono">
                {row.provider}
              </Badge>
            </TableCell>
            <TableCell>
              {row.organization_name ?? (
                <span className="text-muted-foreground italic">personal</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {fmtRelativeTime(row.submitted_at)}
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.poll_count}</TableCell>
            <TableCell>
              <StatusBadge status={row.status} />
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {fmtUsdShort(row.est_cost_usd)}
            </TableCell>
            <TableCell>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Org detail dialog
// ---------------------------------------------------------------------------

function OrgDetailDialog({
  orgId,
  onClose,
}: {
  orgId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<OrgCostDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    const controller = new AbortController();
    getOrgCostDetail(orgId, { signal: controller.signal })
      .then(setDetail)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load org detail");
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [orgId]);

  return (
    <Dialog open={orgId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {detail?.organization_name ?? orgId?.slice(0, 8) ?? "Organization"} cost detail
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
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-5 pr-3">
              {/* Header stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">Used today</div>
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
                  <div className="text-xs text-muted-foreground">Window started</div>
                  <div className="text-sm tabular-nums">
                    {fmtRelativeTime(detail.window_start)}
                  </div>
                </div>
              </div>

              {/* 30-day daily series */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Last 30 days</h3>
                {detail.daily_series.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No cost in this window.</p>
                ) : (
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.daily_series.map((d) => (
                          <TableRow key={d.date}>
                            <TableCell className="font-mono text-xs">{d.date}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtUsd(d.cost_usd)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {/* Top sources */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Top sources (30 days)</h3>
                {detail.top_sources.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No source breakdown available.</p>
                ) : (
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead className="text-right">Events</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.top_sources.map((s) => (
                          <TableRow key={s.source}>
                            <TableCell className="font-mono text-xs">{s.source}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtUsd(s.cost_usd)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {s.count}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>

              {/* Batch summary */}
              <section>
                <h3 className="mb-2 text-sm font-semibold">Batches by status</h3>
                {detail.batch_summary.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No batch submissions yet.</p>
                ) : (
                  <div className="rounded-md border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Total cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detail.batch_summary.map((b) => (
                          <TableRow key={b.status}>
                            <TableCell>
                              <StatusBadge status={b.status} />
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{b.count}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtUsd(b.total_cost_usd)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
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
}: {
  batchRowId: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<BatchDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchRowId) return;
    setLoading(true);
    setError(null);
    setDetail(null);
    const controller = new AbortController();
    getBatchDetail(batchRowId, { signal: controller.signal })
      .then(setDetail)
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e.message : "Failed to load batch detail");
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setLoading(false);
      });
    return () => controller.abort();
  }, [batchRowId]);

  return (
    <Dialog open={batchRowId !== null} onOpenChange={(open) => !open && onClose()}>
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
          <ScrollArea className="max-h-[70vh]">
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
                <dd className="font-mono text-xs break-all">{detail.batch_id ?? "—"}</dd>

                <dt className="text-muted-foreground">Organization</dt>
                <dd>{detail.organization_name ?? "personal"}</dd>

                <dt className="text-muted-foreground">User</dt>
                <dd className="font-mono text-xs">{detail.user_id.slice(0, 8)}…</dd>

                <dt className="text-muted-foreground">Source</dt>
                <dd className="font-mono text-xs">
                  {detail.source_kind && detail.source_id
                    ? `${detail.source_kind}:${detail.source_id}`
                    : "—"}
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

              {detail.error && (
                <section>
                  <h3 className="mb-1 text-sm font-semibold text-destructive">Error</h3>
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
// Main dashboard
// ---------------------------------------------------------------------------

export function KgCostDashboard() {
  const [summary, setSummary] = useState<KgCostSummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [orgs, setOrgs] = useState<OrgCostRow[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(true);

  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);

  const [openOrgId, setOpenOrgId] = useState<string | null>(null);
  const [openBatchId, setOpenBatchId] = useState<string | null>(null);

  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    getKgCostSummary({ signal: controller.signal })
      .then(setSummary)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    setOrgsLoading(true);
    listOrgCosts({ limit: 200 }, { signal: controller.signal })
      .then((r) => setOrgs(r.items))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setOrgsLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

  useEffect(() => {
    const controller = new AbortController();
    setBatchesLoading(true);
    listPendingBatches({ limit: 100 }, { signal: controller.signal })
      .then((r) => setBatches(r.items))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setBatchesLoading(false);
      });
    return () => controller.abort();
  }, [refreshTick]);

  return (
    <div className="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <div>
          <h1 className="text-lg font-semibold">KG Cost</h1>
          <p className="text-xs text-muted-foreground">
            Auto-ingest spend per org and in-flight provider Batch API submissions.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRefreshTick((t) => t + 1)}
          disabled={summaryLoading || orgsLoading || batchesLoading}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          <KpiTiles summary={summary} loading={summaryLoading} />

          <section>
            <h2 className="mb-3 text-sm font-semibold">Organizations</h2>
            <OrgLeaderboard
              orgs={orgs}
              loading={orgsLoading}
              onPick={setOpenOrgId}
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold">In-flight batches</h2>
            <PendingBatchesTable
              batches={batches}
              loading={batchesLoading}
              onPick={setOpenBatchId}
            />
          </section>
        </div>
      </ScrollArea>

      <OrgDetailDialog orgId={openOrgId} onClose={() => setOpenOrgId(null)} />
      <BatchDetailDialog
        batchRowId={openBatchId}
        onClose={() => setOpenBatchId(null)}
      />
    </div>
  );
}
