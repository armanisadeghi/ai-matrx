"use client";

/**
 * TOOL RE-FETCH REPORT — how often an agent asks for something it was already
 * given, and how much of that bought nothing.
 *
 * A raw "repeats" total is not a finding: a tool that legitimately polls a
 * changing resource repeats constantly and is working correctly. The measure
 * that means something is SAME-DATA repeats — the stored output hash matched,
 * so the second call returned exactly what the first one did. That is the
 * default sort, and it is what the chars column prices.
 *
 * 🚨 THREE STATES, NEVER TWO. `same_data` is Same / New / Unknown, and
 * `after_trim` is Yes / No / n/a. Unknown is not "no" and is never folded into
 * one — per-iteration trim audits only exist from 2026-09-08 on, so an older
 * repeat genuinely cannot answer that question and says so.
 *
 * THE DOOR LAW (common-docs/policies/no-dead-ends.md): every repeat names its
 * conversation and lets you open it. Where the registry has no route, the id is
 * copyable — never an inert string, never a button that 404s.
 */

import React, { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Copy,
  RefreshCw,
  Repeat2,
} from "lucide-react";

import AppLink from "@/components/navigation/AppLink";
import { AssistStrip } from "@/features/assists/components/AssistStrip";
import { ADMIN_REPORTING_SURFACE_NAME } from "@/features/surfaces/manifests/admin-reporting.manifest";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  DETAIL_PAGE_SIZE,
  REFETCH_WINDOWS,
  RefetchTimeoutError,
  TRIM_AUDIT_EPOCH,
  getToolRefetchDetail,
  getToolRefetchSummary,
  type RefetchWindow,
  type ToolRefetchDetailRow,
  type ToolRefetchSummaryRow,
} from "./service";

/* ── formatters that refuse to invent a number ─────────────────────────────── */

const EM_DASH = "—";

function fmtCount(n: number | null | undefined): string {
  if (n === null || n === undefined) return EM_DASH;
  return n.toLocaleString();
}

function fmtPct(r: number | null | undefined): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return EM_DASH;
  return `${(r * 100).toFixed(1)}%`;
}

function fmtGapCalls(n: number | null | undefined): string {
  if (n === null || n === undefined) return EM_DASH;
  return Number.isInteger(n) ? n.toLocaleString() : n.toFixed(1);
}

