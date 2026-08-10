"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gauge,
  Loader2,
  Monitor,
  RefreshCw,
  Smartphone,
  Unplug,
  Wrench,
} from "lucide-react";
import { ScoreRing } from "@/components/official/ScoreRing";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import {
  useLatestPagespeedFailure,
  usePagePerformance,
} from "@/features/marketing/data/hooks";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useAppDispatch } from "@/lib/redux/hooks";
import type { MarketingPage } from "@/features/marketing/types";
import {
  BackendFailureDetails,
  formatDate,
  MetricCell,
  QueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  describeBackendFailure,
  type BackendFailureExplanation,
} from "@/lib/api/errors";
import {
  syncPagespeed,
  type PagePerformanceSample,
  type PagespeedStrategy,
  type PagespeedSyncProgress,
} from "@/features/marketing/pagespeed/data";
import {
  fieldCategoryTone,
  lighthouseScore,
  metric,
  metricTone,
  milliseconds,
  regressionVerdict,
} from "@/features/marketing/pagespeed/format";
import {
  GscDailySparkline,
  PerformanceHistoryChart,
} from "@/features/marketing/components/pages/cards/PagePerformanceCharts";

const LIGHTHOUSE_THRESHOLDS = { good: 90, warning: 50 } as const;

function elapsedLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function metricBox({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "warning" | "bad" | "default";
}) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/20 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold tabular-nums text-foreground",
          tone === "good" && "text-emerald-600 dark:text-emerald-400",
          tone === "warning" && "text-orange-600 dark:text-orange-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 text-[10px] text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}

