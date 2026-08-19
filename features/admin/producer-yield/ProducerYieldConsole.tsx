"use client";

/**
 * THE YIELD REGISTER — what did the money BUY?
 *
 * Disease D13 (common-docs/operations/agent-failure-diseases.md). The platform
 * spent $9.41 over eight days on 82 Hindsight reviews that produced 140
 * findings, of which three were ever applied — and nothing showed that to
 * anyone, so the person paying was the one who eventually noticed. This page is
 * the surface that would have caught it WITHOUT anyone knowing what a review
 * bundle is: a producer whose outcomes stop being accepted is broken, whatever
 * the reason.
 *
 * 🚨 THE ONE RULE THIS UI MUST NOT BREAK: NULL IS NEVER ZERO. Three states, and
 * collapsing any two destroys the only signal worth having:
 *   Unmeasurable — spends money, no acceptance signal wired at all.
 *   Unmeasured   — outcomes exist, nobody has ever decided one. NOT 0%.
 *   Measured     — the rate is real, and 0% here is a genuine failure.
 * Every number is rendered through `formatRate` / `formatUsd` / `formatCount`,
 * which return an em dash for null. Never write `?? 0` in this file.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): every producer row links
 * to the surface where its outcomes actually live, so a bad number is one click
 * from the thing that made it.
 *
 * THE FRAGMENTATION LAW: one statically-imported client component behind the
 * server page. It is a table and some cards.
 */

import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  Coins,
  HelpCircle,
  Play,
  RefreshCw,
  Target,
  TrendingDown,
} from "lucide-react";

import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { ADMIN_REPORTING_SURFACE_NAME } from "@/features/surfaces/manifests/admin-reporting.manifest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import { getProducerYield, runYieldCheck } from "./api";
import {
  MEASUREMENT_STATE_COPY,
  formatCount,
  formatRate,
  formatUsd,
  type ProducerYieldOut,
  type ProducerYieldRow,
} from "./types";

const TONE_CLASS: Record<string, string> = {
  critical:
    "border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
  warn: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  neutral:
    "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
  muted:
    "border-slate-200 bg-transparent text-muted-foreground dark:border-slate-800",
};

function StateBadge({ state }: { state: string }) {
  const copy = MEASUREMENT_STATE_COPY[state] ?? {
    label: state,
    blurb: "",
    tone: "muted" as const,
  };
  return (
    <Badge
      variant="outline"
      title={copy.blurb}
      className={`whitespace-nowrap ${TONE_CLASS[copy.tone]}`}
    >
      {copy.label}
    </Badge>
  );
}

/**
 * A yield cell that refuses to lie. A `null` rate renders as an em dash with
 * the reason attached, never as 0%.
 */
