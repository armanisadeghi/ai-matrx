"use client";

/**
 * One news monitor, as its owner reads it (NEWS-ENGINE-SPEC §12 Lane G): the
 * run's report, triage, angles and newsworthiness, the digest with every watch
 * reason, what was set aside (each list openable), source health, the cost
 * ceiling with Resume, and Run now streamed step by step.
 *
 * Address: `/marketing/[brand]/intelligence/monitoring?tracker=<id>[&run=<id>][&story=<key>][&view=report|withheld]`
 * — the exact deep links the engine writes into every digest and alert
 * (aidream `services/news/run.py::run_links`). Hosted by the brand's
 * Monitoring front door; there is no second monitor page.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  Pencil,
  Play,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import type { TrackerStoryRow } from "@/features/marketing/data/coverage-types";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  getMonitorSchedule,
  getSetupFacts,
  runMonitorNow,
  type ScheduleView,
  type SetupFacts,
} from "@/features/marketing/monitor-setup/api";
import { useTracker } from "@/features/marketing/monitor-setup/data";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import { CostBanner } from "./CostBanner";
import {
  isTerminalRunStatus,
  useInvalidateNewsMonitor,
  useRunProgress,
  useMonitorRuns,
  useRunParts,
  useTrackerStories,
} from "./data";
import { NewsAngleSetView } from "./kinds/NewsAngleSetView";
import { NewsClientContextView } from "./kinds/NewsClientContextView";
import { NewsDigestView } from "./kinds/NewsDigestView";
import { NewsOpportunityReportView } from "./kinds/NewsOpportunityReportView";
import { NewsTriageView } from "./kinds/NewsTriageView";
import { NewsworthinessVerdictView } from "./kinds/NewsworthinessVerdictView";
import { Pill, formatWhen } from "./kinds/shared";
import {
  humanize,
  isRecord,
  num,
  readSetAside,
  readSourceHealth,
  reportIsReadable,
  str,
  type SetAsideList,
} from "./run-document";
import { SetAsideLists } from "./SetAsideLists";
import { StoryActions } from "./StoryActions";

/** The "News monitor run" template's steps, in order (aidream `workflows/news_monitor_run_v1.py`). */
const STEP_LABELS: Record<string, string> = {
  collect: "Collect news",
  coverage: "Coverage lens",
  score: "Score stories",
  judge_relevance: "Judge relevance",
  floors: "Relevance floors",
  apply_relevance: "Apply relevance",
  group: "Group same stories",
  judge_origin: "Judge story origin",
  collect_origins: "Collect origin findings",
  freshness: "Freshness gate",
  triage: "Triage",
  judge_angles: "Judge angles",
  collect_angles: "Collect angles",
  apply_angles: "Apply angles",
  judge_newsworthiness: "Judge newsworthiness",
  collect_verdicts: "Collect verdicts",
  commit: "Save stories",
  summarize: "Summarize",
  report: "Report",
  deliver: "Deliver",
};
const STEP_ORDER = Object.keys(STEP_LABELS);

type StepState = "running" | "done" | "skipped" | "failed";

