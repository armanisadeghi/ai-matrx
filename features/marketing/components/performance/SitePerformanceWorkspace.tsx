"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Gauge,
  Loader2,
  Monitor,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Progress } from "@/components/ui/progress";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  type SitePerformanceResponse,
  useSitePerformance,
} from "@/features/marketing/data/site-performance";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { syncPagespeed } from "@/features/marketing/pagespeed/data";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ChangePage = NonNullable<SitePerformanceResponse["most_improved"]>[number];

const distributionConfig = {
  count: { label: "Pages" },
  good: { label: "Good", color: "hsl(var(--chart-2))" },
  needsWork: { label: "Needs work", color: "hsl(var(--chart-4))" },
  poor: { label: "Poor", color: "hsl(var(--destructive))" },
} satisfies ChartConfig;

function scoreLabel(score: number | null | undefined): string {
  return score === null || score === undefined
    ? "—"
    : String(Math.round(score * 100));
}

function scoreTone(score: number): string {
  if (score >= 0.9) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function PercentileCard({
  label,
  icon,
  scores,
}: {
  label: string;
  icon: React.ReactNode;
  scores: SitePerformanceResponse["mobile_scores"];
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {label}
        <Badge variant="secondary" className="ml-auto tabular-nums">
          {scores.count ?? 0} tested
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ["p25", scores.p25],
          ["Median", scores.median],
          ["p75", scores.p75],
        ].map(([name, value]) => (
          <div key={name} className="rounded-md bg-muted/35 p-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {name}
            </p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {scoreLabel(typeof value === "number" ? value : null)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChangeList({
  title,
  rows,
  direction,
  brandId,
  siteId,
}: {
  title: string;
  rows: ChangePage[];
  direction: "up" | "down";
  brandId: string | null;
  siteId: string;
}) {
  const Icon = direction === "up" ? TrendingUp : TrendingDown;
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon
          className={cn(
            "h-4 w-4",
            direction === "up" ? "text-emerald-500" : "text-destructive",
          )}
        />
        {title}
      </h3>
      {rows.length ? (
        <div className="mt-2 divide-y divide-border">
          {rows.slice(0, 5).map((row) => (
            <Link
              key={`${row.page_id}-${row.strategy}`}
              href={marketingRoutes.sitePage(brandId, siteId, row.page_id)}
              className="group flex min-w-0 items-center gap-2 py-2 text-xs hover:text-primary"
            >
              <span className="min-w-0 flex-1 truncate" title={row.url}>
                {row.url}
              </span>
              <Badge variant="outline" className="capitalize">
                {row.strategy}
              </Badge>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  direction === "up"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-destructive",
                )}
              >
                {row.delta > 0 ? "+" : ""}
                {Math.round(row.delta * 100)}
              </span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Two tests within this window are needed to show changes.
        </p>
      )}
    </section>
  );
}

export function SitePerformanceWorkspace() {
  const dispatch = useAppDispatch();
  const { site } = useMarketingSite();
  const performance = useSitePerformance(site.id);
  const [testing, setTesting] = useState(false);

  if (performance.isLoading && !performance.data) {
    return <LoadingSurface label="Loading site performance…" />;
  }
  if (performance.isError || !performance.data) {
    return (
      <QueryError
        error={
          performance.error ?? new Error("Site performance is unavailable.")
        }
        onRetry={() => void performance.refetch()}
      />
    );
  }

  const data = performance.data;
  const coverage = data.coverage;
  const distribution = data.mobile_distribution;
  const worstPages = data.worst_pages_with_traffic ?? [];
  const suggested = data.suggested_action;
  const brandId = site.brand_id;
  const chartData = [
    {
      bucket: "Good",
      count: distribution.good ?? 0,
      fill: "var(--color-good)",
    },
    {
      bucket: "Needs work",
      count: distribution.needs_work ?? 0,
      fill: "var(--color-needsWork)",
    },
    {
      bucket: "Poor",
      count: distribution.poor ?? 0,
      fill: "var(--color-poor)",
    },
  ];

  const runFirstTest = async () => {
    if (!suggested || testing) return;
    setTesting(true);
    try {
      await syncPagespeed(
        dispatch,
        suggested.page_id,
        site.organization_id,
        "mobile",
      );
      await performance.refetch();
      toast.success("First performance test complete");
    } catch (error) {
      toast.error("Performance test failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="mx-auto grid max-w-7xl gap-4 pb-8">
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                Testing coverage
              </p>
              <h2 className="mt-1 text-xl font-semibold text-foreground">
                We&apos;ve tested{" "}
                {coverage.pages_ever_measured.toLocaleString()} of{" "}
                {coverage.total_measurable_pages.toLocaleString()} pages
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {coverage.pages_measured_last_30_days.toLocaleString()} tested
                in the last 30 days
                {coverage.estimated_cycles_remaining > 0
                  ? ` · about ${coverage.estimated_cycles_remaining.toLocaleString()} sweep cycles remaining`
                  : " · full coverage reached"}
              </p>
            </div>
            <div className="rounded-lg bg-primary/10 px-3 py-2 text-right">
              <p className="text-2xl font-semibold tabular-nums text-primary">
                {coverage.percent_covered.toFixed(1)}%
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                covered
              </p>
            </div>
          </div>
          <Progress
            value={coverage.percent_covered}
            className="mt-4 h-2.5"
            aria-label={`${coverage.percent_covered.toFixed(1)} percent of measurable pages tested`}
          />
        </section>

        {(distribution.total ?? 0) === 0 ? (
          <section className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center">
            <Gauge className="mx-auto h-9 w-9 text-primary" />
            <h2 className="mt-3 text-lg font-semibold text-foreground">
              Test the first page to establish a baseline
            </h2>
            <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
              We found {coverage.total_measurable_pages.toLocaleString()}{" "}
              measurable pages, but none has a saved mobile performance score
              yet.
            </p>
            {suggested ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button onClick={() => void runFirstTest()} disabled={testing}>
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Zap className="mr-2 h-4 w-4" />
                  )}
                  Test a page now
                </Button>
                <Button variant="outline" asChild>
                  <Link
                    href={marketingRoutes.sitePage(
                      brandId,
                      site.id,
                      suggested.page_id,
                    )}
                  >
                    Open page detail
                  </Link>
                </Button>
              </div>
            ) : (
              <Button variant="outline" asChild className="mt-4">
                <Link href={`${marketingRoutes.site(brandId, site.id)}/pages`}>
                  Review the page inventory
                </Link>
              </Button>
            )}
          </section>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <section className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Mobile score distribution
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Latest saved score for each tested page
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {(distribution.total ?? 0).toLocaleString()} pages
                  </Badge>
                </div>
                <ChartContainer
                  config={distributionConfig}
                  className="mt-3 hidden h-[210px] w-full sm:flex"
                >
                  <BarChart
                    accessibilityLayer
                    data={chartData}
                    margin={{ top: 8, right: 8, bottom: 0, left: -16 }}
                  >
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="bucket" tickLine={false} axisLine={false} />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent hideLabel />}
                    />
                    <Bar dataKey="count" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ChartContainer>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                  <p className="rounded-md bg-emerald-500/10 p-2 text-emerald-700 dark:text-emerald-300">
                    <strong>{distribution.good ?? 0}</strong> good ≥90
                  </p>
                  <p className="rounded-md bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
                    <strong>{distribution.needs_work ?? 0}</strong> needs work
                  </p>
                  <p className="rounded-md bg-destructive/10 p-2 text-destructive">
                    <strong>{distribution.poor ?? 0}</strong> poor &lt;50
                  </p>
                </div>
              </section>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <PercentileCard
                  label="Mobile performance"
                  icon={<Smartphone className="h-4 w-4" />}
                  scores={data.mobile_scores}
                />
                <PercentileCard
                  label="Desktop performance"
                  icon={<Monitor className="h-4 w-4" />}
                  scores={data.desktop_scores}
                />
              </div>
            </div>

            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                    Highest-value fixes
                  </p>
                  <h2 className="mt-1 text-lg font-semibold text-foreground">
                    Fix these pages first
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    The slowest tested pages that already receive real Google
                    Search traffic.
                  </p>
                </div>
                <Badge variant="outline">28-day GSC traffic</Badge>
              </div>
              {worstPages.length ? (
                <div className="divide-y divide-border">
                  {worstPages.map((row, index) => (
                    <Link
                      key={row.page_id}
                      href={marketingRoutes.sitePage(
                        brandId,
                        site.id,
                        row.page_id,
                      )}
                      className="group grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:grid-cols-[2rem_minmax(0,1fr)_5rem_6rem_7rem_auto]"
                    >
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </span>
                      <span
                        className="min-w-0 truncate text-sm font-medium text-foreground group-hover:text-primary"
                        title={row.url}
                      >
                        {row.url}
                      </span>
                      <span
                        className={cn(
                          "text-right text-lg font-semibold tabular-nums",
                          scoreTone(row.performance_score),
                        )}
                      >
                        {scoreLabel(row.performance_score)}
                      </span>
                      <span className="hidden text-right text-xs text-muted-foreground sm:block">
                        <strong className="block text-foreground">
                          {compactNumber(row.gsc_clicks)}
                        </strong>
                        clicks
                      </span>
                      <span className="hidden text-right text-xs text-muted-foreground sm:block">
                        <strong className="block text-foreground">
                          {compactNumber(row.gsc_impressions)}
                        </strong>
                        impressions
                      </span>
                      <ArrowRight className="hidden h-4 w-4 text-muted-foreground group-hover:text-primary sm:block" />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="p-5 text-sm text-muted-foreground">
                  No tested page currently has Search Console clicks or
                  impressions. The list will populate automatically as coverage
                  and GSC evidence overlap.
                </div>
              )}
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChangeList
                title={`Most improved · ${data.window_days} days`}
                rows={data.most_improved ?? []}
                direction="up"
                brandId={brandId}
                siteId={site.id}
              />
              <ChangeList
                title={`Most regressed · ${data.window_days} days`}
                rows={data.most_regressed ?? []}
                direction="down"
                brandId={brandId}
                siteId={site.id}
              />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