/** mm:ss, with an h prefix once it stops fitting. */
function fmtDuration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined || !Number.isFinite(secs)) return EM_DASH;
  const total = Math.max(0, Math.round(secs));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(h > 0 ? m : m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return d.toLocaleString(undefined, {
    year: "2-digit",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ── badges ────────────────────────────────────────────────────────────────── */

function SameDataBadge({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <Badge
        variant="outline"
        title="The stored output hash matched the first call's — this re-fetch returned identical data and bought nothing."
        className="whitespace-nowrap border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
      >
        Same
      </Badge>
    );
  if (value === false)
    return (
      <Badge
        variant="outline"
        title="The output hash differed — the underlying data actually changed, so this was a legitimate refresh."
        className="whitespace-nowrap border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      >
        New
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      title="The output was not stored for one of these calls, so whether the data changed cannot be known. This is not 'new' and not 'same'."
      className="whitespace-nowrap text-muted-foreground"
    >
      Unknown
    </Badge>
  );
}

function TrimBadge({ value }: { value: boolean | null }) {
  if (value === true)
    return (
      <Badge
        variant="outline"
        title="The first result had already been cleared from the model's context by the trimmer before the repeat — the agent could no longer see it."
        className="whitespace-nowrap border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        Yes
      </Badge>
    );
  if (value === false)
    return (
      <Badge
        variant="outline"
        title="The first result was still in the model's context when the repeat happened — the agent re-asked for something it could still see."
        className="whitespace-nowrap"
      >
        No
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      title={`No per-iteration context-trim audit was recorded for this repeat, so whether the first result was still visible cannot be known. Audit coverage widens from ${TRIM_AUDIT_EPOCH} on and is partial before it. This is not "No".`}
      className="whitespace-nowrap text-muted-foreground"
    >
      n/a
    </Badge>
  );
}

/* ── sorting ───────────────────────────────────────────────────────────────── */

type SortKey =
  | "toolName"
  | "totalCalls"
  | "repeats"
  | "repeatRate"
  | "sameDataRepeats"
  | "sameDataRate"
  | "newDataRepeats"
  | "unknownDataRepeats"
  | "afterTrimRepeats"
  | "medianGapCalls"
  | "medianGapSecs"
  | "charsRefetchedSameData"
  | "conversations";

interface ColumnSpec {
  key: SortKey;
  label: string;
  align: "left" | "right";
  title: string;
}

const COLUMNS: ColumnSpec[] = [
  { key: "toolName", label: "Tool", align: "left", title: "The tool whose calls were repeated." },
  { key: "totalCalls", label: "Calls", align: "right", title: "Total calls to this tool in the window (the denominator for both rates)." },
  { key: "repeats", label: "Repeats", align: "right", title: "Calls whose name + arguments matched an earlier call in the same conversation." },
  { key: "repeatRate", label: "Repeat %", align: "right", title: "Repeats ÷ total calls." },
  { key: "sameDataRepeats", label: "Same-data", align: "right", title: "Repeats whose stored output hash matched — the re-fetch bought nothing." },
  { key: "sameDataRate", label: "Same-data %", align: "right", title: "Same-data repeats ÷ total calls. The number worth acting on." },
  { key: "newDataRepeats", label: "New-data", align: "right", title: "Repeats whose output actually changed — a legitimate refresh." },
  { key: "unknownDataRepeats", label: "Unknown", align: "right", title: "Repeats where the output was not stored, so nothing can be said either way." },
  { key: "afterTrimRepeats", label: "After trim", align: "right", title: "Repeats where the first result had already been trimmed out of the model's context." },
  { key: "medianGapCalls", label: "Gap (calls)", align: "right", title: "Median number of tool calls between the first call and the repeat." },
  { key: "medianGapSecs", label: "Gap (mm:ss)", align: "right", title: "Median wall-clock time between the first call and the repeat." },
  { key: "charsRefetchedSameData", label: "Chars re-fetched", align: "right", title: "Characters of output re-delivered by same-data repeats — the context this cost." },
  { key: "conversations", label: "Convos", align: "right", title: "Distinct conversations in which this tool was repeated." },
];

function compare(a: ToolRefetchSummaryRow, b: ToolRefetchSummaryRow, key: SortKey): number {
  if (key === "toolName") return a.toolName.localeCompare(b.toolName);
  const av = a[key] as number | null;
  const bv = b[key] as number | null;
  // Nulls sort last in either direction — an unknown is never "the smallest".
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return av - bv;
}

/* ── drill-down ────────────────────────────────────────────────────────────── */

function ConversationCell({ id }: { id: string | null }) {
  const href = useMemo(() => {
    if (!id) return null;
    const info = tryGetEntityInfo("conversation");
    return info?.hrefFor ? info.hrefFor(id) : null;
  }, [id]);

  if (!id) return <span className="text-muted-foreground">{EM_DASH}</span>;

  const short = `${id.slice(0, 8)}…`;
  if (href) {
    return (
      <AppLink
        href={href}
        className="inline-flex items-center gap-1 font-mono text-[11px] text-primary hover:underline"
        title={id}
      >
        {short}
        <ArrowUpRight className="h-3 w-3" />
      </AppLink>
    );
  }
  return (
    <button
      type="button"
      title={`Copy conversation id ${id}`}
      className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground hover:text-foreground"
      onClick={() => {
        void navigator.clipboard
          .writeText(id)
          .then(() => toast.success("Conversation id copied"))
          .catch(() => toast.error("Clipboard unavailable — the id is in the tooltip"));
      }}
    >
      {short}
      <Copy className="h-3 w-3" />
    </button>
  );
}

function ArgsBlock({ args }: { args: unknown }) {
  const [open, setOpen] = useState(false);
  const text = useMemo(() => {
    try {
      return JSON.stringify(args, null, 2) ?? "null";
    } catch {
      return String(args);
    }
  }, [args]);

  return (
    <div>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {open ? "Hide arguments" : "Arguments"}
      </button>
      {open && (
        <pre className="mt-1 max-h-56 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] leading-snug">
          {text}
        </pre>
      )}
    </div>
  );
}

function ToolDetail({
  toolName,
  window: win,
  expectedRepeats,
}: {
  toolName: string;
  window: RefetchWindow;
  expectedRepeats: number;
}) {
  const [pages, setPages] = useState(1);

  const detail = useQuery<ToolRefetchDetailRow[]>({
    queryKey: ["admin", "tool-refetch", "detail", toolName, win, pages],
    queryFn: () => getToolRefetchDetail(toolName, win, 0, pages * DETAIL_PAGE_SIZE),
    retry: (attempt, err) => !(err instanceof RefetchTimeoutError) && attempt < 1,
  });

  if (detail.isPending && !detail.isError) {
    return <div className="px-3 py-4 text-xs text-muted-foreground">Loading repeats for {toolName}…</div>;
  }
  if (detail.error) {
    return (
      <div className="flex items-center gap-2 px-3 py-4 text-xs text-rose-700 dark:text-rose-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        {detail.error instanceof Error ? detail.error.message : "Failed to load the repeats for this tool."}
        <Button size="sm" variant="outline" onClick={() => void detail.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const rows = detail.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        No individual repeats are readable for {toolName} in this window.
      </div>
    );
  }

  return (
    <div className="space-y-2 px-3 py-3">
      <table className="w-full text-xs">
        <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1 text-left">When</th>
            <th className="px-2 py-1 text-left">Conversation</th>
            <th className="px-2 py-1 text-left">Data</th>
            <th className="px-2 py-1 text-left">After trim</th>
            <th className="px-2 py-1 text-right">Gap (calls)</th>
            <th className="px-2 py-1 text-right">Gap (mm:ss)</th>
            <th className="px-2 py-1 text-right">First chars</th>
            <th className="px-2 py-1 text-right">Prior identical</th>
            <th className="px-2 py-1 text-left">Arguments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.repeatToolCallId} className="border-t align-top">
              <td className="whitespace-nowrap px-2 py-1.5">{fmtWhen(r.repeatAt)}</td>
              <td className="px-2 py-1.5">
                <ConversationCell id={r.conversationId} />
              </td>
              <td className="px-2 py-1.5">
                <SameDataBadge value={r.sameData} />
              </td>
              <td className="px-2 py-1.5">
                <TrimBadge value={r.trimmedBeforeRepeat} />
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtCount(r.gapCalls)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtDuration(r.gapSecs)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtCount(r.firstOutputChars)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{fmtCount(r.priorIdenticalCalls)}</td>
              <td className="px-2 py-1.5">
                <ArgsBlock args={r.args} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          Showing {rows.length.toLocaleString()} of {expectedRepeats.toLocaleString()} repeats.
        </span>
        {rows.length >= pages * DETAIL_PAGE_SIZE && (
          <Button size="sm" variant="outline" onClick={() => setPages((p) => p + 1)} disabled={detail.isFetching}>
            {detail.isFetching ? "Loading…" : `Load ${DETAIL_PAGE_SIZE} more`}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ── the console ───────────────────────────────────────────────────────────── */

export function ToolRefetchConsole() {
  const [win, setWin] = useState<RefetchWindow>("30d");
  const [sortKey, setSortKey] = useState<SortKey>("sameDataRepeats");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ["admin", "tool-refetch", "summary", win],
    queryFn: () => getToolRefetchSummary(win),
    // A statement timeout is a verdict, not a blip. Retrying it silently is
    // what turned this page into a spinner that never resolved.
    retry: (attempt, err) => !(err instanceof RefetchTimeoutError) && attempt < 1,
  });

  const timedOut = report.error instanceof RefetchTimeoutError ? report.error : null;
  // Never "loading" once we know it failed — that is the dead state.
  const loading = report.isPending && !report.isError;
  const refreshing = report.isFetching;
  const error =
    report.error && !timedOut
      ? report.error instanceof Error
        ? report.error.message
        : "Failed to load the re-fetch report"
      : null;

  const rows = useMemo(() => {
    const list = [...(report.data?.rows ?? [])];
    list.sort((a, b) => (sortAsc ? compare(a, b, sortKey) : -compare(a, b, sortKey)));
    return list;
  }, [report.data, sortKey, sortAsc]);

  const onSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortAsc((v) => !v);
      } else {
        setSortKey(key);
        setSortAsc(key === "toolName");
      }
    },
    [sortKey],
  );

  const totals = useMemo(() => {
    const src = report.data?.rows ?? [];
    return {
      tools: src.length,
      repeats: src.reduce((n, r) => n + r.repeats, 0),
      sameData: src.reduce((n, r) => n + r.sameDataRepeats, 0),
      chars: src.reduce((n, r) => n + r.charsRefetchedSameData, 0),
    };
  }, [report.data]);

  return (
    <div className="space-y-4 p-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Repeat2 className="h-6 w-6" />
              Tool re-fetch report
            </h1>
            <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
              How often an agent asks a tool for something it was already given.{" "}
              <strong>A repeat</strong> is a tool call whose name and arguments are identical to an
              earlier call in the same conversation. <strong>Same-data</strong> means the stored
              output hash matched, so the second call returned exactly what the first one did and
              the re-fetch bought nothing; <strong>new-data</strong> means the output actually
              changed, which is a legitimate refresh, not waste; <strong>unknown</strong> means the
              output was not stored, so neither claim can be made.{" "}
              <strong>After trim</strong> means the first result had already been cleared from the
              model&apos;s context by the context trimmer before the repeat — the agent could no
              longer see the answer it had.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              After-trim is answerable only where a per-iteration context-trim audit was recorded
              for that conversation — coverage widens from {TRIM_AUDIT_EPOCH} on and is partial
              before it, so a repeat with no audit reads <em>n/a</em>, never <em>No</em>. Measured
              on this database, rows on both sides of that date still come back unaudited, so treat
              the after-trim column as a floor.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void report.refetch()} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Window</span>
          {REFETCH_WINDOWS.map((w) => (
            <Button
              key={w.key}
              size="sm"
              variant={w.key === win ? "default" : "outline"}
              onClick={() => {
                setWin(w.key);
                setExpanded(null);
              }}
            >
              {w.label}
            </Button>
          ))}
          {!loading && !error && !timedOut && (
            <span className="ml-2 text-xs text-muted-foreground">
              {fmtCount(totals.tools)} tools · {fmtCount(totals.repeats)} repeats ·{" "}
              {fmtCount(totals.sameData)} same-data · {fmtCount(totals.chars)} chars re-fetched
              {win === "all" ? " (all-time rollup view)" : " (recomputed for this window)"}
            </span>
          )}
        </div>

        <AssistStrip surfaceName={ADMIN_REPORTING_SURFACE_NAME} />
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="outline" onClick={() => void report.refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/*
        NOTHING FAILS SILENTLY: the read hit a real server limit. Name the
        cause, name the fix, and hand over the window that does answer — never
        a spinner, and never an empty table pretending there is no data.
      */}
      {timedOut && (
        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">This window could not be answered — the query timed out.</div>
              <p className="mt-1 leading-snug">{timedOut.message}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <Button size="sm" variant="outline" onClick={() => setWin("90d")}>
              Show 90 days instead
            </Button>
            <Button size="sm" variant="outline" onClick={() => void report.refetch()} disabled={refreshing}>
              Try again anyway
            </Button>
          </div>
        </div>
      )}

      {report.data?.truncationNote && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {report.data.truncationNote}
        </div>
      )}

      <section className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-6 px-2 py-2" />
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={cn("px-3 py-2", c.align === "right" ? "text-right" : "text-left")}
                >
                  <button
                    type="button"
                    title={c.title}
                    className={cn(
                      "inline-flex items-center gap-1 uppercase hover:text-foreground",
                      sortKey === c.key && "text-foreground",
                    )}
                    onClick={() => onSort(c.key)}
                  >
                    {c.label}
                    {sortKey === c.key && <span aria-hidden>{sortAsc ? "▲" : "▼"}</span>}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-right">Last repeat</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-3 py-8 text-center text-muted-foreground">
                  Reading the re-fetch views…
                </td>
              </tr>
            )}

            {/* An empty table after a failed read would claim "no repeats" — it is not empty, it is unknown. */}
            {!loading && (error || timedOut) && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-3 py-8 text-center text-muted-foreground">
                  Nothing is shown because the read above failed — this is not &ldquo;no repeats&rdquo;.
                </td>
              </tr>
            )}

            {!loading && !error && !timedOut && rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="px-3 py-8 text-center text-muted-foreground">
                  No tool was called twice with identical arguments in this window. Try a longer
                  window.
                </td>
              </tr>
            )}

            {!loading &&
              rows.map((r) => {
                const open = expanded === r.toolName;
                return (
                  <React.Fragment key={r.toolName}>
                    <tr
                      className={cn(
                        "cursor-pointer border-t hover:bg-muted/40",
                        open && "bg-muted/40",
                      )}
                      onClick={() => setExpanded(open ? null : r.toolName)}
                    >
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-3 py-1.5 font-medium">{r.toolName}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtCount(r.totalCalls)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtCount(r.repeats)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtPct(r.repeatRate)}</td>
                      <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                        {fmtCount(r.sameDataRepeats)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 text-right tabular-nums",
                          (r.sameDataRate ?? 0) >= 0.05 && "font-semibold text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {fmtPct(r.sameDataRate)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmtCount(r.newDataRepeats)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                        {fmtCount(r.unknownDataRepeats)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtCount(r.afterTrimRepeats)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtGapCalls(r.medianGapCalls)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtDuration(r.medianGapSecs)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {fmtCount(r.charsRefetchedSameData)}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmtCount(r.conversations)}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right text-xs text-muted-foreground">
                        {fmtWhen(r.lastRepeatAt)}
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={COLUMNS.length + 2} className="p-0">
                          <ToolDetail toolName={r.toolName} window={win} expectedRepeats={r.repeats} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-muted-foreground">
        Sources: <code>chat.vw_tool_refetch_summary</code> (all-time rollup) and{" "}
        <code>chat.vw_tool_refetch</code> (one row per repeat). The summary view carries no date
        column, so a 7 / 30 / 90-day view is recomputed from the per-repeat rows, with total calls
        counted from <code>chat.tool_call</code> over the same window (types local / agent /
        external, undeleted). &ldquo;All time&rdquo; reads the summary view directly.
      </p>
    </div>
  );
}
