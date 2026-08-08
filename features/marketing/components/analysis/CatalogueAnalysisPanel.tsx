"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleGauge, Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  analysisKeys,
  useSiteAnalysisOverview,
} from "@/features/marketing/data/analysis-hooks";
import type {
  AnalysisItemRollup,
  AnalysisWorstPage,
} from "@/features/marketing/data/analysis-service";
import { analyzeSite } from "@/features/marketing/crawler/direct-client";
import { SeverityBadge } from "@/features/marketing/components/analysis/AnalysisBadges";
import {
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
  formatCompactDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { webCopy } from "@/features/marketing/lib/copy-payloads";

function scoreTone(score: number | null): "default" | "good" | "warning" | "bad" {
  if (score === null) return "default";
  if (score >= 90) return "good";
  if (score >= 70) return "warning";
  return "bad";
}

function itemFindingsHref(basePath: string, item: AnalysisItemRollup) {
  const params = new URLSearchParams();
  params.set("f_item_key", `text:${item.itemKey}`);
  return `${basePath}/findings?${params.toString()}`;
}

/**
 * The Audit tab's window into the REAL per-page analysis rows the catalogue
 * workers write (`web.analysis_result` → `v_page_score` / `v_site_score`;
 * `web.finding` → the register). Renders honest freshness ("computed at"),
 * an explicit never-analyzed state, and a direct Analyze command — analysis
 * also runs automatically after every full crawl.
 */
export function CatalogueAnalysisPanel() {
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const { site, sitePath } = useMarketingSite();
  const queryClient = useQueryClient();
  const overview = useSiteAnalysisOverview(site.id);
  const [analyzing, setAnalyzing] = useState(false);

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      await analyzeSite(site.id);
      // Analysis refreshes scores + findings the whole site subtree reads.
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "site", site.id],
      });
      await queryClient.invalidateQueries({
        queryKey: analysisKeys.site(site.id),
      });
      toast.success("Page analysis complete.");
    } catch (error) {
      toast.error("Page analysis failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const navigate = (href: string) => {
    if (isNavigating) return;
    startNavigation(() => router.push(href));
  };

  const data = overview.data;
  const copy = data
    ? webCopy({
        kind: "web-site-analysis-overview",
        label: `Catalogue analysis — ${site.domain}`,
        description:
          "Current per-page analysis scores and open findings from the deterministic audit catalogue (web.analysis_result / web.finding).",
        surface: `Site audit — ${site.domain}`,
        data,
        lines: [
          ["Site score", data.siteScore],
          ["Scored pages", data.scoredPages],
          ["Open findings", data.openFindingsTotal],
          ["Last computed", data.lastComputedAt],
        ],
        attributes: { site_id: site.id },
      })
    : undefined;

  const analyzeButton = (
    <Button
      variant="outline"
      size="sm"
      className="h-7"
      onClick={() => void runAnalysis()}
      disabled={analyzing}
    >
      {analyzing ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <Play className="mr-1.5 h-3.5 w-3.5" />
      )}
      {analyzing ? "Analyzing…" : "Analyze now"}
    </Button>
  );

  return (
    <SectionCard
      anchor="catalogue_analysis"
      title="Catalogue analysis"
      headerExtra={analyzeButton}
      copy={copy}
    >
      {overview.isPending ? (
        <LoadingSurface label="Loading analysis scores…" />
      ) : overview.isError ? (
        <QueryError
          error={overview.error}
          onRetry={() => void overview.refetch()}
        />
      ) : data && data.lastComputedAt === null ? (
        <div className="flex flex-col items-start gap-2 p-4">
          <p className="text-xs text-muted-foreground">
            This site has never been analyzed — no `analysis_result` rows
            exist for it yet. Analysis runs automatically after every full
            crawl, or run it now over the stored evidence.
          </p>
          {analyzeButton}
        </div>
      ) : data ? (
        <div className="flex flex-col">
          <div className="grid grid-cols-2 border-b border-border sm:grid-cols-4">
            <MetricCell
              anchor="site_score"
              label="Site score"
              value={data.siteScore ?? "—"}
              tone={scoreTone(data.siteScore)}
              icon={<CircleGauge className="h-3.5 w-3.5" />}
              detail={`${data.scoredPages.toLocaleString()} pages scored`}
            />
            <MetricCell
              label="Open findings"
              value={data.openFindingsTotal}
              tone={data.openFindingsTotal ? "warning" : "good"}
              href={`${sitePath}/findings`}
            />
            <MetricCell
              label="High / critical"
              value={
                (data.openBySeverity.high ?? 0) +
                (data.openBySeverity.critical ?? 0)
              }
              tone={
                (data.openBySeverity.high ?? 0) +
                  (data.openBySeverity.critical ?? 0) >
                0
                  ? "bad"
                  : "good"
              }
              href={`${sitePath}/analysis`}
            />
            <MetricCell
              label="Computed"
              value={formatCompactDate(data.lastComputedAt)}
              detail={
                data.rollupTruncated
                  ? "Finding rollup sampled (capped)"
                  : "Latest analysis run"
              }
            />
          </div>
          <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
            <div className="min-w-0">
              <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Open findings by check
              </p>
              {data.openByItem.length === 0 ? (
                <p className="p-4 text-xs text-success">
                  No open findings — every analyzed check passes.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.openByItem.slice(0, 8).map((item) => (
                    <li key={item.itemKey}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-muted/50"
                        onClick={() =>
                          navigate(itemFindingsHref(sitePath, item))
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[11px] text-foreground">
                            {item.itemKey}
                          </span>
                          <span className="block truncate text-[10px] capitalize text-muted-foreground">
                            {item.category} / {item.subcategory}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <SeverityBadge value={item.worstSeverity} />
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {item.count.toLocaleString()}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="min-w-0">
              <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Lowest-scoring pages
              </p>
              {data.worstPages.length === 0 ? (
                <p className="p-4 text-xs text-muted-foreground">
                  No scored pages yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {data.worstPages.map((page: AnalysisWorstPage) => (
                    <li key={page.pageId}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-muted/50"
                        onClick={() =>
                          navigate(`${sitePath}/pages/${page.pageId}`)
                        }
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[11px] text-foreground">
                            {page.path || page.url || page.pageId}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {page.failCount
                              ? `${page.failCount} failing check(s)`
                              : "No failing checks"}
                          </span>
                        </span>
                        <span
                          className={
                            page.pageScore >= 90
                              ? "text-xs font-medium tabular-nums text-success"
                              : page.pageScore >= 70
                                ? "text-xs font-medium tabular-nums text-warning"
                                : "text-xs font-medium tabular-nums text-destructive"
                          }
                        >
                          {page.pageScore.toFixed(1)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