function YieldCell({ row }: { row: ProducerYieldRow }) {
  if (row.yield_rate === null || row.yield_rate === undefined) {
    return (
      <span
        className="inline-flex items-center gap-1 text-muted-foreground"
        title={MEASUREMENT_STATE_COPY[row.measurement_state]?.blurb}
      >
        — <HelpCircle className="h-3 w-3" />
      </span>
    );
  }
  const bad = row.yield_rate < 0.1;
  return (
    <span
      className={
        bad ? "font-semibold text-rose-600 dark:text-rose-400" : "font-medium"
      }
    >
      {formatRate(row.yield_rate)}
    </span>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "critical";
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        tone === "critical"
          ? "border-rose-300 dark:border-rose-900"
          : "border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ProducerYieldConsole() {
  const params = useSearchParams();
  const focused = params?.get("producer") ?? null;

  const [checking, setChecking] = useState(false);
  const [showIdle, setShowIdle] = useState(false);

  const register = useQuery<ProducerYieldOut>({
    queryKey: ["admin", "producer-yield"],
    queryFn: () => getProducerYield(),
  });

  const data = register.data;
  // `isPending` (no data yet) drives the table's placeholder; `isFetching` only
  // spins the Refresh button. Collapsing them would blank a populated table on
  // every background refetch.
  const loading = register.isPending;
  const refreshing = register.isFetching;
  const error = register.error
    ? register.error instanceof Error
      ? register.error.message
      : "Failed to load the yield register"
    : null;

  const onCheck = useCallback(async () => {
    setChecking(true);
    try {
      const res = await runYieldCheck();
      // "clean" means the pass RAN and found nothing. Saying so out loud is the
      // point — "ran and found nothing" vs "never ran" is the distinction whose
      // absence let D13 live for eight days.
      toast.success(
        res.status === "clean"
          ? `Floor pass ran across ${formatCount(res.producers_checked)} producers — nothing breached.`
          : `${res.breaches?.length ?? 0} floor breach(es); ${formatCount(res.assists_created)} chip(s) raised.`,
      );
      await register.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Floor pass failed");
    } finally {
      setChecking(false);
    }
  }, [register]);

  const rows = useMemo(() => {
    const all = data?.rows ?? [];
    return showIdle ? all : all.filter((r) => r.measurement_state !== "idle");
  }, [data, showIdle]);

  const totals = data?.totals;
  const floors = data?.floors;
  const idleCount =
    (data?.rows ?? []).filter((r) => r.measurement_state === "idle").length;

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Target className="h-6 w-6" />
              Yield register
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Every autonomous spender in the platform, and what its money
              actually bought. A producer that emits outcomes nobody accepts is
              broken — this page does not need to know why, which is what makes
              it the detector for problems nobody has named yet.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void register.refetch()} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => void onCheck()} disabled={checking}>
              <Play className="mr-2 h-4 w-4" />
              {checking ? "Checking…" : "Run floor check"}
            </Button>
          </div>
        </div>
        <AssistStrip surfaceName={ADMIN_REPORTING_SURFACE_NAME} />
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {totals && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Coins className="h-3.5 w-3.5" />}
            label="Total spend"
            value={formatUsd(totals.cost_usd)}
            hint={`${formatCount(totals.producers)} producers on the register.`}
          />
          <StatCard
            icon={<Target className="h-3.5 w-3.5" />}
            label="Platform yield"
            value={formatRate(totals.yield_rate)}
            hint={`${formatCount(totals.accepted)} accepted of ${formatCount(
              totals.produced,
            )} produced, across measured producers only.`}
          />
          <StatCard
            icon={<TrendingDown className="h-3.5 w-3.5" />}
            label="Cost per accepted"
            value={formatUsd(totals.cost_per_accepted_usd, { precision: 4 })}
            hint="The honest number. Cost per PRODUCED outcome flatters a producer that emits more junk, so it is never the headline."
          />
          <StatCard
            icon={<HelpCircle className="h-3.5 w-3.5" />}
            label="Unmeasurable spend"
            value={formatUsd(totals.unmeasurable_cost_usd)}
            tone={(totals.unmeasurable_cost_usd ?? 0) > 0 ? "critical" : "neutral"}
            hint="Money spent by producers with NO acceptance signal wired. Nothing here can tell you whether it was worth it."
          />
        </section>
      )}

      {floors && (
        <p className="text-xs text-muted-foreground">
          Floors (hourly system task <code>producer_yield_floor</code>): alarm below{" "}
          <strong>{formatRate(floors.yield_floor)}</strong> yield once a producer has
          emitted <strong>{floors.min_produced_for_verdict}</strong> outcomes; alarm when
          nothing has been decided after{" "}
          <strong>{floors.never_decided_min_age_days} days</strong>; alarm when a
          producer with no acceptance signal has spent{" "}
          <strong>{formatUsd(floors.no_signal_min_cost_usd)}</strong>. Below the sample
          floor there is no verdict at all — a 0-of-3 yield is noise with a decimal
          point.
        </p>
      )}

      <section className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Producer</th>
              <th className="px-3 py-2 text-left">State</th>
              <th className="px-3 py-2 text-right">Produced</th>
              <th className="px-3 py-2 text-right">Accepted</th>
              <th className="px-3 py-2 text-right">Undecided</th>
              <th className="px-3 py-2 text-right">Yield</th>
              <th className="px-3 py-2 text-right">Spend</th>
              <th className="px-3 py-2 text-right">$/accepted</th>
              <th className="px-3 py-2 text-right">$/produced</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  Loading the register…
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((r) => (
                <tr
                  key={r.producer_key}
                  className={`border-t ${
                    focused === r.producer_key ? "bg-amber-50 dark:bg-amber-950/40" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.display_name}</div>
                    <code className="text-[11px] text-muted-foreground">
                      {r.producer_key}
                    </code>
                  </td>
                  <td className="px-3 py-2">
                    <StateBadge state={r.measurement_state} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(r.produced)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCount(r.accepted)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatCount(r.undecided)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <YieldCell row={r} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(r.cost_usd)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatUsd(r.cost_per_accepted_usd, { precision: 4 })}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {formatUsd(r.cost_per_produced_usd, { precision: 4 })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* THE DOOR LAW: the producer is a thing; let the user reach it. */}
                    {r.door_href && (
                      <Link
                        href={r.door_href}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Open <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                  No producers on the register.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {idleCount > 0 && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() => setShowIdle((v) => !v)}
        >
          {showIdle ? "Hide" : "Show"} {idleCount} idle producer
          {idleCount === 1 ? "" : "s"} (nothing produced)
        </button>
      )}
    </div>
  );
}
