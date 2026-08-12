"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CircleGauge, ExternalLink, Play, Radio } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  analysisKeys,
  useSiteAnalysisOverview,
} from "@/features/marketing/data/analysis-hooks";
import {
  OPEN_FINDINGS_ROLLUP_CAP,
  type AnalysisItemRollup,
  type AnalysisWorstPage,
} from "@/features/marketing/data/analysis-service";
import { analyzeSite } from "@/features/marketing/crawler/direct-client";
import { useSiteCommandRun } from "@/features/marketing/data/useSiteCommandRun";
import { SeverityBadge } from "@/features/marketing/components/analysis/AnalysisBadges";
import {
  LoadingSurface,
  MetricCell,
  QueryError,
  SectionCard,
  formatCompactDate,
} from "@/features/marketing/components/shared/MarketingUi";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { humanizeItemKey } from "@/features/marketing/lib/finding-remedies";

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
  // Analysis is a multi-minute pass over every stored page. It streams its own
  // progress into the floating run window and survives a reload — never a
  // spinner on this button.
  const analysis = useSiteCommandRun({
    siteId: site.id,
    mode: "analysis",
    run: (callbacks) => analyzeSite(site.id, callbacks),
    onComplete: async () => {
      // Analysis refreshes scores + findings the whole site subtree reads.
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "site", site.id],
      });
      await queryClient.invalidateQueries({
        queryKey: analysisKeys.site(site.id),
      });
      toast.success("Page analysis complete.");
    },
    onRemoteFailure: (message) =>
      toast.error("Page analysis failed", { description: message }),
  });
  const analyzing = analysis.isActive;

  const runAnalysis = async () => {
    try {
      await analysis.launch();
    } catch (error) {
      toast.error("Page analysis failed", {
        description: extractErrorMessage(error),
      });
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
      onClick={() => (analyzing ? analysis.openWindow() : void runAnalysis())}
    >
      {analyzing ? (
        <Radio className="mr-1.5 h-3.5 w-3.5 text-primary" />
      ) : (
        <Play className="mr-1.5 h-3.5 w-3.5" />
      )}
      {analyzing ? "Watch progress" : "Analyze now"}
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
              detail="Latest analysis run"
            />
          </div>
          <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-border">
            <div className="min-w-0">
              <p className="px-4 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Open findings by check
                {data.rollupTruncated ? (
                  <span className="ml-2 normal-case tracking-normal text-warning">
                    sampled from the {OPEN_FINDINGS_ROLLUP_CAP.toLocaleString()}{" "}
                    most recently detected of{" "}
                    {data.openFindingsTotal.toLocaleString()}
                  </span>
                ) : null}
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
                          {/* Readable name first — a rollup keyed by
                              `ttfb_server_response` is not a UI. An item key
                              the catalogue has not labelled yet (a check the
                              server added since) humanizes rather than
                              disappearing. */}
                          <span className="block truncate text-xs text-foreground">
                            {humanizeItemKey(item.itemKey)}
                          </span>
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {item.itemKey}
                            <span className="capitalize">
                              {" "}
                              · {item.category} / {item.subcategory}
                            </span>
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
                    <li key={page.pageId} className="flex items-center">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-2 text-left hover:bg-muted/50"
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
                      {/* The second door: the live page itself, in a new tab. */}
                      {page.url ? (
                        <a
                          href={page.url}
                          target="_blank"
                          rel="noreferrer"
                          title="Open the live page in a new tab"
                          aria-label="Open the live page in a new tab"
                          className="mr-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
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
