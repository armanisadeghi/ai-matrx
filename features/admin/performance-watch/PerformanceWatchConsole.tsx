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

import { Suspense, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Gauge, Pause, Pin, PinOff, Play, RefreshCw, XCircle } from "lucide-react";
import { Field } from "@ai-matrx/design-system/controls";
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
  judgedValue,
  measuresLine,
  sparklinePoints,
  stateCounts,
  stateHistory,
  subjectFields,
  summarizeWatches,
  watchReason,
  type PerfSample,
  type PerfWatch,
  type PerfWatchEdit,
  type PerfState,
  type WatchRow,
} from "./model";
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
  const [reloadKey, setReloadKey] = useState(0);

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
          <Button
            icon={<RefreshCw className={`h-3.5 w-3.5 ${snapshot.status === "loading" ? "animate-spin" : ""}`} />}
            variant="quiet"
            className="ml-auto"
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
            now={now || Date.now()}
            onBack={() => navigate(null, true)}
            onRetry={() => setReloadKey((k) => k + 1)}
            onEdit={async (edit) => {
              await source.updateWatch(edit);
              setReloadKey((k) => k + 1);
            }}
          />
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

const PAGE_SIZE = 25;

function WatchDrill({
  row,
  loadingSnapshot,
  history,
  now,
  onBack,
  onRetry,
  onEdit,
}: {
  row: WatchRow | null;
  loadingSnapshot: boolean;
  history: Load<PerfSample[]>;
  now: number;
  onBack: () => void;
  onRetry: () => void;
  onEdit: (edit: PerfWatchEdit) => Promise<void>;
}) {
  const [page, setPage] = useState(0);
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
  const pages = Math.max(1, Math.ceil(samples.length / PAGE_SIZE));
  const visible = samples.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
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
          <SampleTable rows={visible} now={now} stat={w.budget_stat} budget={w.budget_ms} />
          {pages > 1 ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button variant="quiet" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Newer
              </Button>
              <span>
                {page + 1} / {pages}
              </span>
              <Button variant="quiet" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Older
              </Button>
            </div>
          ) : null}
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
  now,
  stat,
  budget,
}: {
  rows: PerfSample[];
  now: number;
  stat: string | null;
  budget: number | null;
}) {
  void now;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 text-left text-[11px] text-muted-foreground">
          <tr>
            {["Measured", "Source", "n", "p50", ...(stat === "p75" ? ["p75"] : []), "p95", "Max", "Mean", "Calls", "Errors", "Bytes", "State", "Note", "Release"].map((h) => (
              <th key={h} className={`px-2 py-1 font-medium ${h === "Measured" || h === "Source" || h === "State" || h === "Note" || h === "Release" ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const judged = judgedValue(s, stat);
            const over = judged != null && budget != null && judged > budget;
            return (
              <tr key={s.id} className="border-t border-border/60">
                <td className="px-2 py-1" title={new Date(s.measured_at).toLocaleString()}>
                  {formatRelativeTime(s.measured_at)}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{s.source}</td>
                <td className="px-2 py-1 text-right tabular-nums">{s.n ?? "—"}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${over && stat === "p50" ? "font-medium text-warning" : ""}`}>{ms(s.p50_ms)}</td>
                {stat === "p75" ? (
                  <td className={`px-2 py-1 text-right tabular-nums ${over ? "font-medium text-warning" : ""}`}>{ms(judged)}</td>
                ) : null}
                <td className={`px-2 py-1 text-right tabular-nums ${over && stat === "p95" ? "font-medium text-warning" : ""}`}>{ms(s.p95_ms)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{ms(s.max_ms)}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${over && stat === "mean" ? "font-medium text-warning" : ""}`}>{ms(s.mean_ms)}</td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{s.calls ?? "—"}</td>
                <td className={`px-2 py-1 text-right tabular-nums ${s.errors ? "font-medium text-destructive" : "text-muted-foreground"}`}>{s.errors ?? 0}</td>
                <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{s.bytes != null ? formatFileSize(s.bytes) : "—"}</td>
                <td className="px-2 py-1 text-muted-foreground">{s.state_after ?? "—"}</td>
                <td className="max-w-[22rem] truncate px-2 py-1 text-muted-foreground" title={s.note ?? undefined}>
                  {s.note ?? "—"}
                </td>
                <td className="px-2 py-1 font-mono text-[11px] text-muted-foreground">{s.release_sha?.slice(0, 7) ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
