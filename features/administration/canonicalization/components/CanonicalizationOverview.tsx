"use client";

/**
 * features/administration/canonicalization/components/CanonicalizationOverview.tsx
 *
 * Landing page for the Canonicalization Toolkit — KPI snapshot from
 * `audit.summary` + friends, the "Refresh audit" workflow (`audit.refresh()`,
 * which rebuilds the full gate over every registered table plus
 * `plpgsql_check` over every function), and quick links into the
 * pre-filtered Summary/Findings views. Read-only otherwise.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import type { CanonicalizationOverview as OverviewData, RefreshLogRow } from "../types";
import { errorMessageFrom, readJsonObject } from "../utils/apiClient";

function isRefreshLogRow(v: unknown): v is RefreshLogRow {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as Record<string, unknown>).run_at === "string"
  );
}

function isOverviewData(v: unknown): v is OverviewData {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.totalTables === "number" &&
    typeof r.certifiedTables === "number" &&
    typeof r.notCertifiedTables === "number" &&
    typeof r.totalFails === "number" &&
    typeof r.totalWarns === "number" &&
    (r.lastRefresh === null || isRefreshLogRow(r.lastRefresh))
  );
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function KpiTile({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  href,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: number | string;
  tone?: "good" | "bad" | "warn" | "neutral";
  href?: string;
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-destructive"
        : tone === "warn"
          ? "text-amber-600 dark:text-amber-400"
          : "text-foreground";

  const content = (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40">
      <Icon className={cn("h-6 w-6 shrink-0", toneClass)} />
      <div className="min-w-0">
        <div className={cn("text-2xl font-semibold tabular-nums", toneClass)}>{value}</div>
        <div className="truncate text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

export function CanonicalizationOverview() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/canonicalization?dataset=overview");
      const data = await readJsonObject(res);
      if (!res.ok) throw new Error(errorMessageFrom(data, res));
      if (!isOverviewData(data.overview)) throw new Error("Unexpected overview response shape");
      setOverview(data.overview);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/canonicalization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const data = await readJsonObject(res);
      if (!res.ok) throw new Error(errorMessageFrom(data, res));
      const durationMs = typeof data.durationMs === "number" ? data.durationMs : 0;
      const note = typeof data.note === "string" ? data.note : "";
      toast.success(
        `Audit store refreshed in ${(durationMs / 1000).toFixed(1)}s${note ? ` — ${note}` : ""}`,
      );
      setRefreshOpen(false);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Canonicalization Toolkit
          </h1>
          <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
            Live gate (<code>iam.verify_canonical</code> / <code>canonical_certify</code>) + the
            batch <code>audit.*</code> snapshot store over every registered table and plpgsql
            function. Read-only except for the refresh action below. See{" "}
            <code>docs/canonicalization_worklog.md</code> §5b for the full toolkit reference.
          </p>
        </div>
        <Button onClick={() => setRefreshOpen(true)} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          Refresh audit store
        </Button>
      </div>

      {error ? (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading || !overview ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <KpiTile
              icon={CheckCircle2}
              label="Certified tables"
              value={overview.certifiedTables}
              tone="good"
            />
            <KpiTile
              icon={XCircle}
              label="Not certified"
              value={overview.notCertifiedTables}
              tone="bad"
              href="/administration/canonicalization/summary"
            />
            <KpiTile
              icon={ShieldAlert}
              label="Total FAIL checks"
              value={overview.totalFails}
              tone="bad"
              href="/administration/canonicalization/findings?status=FAIL"
            />
            <KpiTile
              icon={AlertTriangle}
              label="Total WARN checks"
              value={overview.totalWarns}
              tone="warn"
              href="/administration/canonicalization/findings?status=WARN"
            />
            <KpiTile
              icon={GitBranch}
              label="Broken functions"
              value={overview.brokenFunctionCount}
              tone={overview.brokenFunctionCount > 0 ? "bad" : "good"}
              href="/administration/canonicalization/broken-functions"
            />
            <KpiTile
              icon={ShieldQuestion}
              label="M2M candidates"
              value={overview.m2mCandidateCount}
              href="/administration/canonicalization/candidates"
            />
            <KpiTile
              icon={ShieldQuestion}
              label="Unregistered candidates"
              value={overview.unregisteredCandidateCount}
              href="/administration/canonicalization/candidates"
            />
            <KpiTile
              icon={ShieldQuestion}
              label="Stale registry rows"
              value={overview.staleRegistryCount}
              href="/administration/canonicalization/candidates"
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">{overview.totalTables}</span>{" "}
              registered tables total
            </span>
            <span>
              Last refreshed:{" "}
              <span className="font-medium text-foreground">
                {formatDate(overview.lastRefresh?.run_at)}
              </span>
            </span>
            {overview.lastRefresh?.note ? (
              <span className="truncate">Note: {overview.lastRefresh.note}</span>
            ) : null}
          </div>

          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Per-table flip loop (§5d)</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                Run <Link href="/administration/canonicalization/verify" className="text-primary hover:underline">Verify</Link> for the table to get the full fix list.
              </li>
              <li>
                Run <Link href="/administration/canonicalization/table-impact" className="text-primary hover:underline">Table impact</Link> to see every dependent function + exact columns before editing.
              </li>
              <li>Write one migration: canonicalize the table and repoint every dependent function.</li>
              <li>Come back here and click "Refresh audit store".</li>
              <li>
                Confirm <code>canonical_certify_ok</code> is <code>true</code> on the Verify page. If not, fix the blocking rows and repeat.
              </li>
              <li>Only then touch app/client code, and log the change in the worklog's Change Log.</li>
            </ol>
          </div>
        </>
      )}

      <ConfirmDialog
        open={refreshOpen}
        onOpenChange={(open) => {
          if (!refreshing) setRefreshOpen(open);
        }}
        title="Refresh the audit store?"
        description="Rebuilds every audit.* snapshot: the full canonicalization gate over all registered tables plus plpgsql_check over every function. This can take a while on the live database."
        confirmLabel="Refresh"
        busy={refreshing}
        onConfirm={runRefresh}
      />
    </div>
  );
}