function StrategyResults({ sample }: { sample: PagePerformanceSample }) {
  const isMobile = sample.strategy === "mobile";
  const lcp = metric(sample, "lcp_ms");
  const cls = metric(sample, "cls");
  const tbt = metric(sample, "tbt_ms");
  const fcp = metric(sample, "fcp_ms");
  const ttfb = metric(sample, "ttfb_ms");
  const scores = [
    ["Performance", sample.performance_score],
    ["Accessibility", sample.accessibility_score],
    ["Best practices", sample.best_practices_score],
    ["SEO", sample.seo_score],
  ] as const;

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold capitalize text-foreground">
            {isMobile ? (
              <Smartphone className="h-4 w-4" />
            ) : (
              <Monitor className="h-4 w-4" />
            )}
            {sample.strategy}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Tested {formatDate(sample.observed_at)}
          </p>
        </div>
        {sample.final_url ? (
          <a
            href={sample.final_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            Tested page <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 justify-items-center gap-3 sm:grid-cols-4">
        {scores.map(([label, score]) => (
          <ScoreRing
            key={label}
            pct={lighthouseScore(score)}
            label={label}
            size={76}
            strokeWidth={7}
            valueClassName="text-lg"
            thresholds={LIGHTHOUSE_THRESHOLDS}
            suffix=""
          />
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <Badge variant="secondary">Lab</Badge>
          <p className="text-xs text-muted-foreground">
            One controlled Lighthouse test
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {metricBox({
            label: "LCP",
            value: milliseconds(lcp),
            detail: "Largest content",
            tone: metricTone(lcp, 2500, 4000),
          })}
          {metricBox({
            label: "CLS",
            value: cls === null ? "—" : cls.toFixed(3),
            detail: "Layout shift",
            tone: metricTone(cls, 0.1, 0.25),
          })}
          {metricBox({
            label: "TBT / INP",
            value: milliseconds(tbt),
            detail: "Lab interaction proxy",
            tone: metricTone(tbt, 200, 600),
          })}
          {metricBox({
            label: "FCP",
            value: milliseconds(fcp),
            detail: "First content",
            tone: metricTone(fcp, 1800, 3000),
          })}
          {metricBox({
            label: "TTFB",
            value: milliseconds(ttfb),
            detail: "Server response",
            tone: metricTone(ttfb, 800, 1800),
          })}
        </div>
      </div>

      <div className="mt-3 rounded-md border border-sky-500/25 bg-sky-500/5 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="border-sky-500/40 text-sky-700 dark:text-sky-300"
          >
            Field (real users)
          </Badge>
          <span className="text-xs text-muted-foreground">
            Chrome User Experience data
          </span>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {metricBox({
            label: "LCP p75",
            value: milliseconds(sample.field_lcp_p75_ms ?? null),
            detail: "75th percentile",
            tone: metricTone(sample.field_lcp_p75_ms ?? null, 2500, 4000),
          })}
          {metricBox({
            label: "Overall category",
            value:
              sample.field_overall_category?.replaceAll("_", " ") ??
              "Not enough data",
            detail: "Google's field verdict",
            tone: fieldCategoryTone(sample.field_overall_category),
          })}
        </div>
      </div>
    </section>
  );
}

function SyncProgress({
  strategy,
  progress,
  completed,
  elapsed,
}: {
  strategy: PagespeedStrategy;
  progress: PagespeedSyncProgress | null;
  completed: number;
  elapsed: number;
}) {
  const expected = strategy === "both" ? 2 : 1;
  const stageIndex = progress
    ? { provider: 0, persisted: 1, complete: 2 }[progress.stage]
    : -1;
  const stages = ["Google test", "Save results", "Refresh verdict"];
  return (
    <div
      className="rounded-lg border border-primary/30 bg-primary/5 p-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-xs font-medium text-foreground">
          {progress?.message ?? "Preparing the PageSpeed test…"}
        </p>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
          {elapsedLabel(elapsed)} · {completed}/{expected} tests complete
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {stages.map((label, index) => (
          <div
            key={label}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
          >
            {index < stageIndex ||
            (index === 2 && progress?.stage === "complete") ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            ) : index === stageIndex ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <span className="h-3.5 w-3.5 rounded-full border border-border" />
            )}
            {label}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        Each device usually takes 20–40 seconds. You can keep working while it
        runs.
      </p>
    </div>
  );
}

export function PagePerformanceCard({ page }: { page: MarketingPage }) {
  const dispatch = useAppDispatch();
  const { sitePath } = useMarketingSite();
  const performance = usePagePerformance(page.site_id, page.id);
  const latestRunFailure = useLatestPagespeedFailure(page.site_id, page.id);
  const [syncingStrategy, setSyncingStrategy] =
    useState<PagespeedStrategy | null>(null);
  const [syncProgress, setSyncProgress] =
    useState<PagespeedSyncProgress | null>(null);
  const [completedTests, setCompletedTests] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [syncFailure, setSyncFailure] =
    useState<BackendFailureExplanation | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!syncingStrategy) return;
    const timer = window.setInterval(
      () => setElapsed((value) => value + 1),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [syncingStrategy]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const data = performance.data;
  const canRun = data?.config.psi_has_key !== false;

  const runSync = async (strategy: PagespeedStrategy) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setSyncingStrategy(strategy);
    setSyncProgress(null);
    setCompletedTests(0);
    setElapsed(0);
    setSyncFailure(null);
    let receipts = 0;
    try {
      await syncPagespeed(dispatch, page.id, page.organization_id, strategy, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (progress.stage === "complete") receipts += 1;
          setCompletedTests(receipts);
          setSyncProgress(progress);
        },
      });
      await Promise.all([performance.refetch(), latestRunFailure.refetch()]);
      toast.success("Page performance refreshed", {
        description:
          strategy === "both"
            ? "Mobile and desktop results are ready."
            : `${strategy[0].toUpperCase()}${strategy.slice(1)} results are ready.`,
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const explanation = describeBackendFailure(error);
      setSyncFailure(explanation);
      toast.error("PageSpeed test failed", {
        description: explanation.headline,
      });
    } finally {
      if (!controller.signal.aborted) setSyncingStrategy(null);
      abortRef.current = null;
    }
  };

  if (performance.isLoading && !data) {
    return (
      <SectionCard title="Page performance" collapsible anchor="pagespeed">
        <div className="grid gap-3 p-3">
          <div className="h-10 animate-pulse rounded-md bg-muted/50" />
          <div className="grid gap-3 md:grid-cols-2">
            <div className="h-72 animate-pulse rounded-md bg-muted/50" />
            <div className="h-72 animate-pulse rounded-md bg-muted/50" />
          </div>
        </div>
      </SectionCard>
    );
  }

  if (performance.isError || !data) {
    return (
      <SectionCard title="Page performance" collapsible anchor="pagespeed">
        <QueryError
          error={
            performance.error ?? new Error("Page performance is unavailable.")
          }
          onRetry={() => void performance.refetch()}
        />
      </SectionCard>
    );
  }

  const persistedFailure = latestRunFailure.data
    ? describeBackendFailure(latestRunFailure.data)
    : null;
  const visibleFailure = syncFailure ?? persistedFailure;
  const regressions = data.regressions ?? [];
  const history = data.psi_history ?? [];
  const gsc = data.gsc;
  const copy = webCopy({
    kind: "web-page-performance",
    label: "Page performance",
    description:
      "Canonical per-page Lighthouse, CrUX field, regression, history, and Google Search Console evidence.",
    surface: `Page performance — ${page.url}`,
    data,
    lines: [
      ["URL", page.url],
      ["Regressions", regressions.length],
      ["GSC clicks", gsc.clicks ?? 0],
      ["GSC impressions", gsc.impressions ?? 0],
      [
        "Mobile performance",
        lighthouseScore(data.psi_mobile?.performance_score),
      ],
      [
        "Desktop performance",
        lighthouseScore(data.psi_desktop?.performance_score),
      ],
    ],
    attributes: { page_id: page.id, window_days: gsc.window_days },
  });

  return (
    <SectionCard
      title="Page performance"
      collapsible
      anchor="pagespeed"
      copy={copy}
      headerExtra={
        <div className="flex items-center gap-1">
          {(["mobile", "desktop", "both"] as const).map((strategy) => (
            <button
              key={strategy}
              type="button"
              onClick={() => void runSync(strategy)}
              disabled={syncingStrategy !== null || !canRun}
              className="flex h-6 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] capitalize text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Run PageSpeed test for ${strategy === "both" ? "mobile and desktop" : strategy}`}
            >
              {syncingStrategy === strategy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {strategy}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 p-3">
        {!data.config.psi_has_key ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/35 bg-destructive/5 p-3">
            <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="text-xs font-semibold text-foreground">
                PageSpeed cannot run yet
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The platform PageSpeed API key is missing. This is an operator
                configuration fix; a workspace user cannot repair it here.
              </p>
            </div>
          </div>
        ) : null}

        {syncingStrategy ? (
          <SyncProgress
            strategy={syncingStrategy}
            progress={syncProgress}
            completed={completedTests}
            elapsed={elapsed}
          />
        ) : null}

        {visibleFailure ? (
          <BackendFailureDetails
            failure={visibleFailure}
            label="Last PageSpeed test failed"
          />
        ) : null}

        {regressions.length > 0 ? (
          <div className="rounded-lg border-2 border-destructive/50 bg-destructive/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-semibold text-destructive">
                  Performance regression detected
                </p>
                <ul className="mt-2 space-y-1 text-xs text-foreground">
                  {regressions.map((regression) => (
                    <li
                      key={`${regression.strategy}:${regression.metric}:${regression.current_observed_at}`}
                    >
                      {regressionVerdict(regression)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : data.has_psi_data ? (
          <div className="flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            No meaningful regression detected in the stored PageSpeed history.
          </div>
        ) : null}

        {!data.has_psi_data ? (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border p-6 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Gauge className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-semibold text-foreground">
              No PageSpeed evidence yet
            </p>
            <p className="mt-1 max-w-lg text-xs text-muted-foreground">
              Run one test to measure mobile and desktop Lighthouse scores, lab
              Core Web Vitals, and available real-user field data.
            </p>
            <Button
              className="mt-4"
              size="sm"
              disabled={!canRun || syncingStrategy !== null}
              onClick={() => void runSync("both")}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Run PageSpeed test
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 xl:grid-cols-2">
              {data.psi_mobile ? (
                <StrategyResults sample={data.psi_mobile} />
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border p-5 text-center">
                  <Smartphone className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-xs font-medium text-foreground">
                    No mobile result yet
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    disabled={!canRun || syncingStrategy !== null}
                    onClick={() => void runSync("mobile")}
                  >
                    Run mobile
                  </Button>
                </div>
              )}
              {data.psi_desktop ? (
                <StrategyResults sample={data.psi_desktop} />
              ) : (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-border p-5 text-center">
                  <Monitor className="h-5 w-5 text-muted-foreground" />
                  <p className="mt-2 text-xs font-medium text-foreground">
                    No desktop result yet
                  </p>
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="outline"
                    disabled={!canRun || syncingStrategy !== null}
                    onClick={() => void runSync("desktop")}
                  >
                    Run desktop
                  </Button>
                </div>
              )}
            </div>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Performance score trend
              </h3>
              <PerformanceHistoryChart samples={history} />
            </section>
          </>
        )}

        <section className="rounded-lg border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Google Search Console
              </h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {gsc.window_days}-day page performance · {gsc.start_date} to{" "}
                {gsc.end_date}
              </p>
            </div>
            {data.config.gsc_bound ? (
              <Badge variant="success">Connected</Badge>
            ) : (
              <Badge variant="warning">Needs connection</Badge>
            )}
          </div>

          {!data.config.gsc_bound ? (
            <div className="flex items-start gap-2 p-3">
              <Unplug className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
              <div>
                <p className="text-xs font-medium text-foreground">
                  Search Console is not bound to this site
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.config.gsc_unbound_reason ??
                    "Choose the site's Search Console property to load page search performance."}
                </p>
                <Link
                  href={`${sitePath}/integrations`}
                  className="mt-2 inline-flex text-xs font-medium text-primary hover:underline"
                >
                  Open site integration settings
                </Link>
              </div>
            </div>
          ) : !gsc.has_data ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Search Console is connected, but this page has no daily data in
              the selected window.
            </div>
          ) : (
            <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1.2fr)]">
              <div className="grid grid-cols-2 gap-2">
                <MetricCell
                  label="Clicks"
                  value={(gsc.clicks ?? 0).toLocaleString()}
                  variant="card"
                />
                <MetricCell
                  label="Impressions"
                  value={(gsc.impressions ?? 0).toLocaleString()}
                  variant="card"
                />
                <MetricCell
                  label="CTR"
                  value={
                    gsc.ctr == null ? "—" : `${(gsc.ctr * 100).toFixed(2)}%`
                  }
                  variant="card"
                />
                <MetricCell
                  label="Average position"
                  value={gsc.position == null ? "—" : gsc.position.toFixed(1)}
                  detail="Lower is better"
                  variant="card"
                />
              </div>
              <GscDailySparkline daily={gsc.daily ?? []} />
            </div>
          )}
        </section>
      </div>
    </SectionCard>
  );
}