export function NewsMonitorRunView({ trackerId }: { trackerId: string }) {
  const brandCtx = useMarketingBrand();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const invalidate = useInvalidateNewsMonitor();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useClippedContentGuard(scrollRef, { label: "news monitor run view" });

  const runParam = searchParams.get("run");
  const storyParam = searchParams.get("story");
  const viewParam = searchParams.get("view");

  const [live, setLive] = useState<{
    runId: string | null;
    steps: Record<string, StepState>;
    /** The Run now request itself has returned (the run may still be going). */
    requestDone: boolean;
    error: string | null;
  } | null>(null);
  // The run's durable record decides whether it is still going — never the
  // stream closing (the run continues server-side after the stream ends) and
  // never this component's memory (a reload or a navigation keeps the truth).
  const starting = Boolean(live && !live.runId && !live.error);
  const runs = useMonitorRuns(trackerId, starting);
  const anyRunGoing = (runs.data ?? []).some((r) => !isTerminalRunStatus(r.status));
  const tracker = useTracker(trackerId, starting || anyRunGoing ? 5000 : false);
  const selectedRunId =
    runParam ??
    live?.runId ??
    (isRecord(tracker.data?.last_run_summary)
      ? str(tracker.data?.last_run_summary.run_id) || null
      : null) ??
    runs.data?.[0]?.id ??
    null;
  const progress = useRunProgress(selectedRunId);
  const runStatus = progress.data?.status ?? null;
  const selectedActive = Boolean(
    selectedRunId && runStatus && !isTerminalRunStatus(runStatus),
  );
  const running = starting || selectedActive;
  const parts = useRunParts(selectedRunId, running ? 4000 : false);
  const stories = useTrackerStories(trackerId);

  const [overrides, setOverrides] = useState<Record<string, TrackerStoryRow>>({});
  const storyMap = useMemo(() => {
    const map = new Map<string, TrackerStoryRow>();
    for (const s of stories.data ?? []) map.set(s.story_key, overrides[s.id] ?? s);
    return map;
  }, [stories.data, overrides]);

  // When the run it started settles, read everything it wrote once more.
  // (`invalidate` is memoised by the compiler, so this fires once per settled run.)
  const [watching, setWatching] = useState<string | null>(null);
  useEffect(() => {
    if (selectedActive && selectedRunId) setWatching(selectedRunId);
    else if (watching && watching === selectedRunId && isTerminalRunStatus(runStatus)) {
      setWatching(null);
      void invalidate();
    }
  }, [selectedActive, selectedRunId, runStatus, watching, invalidate]);

  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [setup, setSetup] = useState<SetupFacts | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let alive = true;
    getMonitorSchedule(dispatch, trackerId, brandCtx.organizationId)
      .then((v) => alive && setSchedule(v))
      .catch(() => alive && setSchedule(null));
    getSetupFacts(dispatch, brandCtx.id, brandCtx.organizationId)
      .then((v) => alive && setSetup(v))
      .catch(() => alive && setSetup(null));
    return () => {
      alive = false;
    };
  }, [dispatch, trackerId, brandCtx.id, brandCtx.organizationId, refreshKey]);

  // A deep link to one story scrolls to it once the lists have rendered.
  useEffect(() => {
    if (!storyParam || !parts.data) return;
    const el = document.querySelector(`[data-story-key="${CSS.escape(storyParam)}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [storyParam, parts.data]);

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const runNow = async () => {
    setLive({ runId: null, steps: {}, requestDone: false, error: null });
    try {
      const started = await runMonitorNow(dispatch, trackerId, brandCtx.organizationId, {
        onRunId: (runId) => {
          setLive((cur) => (cur ? { ...cur, runId } : cur));
          setParam("run", runId);
        },
        onStep: ({ nodeId, event }) =>
          setLive((cur) =>
            cur
              ? {
                  ...cur,
                  steps: {
                    ...cur.steps,
                    [nodeId]:
                      event === "node_started"
                        ? "running"
                        : event === "node_failed"
                          ? "failed"
                          : event === "node_skipped"
                            ? "skipped"
                            : "done",
                  },
                }
              : cur,
          ),
      });
      setLive((cur) => (cur ? { ...cur, runId: cur.runId ?? started.runId, requestDone: true } : cur));
      if (started.runId) setParam("run", started.runId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLive((cur) => (cur ? { ...cur, requestDone: true, error: message } : cur));
      toast.error(message);
    } finally {
      void invalidate();
    }
  };

  if (tracker.isError) {
    return <QueryError error={tracker.error} onRetry={() => void tracker.refetch()} />;
  }
  if (tracker.isPending) return <LoadingSurface label="Loading the monitor…" />;
  const monitor = tracker.data;
  if (!monitor) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        This monitor does not exist, or you cannot open it.{" "}
        <Link className="text-primary" href={marketingRoutes.brandMonitoring(brandCtx.seg)}>
          Back to Monitoring
        </Link>
      </div>
    );
  }

  const run = parts.data;
  const summary = run?.summary ?? null;
  const knobs = isRecord(summary?.knobs) ? summary.knobs : {};
  const health = readSourceHealth(summary, run?.digest ?? null);
  const setAside: SetAsideList[] = run ? readSetAside(run) : [];
  const storyActions = (storyKey: string) => (
    <StoryActions
      story={storyMap.get(storyKey)}
      onChanged={(row) => {
        setOverrides((cur) => ({ ...cur, [row.id]: row }));
        void stories.refetch();
      }}
    />
  );
  const performers = isRecord(summary?.performers) ? summary.performers : {};
  const liveSources = health.filter((h) => h.items > 0);
  const quietSources = health.filter((h) => h.items === 0);
  const personActed = [...storyMap.values()].filter(
    (s) => s.status === "dismissed" || Boolean(s.surfaced_override_at),
  );
  // The `news.*` knobs are organization / brand / site settings (never per
  // person), so they live in the ORGANIZATION's universal settings — the
  // personal settings surface filters them out by design. Values are never
  // edited on this page.
  const settingsHref = `/organizations/${encodeURIComponent(brandCtx.organizationId)}/settings/configuration`;
  const trackerSummaryRun = isRecord(monitor.last_run_summary)
    ? str(monitor.last_run_summary.run_id)
    : "";

  return (
    <div className="flex h-full flex-col bg-textured">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 p-3 pt-[calc(var(--shell-header-h)+0.75rem)]">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={marketingRoutes.brandMonitoring(brandCtx.seg)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> Monitoring
              </Link>
              <h1 className="text-base font-semibold text-foreground">{monitor.name}</h1>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {(monitor.lenses ?? []).map((lens) => (
                  <Pill key={lens} tone="info">
                    {lens === "opportunity" ? "News we can join" : "Who writes about us"}
                  </Pill>
                ))}
                <span data-surface-value="news_schedule_status">
                  {schedule
                    ? schedule.has_schedule && schedule.is_active
                      ? `Runs ${humanize(schedule.preset ?? "custom").toLowerCase()}${schedule.timezone ? ` (${schedule.timezone})` : ""}${schedule.next_run_at ? ` · next ${formatWhen(schedule.next_run_at)}` : ""}`
                      : "No schedule — set one"
                    : null}
                </span>
                {monitor.last_run_at ? <span>· last run {formatWhen(monitor.last_run_at)}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Button asChild size="sm" variant="ghost">
                <Link href={settingsHref} title="Every news monitor setting (knobs), per organization, brand and person">
                  <SlidersHorizontal className="h-3.5 w-3.5" /> News settings
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link
                  href={marketingRoutes.brandMonitorSetup(brandCtx.id, {
                    trackerId: monitor.id,
                    siteId: monitor.site_id ?? undefined,
                  })}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit monitor
                </Link>
              </Button>
              <Button size="sm" onClick={() => void runNow()} disabled={running}>
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {running ? "Running…" : "Run now"}
              </Button>
            </div>
          </header>

          <CostBanner
            organizationId={brandCtx.organizationId}
            pausedAt={monitor.auto_run_paused_at}
            pausedReason={monitor.auto_run_paused_reason}
            monthToDateUsd={setup?.cost?.month_to_date_usd ?? num(summary?.month_to_date_cost_usd)}
            ceilingUsd={setup?.cost?.monthly_ceiling_usd ?? num(knobs.monthly_run_cost_ceiling_usd)}
            warnPct={typeof knobs.cost_warn_pct === "number" ? knobs.cost_warn_pct : null}
            onResumed={() => {
              void tracker.refetch();
              setRefreshKey((k) => k + 1);
            }}
          />

          {live || selectedActive ? (
            <section className="rounded-md border border-border bg-card p-3" data-surface-value="news_run_live">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  {live?.error
                    ? "The run could not start"
                    : running
                      ? "Running now"
                      : runStatus === "completed"
                        ? "Run finished"
                        : `The run ended: ${runStatus ?? "unknown"}`}
                </h2>
                {selectedRunId ? (
                  <Link href={`/workflows/runs/${selectedRunId}`} className="text-xs text-primary">
                    Open the run step by step
                  </Link>
                ) : null}
              </div>
              {live?.error ? <p className="text-xs text-destructive">{live.error}</p> : null}
              <ol className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-4">
                {STEP_ORDER.map((id, index) => {
                  const streamed =
                    live && live.runId === selectedRunId ? live.steps : {};
                  const settled = progress.data?.settled[id];
                  const firstOpen = STEP_ORDER.findIndex(
                    (step) => !progress.data?.settled[step] && !streamed[step],
                  );
                  const state: StepState | undefined =
                    settled ??
                    streamed[id] ??
                    (selectedActive && index === firstOpen ? "running" : undefined);
                  return (
                    <li key={id} className="flex items-center gap-1.5 text-xs" data-step={id} data-step-state={state ?? "waiting"}>
                      {state === "running" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      ) : state === "done" ? (
                        <CheckCircle2 className="h-3 w-3 text-success" />
                      ) : state === "failed" ? (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ) : state === "skipped" ? (
                        <Circle className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <Circle className="h-3 w-3 text-muted-foreground/40" />
                      )}
                      <span className={cn(state ? "text-foreground" : "text-muted-foreground")}>
                        {STEP_LABELS[id]}
                        {state === "skipped" ? " (not needed)" : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Run</span>
            <Select value={selectedRunId ?? undefined} onValueChange={(v) => setParam("run", v)}>
              <SelectTrigger className="h-8 w-72 text-sm" aria-label="Which run">
                <SelectValue placeholder={runs.isPending ? "Loading runs…" : "No runs yet"} />
              </SelectTrigger>
              <SelectContent>
                {(runs.data ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {formatWhen(r.created_at)} · {humanize(r.trigger ?? "run")} · {r.status}
                  </SelectItem>
                ))}
                {selectedRunId && !(runs.data ?? []).some((r) => r.id === selectedRunId) ? (
                  <SelectItem value={selectedRunId}>This run</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
            {summary ? (
              <span className="text-muted-foreground" data-surface-value="news_run_facts">
                {humanize(str(summary.trigger) || "run")} · generated {formatWhen(str(summary.run_generated_at))} ·
                parity mode {summary.parity_mode === true ? "on" : "off"} ·{" "}
                {Object.keys(performers).length} judgment job{Object.keys(performers).length === 1 ? "" : "s"} bound
              </span>
            ) : null}
          </div>

          {!selectedRunId ? (
            <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              This monitor has not run yet. Press Run now to watch the first run.
            </p>
          ) : parts.isError ? (
            <QueryError error={parts.error} onRetry={() => void parts.refetch()} />
          ) : parts.isPending ? (
            <LoadingSurface label="Loading the run…" />
          ) : !run ? (
            <p className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              {running ? "The run has started; its first step is still working." : "This run has no recorded steps yet."}
            </p>
          ) : (
            <>
              {health.length ? (
                <section className="rounded-md border border-border bg-card p-3" data-surface-value="news_source_health">
                  <h2 className="text-sm font-semibold text-foreground">Sources this run</h2>
                  <p className="text-xs text-foreground">
                    Read from {liveSources.map((h) => `${humanize(h.source)} (${h.items})`).join(", ") || "no source"}.
                  </p>
                  {quietSources.length ? (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {quietSources.map((h) => (
                        <li key={h.source} className="text-xs text-muted-foreground" data-source-status={h.status}>
                          <span className="font-medium text-warning">{humanize(h.source)}</span>: {humanize(h.status).toLowerCase()}
                          {h.error ? ` — ${h.error.slice(0, 280)}${h.error.length > 280 ? "…" : ""}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
              ) : null}

              {run.notices.filter((n) => !n.code.startsWith("news.source.")).length ? (
                <section className="rounded-md border border-border bg-card p-3">
                  <h2 className="text-sm font-semibold text-foreground">Notices</h2>
                  <ul className="mt-1 flex flex-col gap-1">
                    {run.notices
                      .filter((n) => !n.code.startsWith("news.source."))
                      .filter((n, i, all) => all.findIndex((m) => m.code === n.code && m.message === n.message) === i)
                      .map((n) => (
                        <li key={`${n.code}-${n.message}`} className="text-xs">
                          <span className="text-foreground">{n.message}</span>
                          {n.remedy && !/^[a-z_]+$/.test(n.remedy) ? (
                            <span className="text-muted-foreground"> {n.remedy}</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </section>
              ) : null}

              <div id="report" className={cn(viewParam === "report" && "ring-2 ring-primary/40 rounded-md")}>
                {reportIsReadable(run.report) && run.report ? (
                  <NewsOpportunityReportView value={run.report} />
                ) : (
                  <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                    {run.report
                      ? "The report job ran but wrote nothing a person can read for this run; the triage and digest below are the record."
                      : "No written report for this run (the report job did not run). The triage and digest below are the record."}
                  </p>
                )}
              </div>

              {run.triage ? <NewsTriageView value={run.triage} storyActions={storyActions} /> : null}

              {run.angleSets.map((set) => {
                const key = str(set.signal_id);
                return (
                  <div key={key} data-story-key={key}>
                    <NewsAngleSetView value={set} title={storyMap.get(key)?.title ?? undefined} />
                  </div>
                );
              })}
              {Object.entries(run.verdicts).map(([key, verdict]) => (
                <NewsworthinessVerdictView key={key} value={verdict} title={storyMap.get(key)?.title ?? undefined} />
              ))}

              {run.digest ? (
                <div data-surface-value="news_digest_host">
                  <NewsDigestView value={run.digest} storyActions={(key) => <span data-story-key={key}>{storyActions(key)}</span>} />
                </div>
              ) : (
                <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
                  This run has no digest yet — it is written at the summarize step.
                </p>
              )}

              <SetAsideLists
                lists={setAside}
                stories={storyMap}
                storyActions={storyActions}
                initiallyOpen={viewParam === "withheld" ? "withheld" : null}
              />

              {personActed.length ? (
                <section className="rounded-md border border-border bg-card p-3" data-surface-value="news_person_actions">
                  <h2 className="text-sm font-semibold text-foreground">Your calls on this monitor</h2>
                  <ul className="mt-1 flex flex-col gap-1">
                    {personActed.map((s) => (
                      <li key={s.id} className="flex flex-wrap items-center gap-x-2 text-sm">
                        <span className="text-foreground">{s.title}</span>
                        {storyActions(s.story_key)}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {run.clientContext ? <NewsClientContextView value={run.clientContext} /> : null}
              {trackerSummaryRun && trackerSummaryRun !== run.runId ? (
                <p className="text-xs text-muted-foreground">
                  You are looking at an earlier run.{" "}
                  <button type="button" className="text-primary" onClick={() => setParam("run", trackerSummaryRun)}>
                    Open the latest
                  </button>
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
