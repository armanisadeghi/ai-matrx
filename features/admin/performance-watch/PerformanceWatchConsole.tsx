"use client";

/**
 * PerformanceWatchConsole — /administration/reporting/performance.
 *
 * One list of every performance watch (`ops.proof_check` kind='perf') with its newest judged
 * number against budget, state, 7-day sparkline, baseline, last alert and sample age; and, on
 * `?watch=<id>`, one watch's history chart, state history and sample table. Platform scope: no
 * organization filter. The drill edits a watch through the platform-admin door
 * `ops.perf_watch_update`: budget, pause/resume, pin/unpin the baseline (FEATURE.md).
 */

import { Suspense, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Gauge, Pause, Pin, PinOff, Play, RefreshCw, XCircle } from "lucide-react";
import { Field } from "@ai-matrx/design-system/controls";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { toast } from "@/lib/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatCount, formatDurationMs, formatFileSize, formatDurationSeconds, formatRelativeTime } from "@ai-matrx/kit/format";
import { useNow } from "@/hooks/useNow";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_REPORTING_SURFACE_NAME,
  createAdminReportingScope,
} from "@/features/surfaces/manifests/admin-reporting.manifest";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  PERF_STATES,
  PERF_STATE_LABELS,
  collectorCapSeconds,
  collectorUse,
  flaggedPageCount,
  judgedValue,
  measuresLine,
  sparklinePoints,
  stateCounts,
  sortCollectors,
  stateHistory,
  subjectFields,
  isMarkerSample,
  vitalProgress,
  vitalsWaiting,
  summarizeWatches,
  watchReason,
  type PerfCollector,
  type PerfSample,
  type PerfVitals,
  type PerfWatch,
  type PerfWatchEdit,
  type PerfState,
  type SlowPages,
  type WatchRow,
} from "./model";
import { SlowPagesBoard } from "./SlowPagesBoard";
import { livePerfSource, type PerfSnapshot, type PerfSource } from "./service";

type Load<T> = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function PerformanceWatchConsole(props: { source?: PerfSource }) {
  return (
    <Suspense fallback={null}>
      <ConsoleBody {...props} />
    </Suspense>
  );
}

