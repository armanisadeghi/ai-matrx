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
import { toast } from "@/lib/toast";
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Siren,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import type {
  CanonicalizationOverview as OverviewData,
  DdlGuardUnackedRow,
  RefreshLogRow,
} from "../types";
import { errorMessageFrom, readJsonObject } from "../utils/apiClient";
import { overviewToAgentInput, overviewToHuman } from "../utils/aiExport";

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
    typeof r.machineryTables === "number" &&
    typeof r.totalFails === "number" &&
    typeof r.totalWarns === "number" &&
    typeof r.brokenFunctionCount === "number" &&
    typeof r.brokenFunctionRowCount === "number" &&
    typeof r.brokenFunctionBySeverity === "object" &&
    r.brokenFunctionBySeverity !== null &&
    Array.isArray(r.ddlGuardUnacked) &&
    (r.lastRefresh === null || isRefreshLogRow(r.lastRefresh))
  );
}

function ddlGuardTotal(rows: readonly DdlGuardUnackedRow[]): number {
  return rows.reduce((n, r) => n + Number(r.unacked_rows ?? 0), 0);
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
        <div className={cn("text-2xl font-semibold tabular-nums", toneClass)}>
          {value}
        </div>
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
      if (!isOverviewData(data.overview))
        throw new Error("Unexpected overview response shape");
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
      const durationMs =
        typeof data.durationMs === "number" ? data.durationMs : 0;
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
            Live gate (<code>iam.verify_canonical</code> /{" "}
            <code>canonical_certify</code>) + the batch <code>audit.*</code>{" "}
            snapshot store over every registered table and plpgsql function.
            Read-only except for the refresh action below. See{" "}
            <code>docs/canonicalization_worklog.md</code> §5b for the full
            toolkit reference.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {overview ? (
            <CopyButtons
              size="sm"
              label="Canonicalization overview"
              human={() => overviewToHuman(overview)}
              agent={() => overviewToAgentInput(overview)}
            />
          ) : null}
          <Button onClick={() => setRefreshOpen(true)} disabled={refreshing}>
            {refreshing ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Refresh audit store
          </Button>
        </div>
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
              href="/administration/database/canonicalization/summary"
            />
            <KpiTile
              icon={ShieldCheck}
              label="Machinery (outside universe)"
              value={overview.machineryTables}
              href="/administration/database/canonicalization/summary"
            />
            <KpiTile
              icon={ShieldAlert}
              label="Total FAIL checks"
              value={overview.totalFails}
              tone="bad"
              href="/administration/database/canonicalization/findings?status=FAIL"
            />
            <KpiTile
              icon={AlertTriangle}
              label="Total WARN checks"
              value={overview.totalWarns}
              tone="warn"
              href="/administration/database/canonicalization/findings?status=WARN"
            />
            {/* The actionable number, not the row count. Until 2026-08-13 this
                tile showed all 101 rows of audit.broken_functions while the
                refresh log beside it said 29 — the two numbers measured
                different things and neither was actionable. */}
            <KpiTile
              icon={GitBranch}
              label="Broken functions (real)"
              value={overview.brokenFunctionCount}
              tone={overview.brokenFunctionCount > 0 ? "bad" : "good"}
              href="/administration/database/canonicalization/broken-functions"
            />
            <KpiTile
              icon={ShieldAlert}
              label="Privilege-risk functions"
              value={overview.brokenFunctionBySeverity.advisory}
              tone={
                overview.brokenFunctionBySeverity.advisory > 0
                  ? "warn"
                  : "good"
              }
              href={`/administration/database/canonicalization/broken-functions?severity=${encodeURIComponent(
                JSON.stringify(["advisory"]),
              )}`}
            />
            <KpiTile
              icon={ShieldQuestion}
              label="M2M candidates"
              value={overview.m2mCandidateCount}
              href="/administration/database/canonicalization/candidates"
            />
            <KpiTile
              icon={ShieldQuestion}
              label="Unregistered candidates"
              value={overview.unregisteredCandidateCount}
              href="/administration/database/canonicalization/candidates"
            />
            <KpiTile
              icon={ShieldQuestion}
              label="Stale registry rows"
              value={overview.staleRegistryCount}
              href="/administration/database/canonicalization/candidates"
            />
            {/* The DDL sentinel's OWN backlog. Until 2026-08-21 nothing on the
                platform read platform.ddl_guard_log and all 865 firings sat
                unacknowledged — a guard nobody reads is a log file (2026-08-15
                drift audit §1). Zero here means every firing was reviewed and
                carries a reason, not that the guard is quiet. */}
            <KpiTile
              icon={Siren}
              label="Unacked DDL guard firings"
              value={ddlGuardTotal(overview.ddlGuardUnacked)}
              tone={ddlGuardTotal(overview.ddlGuardUnacked) > 0 ? "warn" : "good"}
            />
          </div>

          {overview.ddlGuardUnacked.length > 0 ? (
            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                <Siren className="h-3.5 w-3.5" />
                Unacknowledged DDL guard firings by rule
              </div>
              <div className="mt-1.5 space-y-1">
                {overview.ddlGuardUnacked.map((r) => (
                  <div
                    key={r.rule}
                    className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                  >
                    <code className="font-medium text-foreground">{r.rule}</code>
                    <span className="tabular-nums">
                      {r.unacked_rows} row{r.unacked_rows === 1 ? "" : "s"} ·{" "}
                      {r.unacked_objects} object
                      {r.unacked_objects === 1 ? "" : "s"}
                    </span>
                    {r.sample_objects ? (
                      <span className="truncate">{r.sample_objects}</span>
                    ) : null}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Acknowledge with{" "}
                <code>
                  platform.ddl_guard_ack(p_reason =&gt; &apos;…&apos;, p_by =&gt;
                  &apos;…&apos;, p_rule =&gt; &apos;…&apos;)
                </code>{" "}
                — the reason is mandatory. Triage runs as the docs-steward daily
                step; the release gate is <code>pnpm check:ddl-guard-log</code>.
              </p>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            <span>
              <span className="font-medium text-foreground">
                {overview.totalTables}
              </span>{" "}
              registered tables total
            </span>
            <span>
              Last refreshed:{" "}
              <span className="font-medium text-foreground">
                {formatDate(overview.lastRefresh?.run_at)}
              </span>
            </span>
            {/* Spelled out so the headline "Broken functions (real)" tile can
                never look like it contradicts the refresh log again: every
                number below comes from the same severity column, and
                audit.refresh_log_recount() derives the log row FROM the table
                after every phase. */}
            <span>
              Function findings:{" "}
              <span className="font-medium text-foreground">
                {overview.brokenFunctionRowCount}
              </span>{" "}
              rows ={" "}
              {(
                Object.entries(overview.brokenFunctionBySeverity) as [
                  string,
                  number,
                ][]
              )
                .map(([severity, count]) => `${count} ${severity}`)
                .join(" · ")}{" "}
              — the tile above counts distinct functions, not findings
            </span>
            {overview.lastRefresh?.note ? (
              <span className="truncate">
                Note: {overview.lastRefresh.note}
              </span>
            ) : null}
          </div>

          <div className="mt-6 rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Per-table flip loop (§5d)</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
              <li>
                Run{" "}
                <Link
                  href="/administration/database/canonicalization/verify"
                  className="text-primary hover:underline"
                >
                  Verify
                </Link>{" "}
                for the table to get the full fix list.
              </li>
              <li>
                Run{" "}
                <Link
                  href="/administration/database/canonicalization/table-impact"
                  className="text-primary hover:underline"
                >
                  Table impact
                </Link>{" "}
                to see every dependent function + exact columns before editing.
              </li>
              <li>
                Write one migration: canonicalize the table and repoint every
                dependent function.
              </li>
              <li>Come back here and click "Refresh audit store".</li>
              <li>
                Confirm <code>canonical_certify_ok</code> is <code>true</code>{" "}
                on the Verify page. If not, fix the blocking rows and repeat.
              </li>
              <li>
                Only then touch app/client code, and log the change in the
                worklog's Change Log.
              </li>
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