function ConsoleBody({ source = livePerfSource }: { source?: PerfSource }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const now = useNow();
  const watchId = params.get("watch");

  const [snapshot, setSnapshot] = useState<Load<PerfSnapshot>>({ status: "loading" });
  const [history, setHistory] = useState<Load<PerfSample[]>>({ status: "loading" });
  const [slowPages, setSlowPages] = useState<Load<SlowPages>>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  const view = params.get("view") === "pages" ? "pages" : "watches";

  useEffect(() => {
    if (view !== "pages" || watchId) return;
    let live = true;
    setSlowPages({ status: "loading" });
    source.loadSlowPages(7).then(
      (data) => live && setSlowPages({ status: "ready", data }),
      (error: unknown) => live && setSlowPages({ status: "error", message: messageOf(error) }),
    );
    return () => {
      live = false;
    };
  }, [source, view, watchId, reloadKey]);

  useEffect(() => {
    let live = true;
    setSnapshot({ status: "loading" });
    source.loadSnapshot().then(
      (data) => live && setSnapshot({ status: "ready", data }),
      (error: unknown) => live && setSnapshot({ status: "error", message: messageOf(error) }),
    );
    return () => {
      live = false;
    };
  }, [source, reloadKey]);

  useEffect(() => {
    if (!watchId) return;
    let live = true;
    setHistory({ status: "loading" });
    source.loadHistory(watchId).then(
      (data) => live && setHistory({ status: "ready", data }),
      (error: unknown) => live && setHistory({ status: "error", message: messageOf(error) }),
    );
    return () => {
      live = false;
    };
  }, [source, watchId, reloadKey]);

  const setView = (next: "watches" | "pages") => {
    const query = new URLSearchParams(params.toString());
    if (next === "pages") query.set("view", "pages");
    else query.delete("view");
    const href = query.size ? `${pathname}?${query.toString()}` : pathname;
    startTransition(() => router.replace(href));
  };

  const navigate = (next: string | null, push: boolean) => {
    const query = new URLSearchParams(params.toString());
    if (next == null) query.delete("watch");
    else query.set("watch", next);
    const href = query.size ? `${pathname}?${query.toString()}` : pathname;
    startTransition(() => (push ? router.push(href) : router.replace(href)));
  };

  const rows = useMemo(
    () =>
      snapshot.status === "ready"
        ? summarizeWatches(snapshot.data.watches, snapshot.data.recent, now || Date.now())
        : [],
    [snapshot, now],
  );
  const counts = snapshot.status === "ready" ? stateCounts(snapshot.data.watches) : {};
  const selected = watchId ? (rows.find((r) => r.watch.id === watchId) ?? null) : null;

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_REPORTING_SURFACE_NAME}
      getScope={() =>
        createAdminReportingScope({
          reporting_section: "performance",
          performance_state_counts: { ...counts },
          performance_selected_watch: selected
            ? { id: selected.watch.id, slug: selected.watch.slug, state: selected.state }
            : undefined,
        })
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2 p-2 sm:p-3">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Gauge className="h-4 w-4 text-primary" aria-hidden />
          <h1 className="text-sm font-semibold">Performance</h1>
          {snapshot.status === "ready" ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{formatCount(rows.length)} watches</span>
              {PERF_STATES.filter((s) => counts[s]).map((s) => (
                <span key={s} className={stateTextClass(s)}>
                  {formatCount(counts[s] ?? 0)} {PERF_STATE_LABELS[s].toLowerCase()}
                </span>
              ))}
            </div>
          ) : null}
          {snapshot.status === "ready" ? (
            <CollectorsPopover collectors={snapshot.data.collectors} vitals={snapshot.data.vitals} />
          ) : null}
          {!watchId ? (
            <div role="tablist" aria-label="Performance view" className="ml-auto flex items-center gap-0.5 rounded-md border border-border p-0.5 text-xs">
              {(["watches", "pages"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  className={`rounded px-2 py-0.5 ${view === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setView(v)}
                >
                  {v === "watches" ? "Watches" : "Slowest pages"}
                  {v === "pages" ? (
                    <span className="ml-1 inline-block min-w-[2ch] text-center tabular-nums text-warning">
                      {slowPages.status === "ready" && flaggedPageCount(slowPages.data.rows) > 0 ? formatCount(flaggedPageCount(slowPages.data.rows)) : ""}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
          <Button
            icon={<RefreshCw className={`h-3.5 w-3.5 ${snapshot.status === "loading" ? "animate-spin" : ""}`} />}
            variant="quiet"
            className={watchId ? "ml-auto" : undefined}
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={snapshot.status === "loading"}
          >
            Refresh
          </Button>
        </header>

        {snapshot.status === "error" ? (
          <LoadError what="the performance watches" message={snapshot.message} onRetry={() => setReloadKey((k) => k + 1)} />
        ) : watchId ? (
          <WatchDrill
            row={selected}
            loadingSnapshot={snapshot.status === "loading"}
            history={history}
            onBack={() => navigate(null, true)}
            onRetry={() => setReloadKey((k) => k + 1)}
            onEdit={async (edit) => {
              await source.updateWatch(edit);
              setReloadKey((k) => k + 1);
            }}
          />
        ) : view === "pages" ? (
          slowPages.status === "error" ? (
            <LoadError what="the slowest pages" message={slowPages.message} onRetry={() => setReloadKey((k) => k + 1)} />
          ) : (
            <SlowPagesBoard
              rows={slowPages.status === "ready" ? slowPages.data.rows : []}
              minN={slowPages.status === "ready" ? slowPages.data.min_n : 30}
              loading={slowPages.status === "loading"}
              onOpenWatch={(id) => navigate(id, true)}
            />
          )
        ) : (
          <WatchBoard
            rows={rows}
            loading={snapshot.status === "loading"}
            onOpen={(row) => navigate(row.watch.id, true)}
          />
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}

// Collector health and page-speed progress live in a popover off the header, never as a new row.
function CollectorsPopover({ collectors, vitals }: { collectors: PerfCollector[]; vitals: PerfVitals | null }) {
  const jobs = sortCollectors(collectors);
  const waiting = vitalsWaiting(vitals);
  const slow = jobs.filter((c) => (collectorUse(c) ?? 0) > 0.8 || (c.last_status != null && c.last_status !== "succeeded")).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet" className="text-xs">
          Collectors
          {slow ? <span className="ml-1 font-medium text-warning">{slow}</span> : null}
          {waiting.length ? <span className="ml-1 text-muted-foreground">· {waiting.length} routes sampling</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[34rem] max-w-[92vw] space-y-3 p-2 text-xs">
        <table className="w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-1 py-0.5 font-medium">Collector</th>
              <th className="px-1 py-0.5 font-medium">Schedule</th>
              <th className="px-1 py-0.5 text-right font-medium">Doors</th>
              <th className="px-1 py-0.5 text-right font-medium">Last run</th>
              <th className="px-1 py-0.5 text-right font-medium">Took of cap</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((c) => {
              const use = collectorUse(c);
              const cap = collectorCapSeconds(c);
              const bad = c.last_status != null && c.last_status !== "succeeded";
              return (
                <tr key={c.job} className="border-t border-border/50">
                  <td className="px-1 py-0.5 font-mono text-[11px]">{c.job.replace(/^perf-watch-/, "")}</td>
                  <td className="px-1 py-0.5 font-mono text-[11px] text-muted-foreground">{c.schedule}</td>
                  <td className="px-1 py-0.5 text-right tabular-nums">{c.doors ?? ""}</td>
                  <td className={`px-1 py-0.5 text-right ${bad ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                    {c.last_started_at ? formatRelativeTime(c.last_started_at) : "never"}
                    {bad ? ` · ${c.last_status}` : ""}
                  </td>
                  <td className={`px-1 py-0.5 text-right tabular-nums ${use != null && use > 0.8 ? "font-medium text-warning" : "text-muted-foreground"}`}>
                    {c.last_seconds != null && cap != null ? `${c.last_seconds} s of ${cap} s` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {vitals ? (
          <table className="w-full">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-1 py-0.5 font-medium">Page speed route</th>
                <th className="px-1 py-0.5 font-medium">Metric</th>
                <th className="px-1 py-0.5 text-right font-medium">Loads in {vitals.window_hours} h</th>
                <th className="px-1 py-0.5 text-right font-medium">Watch</th>
              </tr>
            </thead>
            <tbody>
              {waiting.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-1 py-0.5 text-muted-foreground">
                    Every sampled route has a watch
                  </td>
                </tr>
              ) : (
                waiting.slice(0, 20).map((r) => (
                  <tr key={`${r.metric}:${r.route}`} className="border-t border-border/50">
                    <td className="max-w-[16rem] truncate px-1 py-0.5 font-mono text-[11px]" title={r.route}>
                      {r.route}
                    </td>
                    <td className="px-1 py-0.5">{r.metric}</td>
                    <td className="px-1 py-0.5 text-right tabular-nums">{vitalProgress(r, vitals.min_n).label}</td>
                    <td className="px-1 py-0.5 text-right text-muted-foreground">not enough samples yet</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function LoadError({ what, message, onRetry }: { what: string; message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-destructive">Could not read {what}.</p>
        <p className="break-words text-muted-foreground">
          {message}
          <ErrorAlchemyMenu error={message} operation={`Read ${what}`} />
        </p>
      </div>
      <Button variant="quiet" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

// ── tones ────────────────────────────────────────────────────────────────────────────────────

function stateTextClass(state: PerfState): string {
  switch (state) {
    case "ok":
      return "text-muted-foreground";
    case "learning":
    case "paused":
      return "text-muted-foreground";
    case "stale":
    case "over_budget":
    case "regressed":
      return "font-medium text-warning";
    default:
      return "font-medium text-destructive";
  }
}

function StateBadge({ state }: { state: PerfState }) {
  const tone =
    state === "ok"
      ? "border-success/40 text-success"
      : state === "learning" || state === "paused"
        ? "text-muted-foreground"
        : state === "erroring" || state === "probe_broken"
          ? "border-destructive/40 text-destructive"
          : "border-warning/50 text-warning";
  return (
    <Badge variant="outline" className={tone}>
      {PERF_STATE_LABELS[state]}
    </Badge>
  );
}

function ms(value: number | null | undefined): string {
  return formatDurationMs(value, { style: "compact", precision: "fine" });
}

function Sparkline({ values, over }: { values: number[]; over: boolean }) {
  const points = sparklinePoints(values, 80, 18);
  if (!points) return <span className="text-muted-foreground">—</span>;
  return (
    <svg width={80} height={18} viewBox="0 0 80 18" className="overflow-visible" role="img" aria-label="7-day trend">
      <polyline
        points={points}
        fill="none"
        className={over ? "stroke-warning" : "stroke-primary"}
        strokeWidth={1.25}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── list ─────────────────────────────────────────────────────────────────────────────────────

function WatchBoard({
  rows,
  loading,
  onOpen,
}: {
  rows: WatchRow[];
  loading: boolean;
  onOpen: (row: WatchRow) => void;
}) {
  const columns: MatrxColumnDef<WatchRow>[] = [
    {
      id: "watch",
      header: "Watch",
      accessorFn: (r) => r.watch.label,
      filter: "text",
      width: 260,
      cell: (r) => (
        <div className="min-w-0">
          <button
            type="button"
            className="block max-w-full truncate text-left font-medium hover:underline"
            title={r.watch.label}
            onClick={() => onOpen(r)}
          >
            {r.watch.label}
          </button>
          <div className="truncate font-mono text-[11px] text-muted-foreground" title={r.watch.slug}>
            {r.watch.slug}
            {r.watch.is_active ? "" : " · off"}
          </div>
        </div>
      ),
    },
    {
      id: "why",
      header: "Why",
      accessorFn: (r) => watchReason(r.watch) ?? "",
      filter: "text",
      width: 240,
      mobileHidden: true,
      cell: (r) => {
        const why = watchReason(r.watch);
        return why ? (
          <span className="block truncate text-muted-foreground" title={why}>
            {why}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    { id: "kind", header: "Kind", accessorFn: (r) => r.watch.perf_kind ?? "", filter: "select", width: 90 },
    { id: "owner", header: "Owner", accessorFn: (r) => r.watch.owner ?? "", filter: "select", width: 120, mobileHidden: true },
    {
      id: "state",
      header: "State",
      accessorFn: (r) => PERF_STATE_LABELS[r.state],
      filter: "select",
      width: 120,
      cell: (r) => <StateBadge state={r.state} />,
    },
    {
      id: "latest",
      header: "Latest",
      accessorFn: (r) => r.judged ?? -1,
      filter: "number",
      width: 130,
      align: "right",
      cell: (r) => (
        <span
          className={`tabular-nums ${r.tone === "over" ? "font-medium text-warning" : ""}`}
          title={r.watch.budget_stat ? `Newest ${r.watch.budget_stat}` : undefined}
        >
          {ms(r.judged)}
          {r.judged != null && r.watch.budget_stat ? <span className="ml-1 text-[11px] text-muted-foreground">{r.watch.budget_stat}</span> : null}
        </span>
      ),
    },
    {
      id: "budget",
      header: "Budget",
      accessorFn: (r) => r.watch.budget_ms ?? -1,
      filter: "number",
      width: 90,
      align: "right",
      cell: (r) => <span className="tabular-nums text-muted-foreground">{ms(r.watch.budget_ms)}</span>,
    },
    {
      id: "trend",
      header: "7 days",
      sortable: false,
      filter: false,
      width: 100,
      mobileHidden: true,
      cell: (r) => <Sparkline values={r.spark} over={r.tone === "over"} />,
    },
    {
      id: "baseline",
      header: "Baseline",
      accessorFn: (r) => r.watch.perf_baseline_ms ?? -1,
      filter: "number",
      width: 100,
      align: "right",
      mobileHidden: true,
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground" title={r.watch.perf_baseline_pinned ? "Pinned by a person" : undefined}>
          {ms(r.watch.perf_baseline_ms)}
          {r.watch.perf_baseline_pinned ? " ·" : ""}
        </span>
      ),
    },
    {
      id: "alert",
      header: "Last alert",
      accessorFn: (r) => r.watch.perf_last_alert_at ?? "",
      filter: "text",
      width: 110,
      mobileHidden: true,
      cell: (r) =>
        r.watch.perf_last_alert_at ? (
          <span title={new Date(r.watch.perf_last_alert_at).toLocaleString()}>
            {formatRelativeTime(r.watch.perf_last_alert_at)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "sampled",
      header: "Sampled",
      accessorFn: (r) => r.ageMs ?? Number.MAX_SAFE_INTEGER,
      filter: "number",
      width: 110,
      cell: (r) =>
        r.latest ? (
          <span
            className={r.age === "stale" ? "font-medium text-warning" : "text-muted-foreground"}
            title={new Date(r.latest.measured_at).toLocaleString()}
          >
            {formatRelativeTime(r.latest.measured_at)}
          </span>
        ) : (
          <span className="text-muted-foreground">never</span>
        ),
    },
  ];

  return (
    <div className="min-h-0 flex-1">
      <MatrxDataTable
        tableId="admin-performance-watch-board"
        data={rows}
        columns={columns}
        getRowId={(r) => r.watch.id}
        isLoading={loading}
        stickyHeader
        density="condensed"
        pageSize={100}
        defaultSort={{ id: "latest", direction: "desc" }}
        onRowOpen={onOpen}
        coverage={{ noun: "watch", answeredBy: "client", loaded: rows.length, total: loading ? undefined : rows.length }}
        toolbar={{ title: "Watches", search: true }}
        read={{ status: loading ? "loading" : "ready", what: "the performance watches" }}
        emptyState={{
          icon: <Gauge className="h-5 w-5" />,
          title: "No watches yet",
        }}
      />
    </div>
  );
}

// ── drill ────────────────────────────────────────────────────────────────────────────────────


function WatchDrill({
  row,
  loadingSnapshot,
  history,
  onBack,
  onRetry,
  onEdit,
}: {
  row: WatchRow | null;
  loadingSnapshot: boolean;
  history: Load<PerfSample[]>;
  onBack: () => void;
  onRetry: () => void;
  onEdit: (edit: PerfWatchEdit) => Promise<void>;
}) {
  if (!row) {
    return (
      <div className="space-y-2 text-xs">
        <Button variant="quiet" icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={onBack}>
          All watches
        </Button>
        <p className="text-muted-foreground">{loadingSnapshot ? "Loading…" : "This watch does not exist or was removed."}</p>
      </div>
    );
  }
  const w = row.watch;
  const samples = history.status === "ready" ? history.data : [];
  const transitions = stateHistory(samples);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <Button variant="quiet" icon={<ChevronLeft className="h-3.5 w-3.5" />} onClick={onBack}>
          All watches
        </Button>
        <span className="text-sm font-semibold">{w.label}</span>
        <StateBadge state={row.state} />
        <span className="font-mono text-[11px] text-muted-foreground">{w.slug}</span>
        {w.perf_state_since ? (
          <span className="text-muted-foreground">since {formatRelativeTime(w.perf_state_since)}</span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-card/50 p-2 text-xs sm:grid-cols-4">
        <Fact label="Measures" value={measuresLine(w)} />
        <Fact label="Budget" value={`${ms(w.budget_ms)}${w.budget_stat ? ` ${w.budget_stat}` : ""}`} />
        <Fact label="Baseline" value={`${ms(w.perf_baseline_ms)}${w.perf_baseline_pinned ? " (pinned)" : ""}`} />
        <Fact label="Every" value={w.live_every_seconds ? formatDurationSeconds(w.live_every_seconds, { style: "coarse" }) : "—"} />
        <Fact label="Owner" value={w.owner ?? "—"} />
        <Fact label="Feature" value={w.source_feature ?? "—"} />
        <Fact label="Samples" value={history.status === "ready" ? formatCount(samples.length) : "…"} />
        <Fact label="Last alert" value={w.perf_last_alert_at ? formatRelativeTime(w.perf_last_alert_at) : "—"} />
      </dl>
      {watchReason(w) ? (
        <p className="truncate text-xs text-muted-foreground" title={watchReason(w) ?? undefined}>
          {watchReason(w)}
        </p>
      ) : null}
      {subjectFields(w).length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-md border border-border bg-card/50 p-2 text-xs sm:grid-cols-4">
          {subjectFields(w).map((f) =>
            f.token && f.id ? (
              <div key={f.label} className="min-w-0">
                <dt className="text-[11px] text-muted-foreground">{f.label}</dt>
                <dd className="truncate font-medium">
                  <EntityRef token={f.token} id={f.id} name={f.value} />
                </dd>
              </div>
            ) : (
              <Fact key={f.label} label={f.label} value={f.value} />
            ),
          )}
        </dl>
      ) : null}
      <WatchEditor watch={w} onEdit={onEdit} />

      {history.status === "error" ? (
        <LoadError what="the sample history" message={history.message} onRetry={onRetry} />
      ) : history.status === "loading" ? (
        <p className="text-xs text-muted-foreground">Loading samples…</p>
      ) : samples.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          No samples yet
        </p>
      ) : (
        <>
          <HistoryChart samples={samples} row={row} />
          {transitions.length ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">State history</span>
              {transitions.slice(0, 8).map((t) => (
                <span key={t.sampleId} className="flex items-center gap-1" title={new Date(t.at).toLocaleString()}>
                  <StateBadge state={(PERF_STATES as readonly string[]).includes(t.state) ? (t.state as PerfState) : "learning"} />
                  <span className="text-muted-foreground">{formatRelativeTime(t.at)}</span>
                </span>
              ))}
            </div>
          ) : null}
          <SampleTable rows={samples} stat={w.budget_stat} budget={w.budget_ms} />
        </>
      )}
    </div>
  );
}

function WatchEditor({ watch, onEdit }: { watch: PerfWatch; onEdit: (edit: PerfWatchEdit) => Promise<void> }) {
  const [budget, setBudget] = useState(watch.budget_ms != null ? String(watch.budget_ms) : "");
  const [busy, setBusy] = useState(false);
  useEffect(() => setBudget(watch.budget_ms != null ? String(watch.budget_ms) : ""), [watch.budget_ms]);
  const run = async (edit: Omit<PerfWatchEdit, "p_check_id">, done: string) => {
    setBusy(true);
    try {
      await onEdit({ p_check_id: watch.id, ...edit });
      toast.success(done);
    } catch (error) {
      toast.error(`Could not change the watch: ${messageOf(error)}`);
    } finally {
      setBusy(false);
    }
  };
  const next = Number(budget);
  const budgetValid = budget.trim() !== "" && Number.isFinite(next) && next > 0;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Budget ms</span>
      <div className="w-24">
        {/* ui-exception: a raw number of milliseconds */}
        <Field
          type="number"
          inputMode="decimal"
          min={1}
          aria-label="Budget in milliseconds"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      </div>
      <Button
        variant="outline"
        disabled={busy || !budgetValid || next === watch.budget_ms}
        onClick={() => run({ p_budget_ms: next }, `Budget set to ${next} ms`)}
      >
        Save budget
      </Button>
      {watch.perf_baseline_pinned ? (
        <Button variant="quiet" icon={<PinOff className="h-3.5 w-3.5" />} disabled={busy} onClick={() => run({ p_baseline_pinned: false }, "Baseline unpinned")}>
          Unpin baseline
        </Button>
      ) : (
        <Button
          variant="quiet"
          icon={<Pin className="h-3.5 w-3.5" />}
          disabled={busy || watch.perf_baseline_ms == null}
          title={watch.perf_baseline_ms == null ? "No baseline yet" : undefined}
          onClick={() => run({ p_baseline_pinned: true }, "Baseline pinned")}
        >
          Pin baseline
        </Button>
      )}
      {watch.is_active ? (
        <Button variant="quiet" icon={<Pause className="h-3.5 w-3.5" />} disabled={busy} onClick={() => run({ p_is_active: false }, "Watch paused")}>
          Pause
        </Button>
      ) : (
        <Button variant="quiet" icon={<Play className="h-3.5 w-3.5" />} disabled={busy} onClick={() => run({ p_is_active: true }, "Watch resumed")}>
          Resume
        </Button>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function SampleTable({
  rows,
  stat,
  budget,
}: {
  rows: PerfSample[];
  stat: string | null;
  budget: number | null;
}) {
  const overOf = (s: PerfSample) => {
    const judged = judgedValue(s, stat);
    return judged != null && budget != null && judged > budget;
  };
  const num = (id: string, header: string, get: (s: PerfSample) => number | null | undefined, cell: (s: PerfSample) => ReactNode, width = 80): MatrxColumnDef<PerfSample> => ({
    id,
    header,
    accessorFn: (s) => get(s) ?? null,
    filter: "number",
    align: "right",
    width,
    cell,
  });
  const columns: MatrxColumnDef<PerfSample>[] = [
    {
      id: "measured",
      header: "Measured",
      accessorFn: (s) => s.measured_at,
      filter: "date",
      defaultSortDirection: "desc",
      width: 110,
      cell: (s) => <span title={new Date(s.measured_at).toLocaleString()}>{formatRelativeTime(s.measured_at)}</span>,
    },
    { id: "source", header: "Source", accessorFn: (s) => s.source, filter: "text", width: 110, cell: (s) => <span className="text-muted-foreground">{s.source}</span> },
    num("n", "n", (s) => s.n, (s) => <span className="tabular-nums">{s.n ?? "—"}</span>, 60),
    num("p50", "p50", (s) => s.p50_ms, (s) => <span className={`tabular-nums ${overOf(s) && stat === "p50" ? "font-medium text-warning" : ""}`}>{ms(s.p50_ms)}</span>),
    ...(stat === "p75"
      ? [num("p75", "p75", (s) => judgedValue(s, stat), (s) => <span className={`tabular-nums ${overOf(s) ? "font-medium text-warning" : ""}`}>{ms(judgedValue(s, stat))}</span>)]
      : []),
    num("p95", "p95", (s) => s.p95_ms, (s) => <span className={`tabular-nums ${overOf(s) && stat === "p95" ? "font-medium text-warning" : ""}`}>{ms(s.p95_ms)}</span>),
    num("max", "Max", (s) => s.max_ms, (s) => <span className="tabular-nums text-muted-foreground">{ms(s.max_ms)}</span>),
    num("mean", "Mean", (s) => s.mean_ms, (s) => <span className={`tabular-nums ${overOf(s) && stat === "mean" ? "font-medium text-warning" : ""}`}>{ms(s.mean_ms)}</span>),
    num("calls", "Calls", (s) => s.calls, (s) => <span className="tabular-nums text-muted-foreground">{s.calls ?? "—"}</span>),
    num("errors", "Errors", (s) => s.errors ?? 0, (s) => <span className={`tabular-nums ${s.errors ? "font-medium text-destructive" : "text-muted-foreground"}`}>{s.errors ?? 0}</span>),
    num("bytes", "Bytes", (s) => s.bytes, (s) => <span className="tabular-nums text-muted-foreground">{s.bytes != null ? formatFileSize(s.bytes) : "—"}</span>),
    { id: "state", header: "State", accessorFn: (s) => s.state_after ?? "", filter: "select", width: 110, cell: (s) => <span className="text-muted-foreground">{s.state_after ?? "—"}</span> },
    { id: "note", header: "Note", accessorFn: (s) => s.note ?? "", filter: "text", width: 260, cell: (s) => <span className="text-muted-foreground">{s.note ?? "—"}</span> },
    { id: "release", header: "Release", accessorFn: (s) => s.release_sha?.slice(0, 7) ?? "", filter: "text", width: 100, cell: (s) => <span className="font-mono text-[11px] text-muted-foreground">{s.release_sha?.slice(0, 7) ?? "—"}</span> },
  ];
  return (
    <MatrxDataTable<PerfSample>
      tableId="admin/performance-watch/samples"
      data={rows}
      columns={columns}
      getRowId={(s) => s.id}
      defaultSort={{ id: "measured", direction: "desc" }}
      pageSize={25}
      viewTabs={false}
      toolbar={{ title: "Samples" }}
      emptyState={{ title: "No samples" }}
    />
  );
}

const CHART_W = 720;
const CHART_H = 160;
const PAD = { l: 44, r: 8, t: 8, b: 18 };

function HistoryChart({ samples, row }: { samples: PerfSample[]; row: WatchRow }) {
  const w = row.watch;
  const ordered = useMemo(
    () => samples.slice().sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at)),
    [samples],
  );
  const meanBound = w.budget_stat === "mean";
  const series: { name: string; pick: (s: PerfSample) => number | null; cls: string }[] = meanBound
    ? [{ name: "mean", pick: (s) => s.mean_ms, cls: "stroke-primary" }]
    : [
        { name: "p50", pick: (s) => s.p50_ms, cls: "stroke-muted-foreground" },
        { name: "p95", pick: (s) => s.p95_ms, cls: "stroke-primary" },
      ];
  const t0 = Date.parse(ordered[0].measured_at);
  const t1 = Date.parse(ordered[ordered.length - 1].measured_at);
  const values = ordered.flatMap((s) => series.map((x) => x.pick(s))).filter((v): v is number => v != null);
  const refs = [w.budget_ms, w.perf_baseline_ms].filter((v): v is number => v != null);
  const yMax = Math.max(1, ...values, ...refs) * 1.1;
  const x = (t: number) => PAD.l + (t1 === t0 ? 0.5 : (t - t0) / (t1 - t0)) * (CHART_W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / yMax) * (CHART_H - PAD.t - PAD.b);

  return (
    <div className="rounded-md border border-border bg-card/50 p-2">
      <div className="mb-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-1">
            <svg width={12} height={4} aria-hidden><line x1={0} x2={12} y1={2} y2={2} strokeWidth={2} className={s.cls} /></svg>
            {s.name}
          </span>
        ))}
        {w.budget_ms != null ? (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-dashed border-warning" />
            budget
          </span>
        ) : null}
        {w.perf_baseline_ms != null ? (
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-dotted border-muted-foreground" />
            baseline
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="h-40 w-full" role="img" aria-label="Sample history">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={CHART_W - PAD.r} y1={y(yMax * f / 1.1)} y2={y(yMax * f / 1.1)} className="stroke-border" strokeWidth={0.5} />
            <text x={PAD.l - 4} y={y(yMax * f / 1.1) + 3} textAnchor="end" fontSize={9} className="fill-muted-foreground">
              {ms(yMax * f / 1.1)}
            </text>
          </g>
        ))}
        {w.budget_ms != null ? (
          <line x1={PAD.l} x2={CHART_W - PAD.r} y1={y(w.budget_ms)} y2={y(w.budget_ms)} className="stroke-warning" strokeWidth={1} strokeDasharray="4 3" />
        ) : null}
        {w.perf_baseline_ms != null ? (
          <line x1={PAD.l} x2={CHART_W - PAD.r} y1={y(w.perf_baseline_ms)} y2={y(w.perf_baseline_ms)} className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="1 3" />
        ) : null}
        {/* Markers (a re-declared subject, or an event any lane recorded through ops.perf_marker): a vertical line. */}
        {ordered.filter(isMarkerSample).map((m) => (
          <line key={m.id} x1={x(Date.parse(m.measured_at))} x2={x(Date.parse(m.measured_at))} y1={PAD.t} y2={CHART_H - PAD.b}
            className="stroke-muted-foreground" strokeWidth={1} strokeDasharray="2 2">
            <title>{m.note ?? "marker"}</title>
          </line>
        ))}
        {series.map((s) => {
          const pts = ordered
            .map((p) => ({ t: Date.parse(p.measured_at), v: s.pick(p) }))
            .filter((p): p is { t: number; v: number } => p.v != null);
          return (
            <g key={s.name}>
              <polyline
                points={pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")}
                fill="none"
                className={s.cls}
                strokeWidth={1.25}
                strokeLinejoin="round"
              />
              {pts.length === 1 ? <circle cx={x(pts[0].t)} cy={y(pts[0].v)} r={2.5} className={s.cls.replace("stroke-", "fill-")} /> : null}
            </g>
          );
        })}
        <text x={PAD.l} y={CHART_H - 4} fontSize={9} className="fill-muted-foreground">
          {new Date(t0).toLocaleDateString()}
        </text>
        <text x={CHART_W - PAD.r} y={CHART_H - 4} textAnchor="end" fontSize={9} className="fill-muted-foreground">
          {new Date(t1).toLocaleDateString()}
        </text>
      </svg>
    </div>
  );
}
