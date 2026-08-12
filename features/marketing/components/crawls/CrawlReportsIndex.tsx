"use client";

import Link from "next/link";
import {
  Braces,
  FileText,
  Gauge,
  Heading,
  ImageIcon,
  Languages,
  ListChecks,
  PanelsTopLeft,
  Route,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { CrawlSubnav } from "@/features/marketing/components/crawls/CrawlSubnav";
import {
  LoadingSurface,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useCrawl } from "@/features/marketing/data/hooks";
import {
  CRAWL_REPORTS,
  type CrawlReportKey,
} from "@/features/marketing/lib/crawl-reports";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { CrawlSurfaceProvider } from "@/features/marketing/lib/scopes/crawl-surface";
import { AccessGate } from "@/features/access-gate/components/AccessGate";

const REPORT_ICONS: Record<CrawlReportKey, LucideIcon> = {
  "response-codes": Route,
  "page-titles": PanelsTopLeft,
  "meta-descriptions": FileText,
  headings: Heading,
  canonicals: Tags,
  directives: Languages,
  images: ImageIcon,
  content: ListChecks,
  "structured-data": Braces,
  performance: Gauge,
};

const CATEGORIES = [
  "Crawlability",
  "Metadata",
  "Content",
  "Enhancements",
] as const;

export function CrawlReportsIndex({ crawlId }: { crawlId: string }) {
  const { site, sitePath } = useMarketingSite();
  const crawl = useCrawl(site.id, crawlId);

  if (crawl.isLoading) return <LoadingSurface label="Loading crawl reports…" />;
  if (crawl.isError || !crawl.data) {
    return (
      <AccessGate
        token="web_crawl_session"
        id={crawlId}
        error={crawl.error}
        onRetry={() => void crawl.refetch()}
        fallbackHref={`${sitePath}/crawls`}
        fallbackLabel="All crawls"
      />
    );
  }

  const indexCopy = webCopy({
    kind: "web-crawl-report-catalogue",
    label: "Crawl report catalogue",
    description:
      "The dedicated bulk reports available for this crawl session and the evidence each one presents.",
    surface: `Crawl reports — session ${crawlId}`,
    data: CRAWL_REPORTS,
    lines: CRAWL_REPORTS.map(
      (report) => [report.label, report.description] as [string, string],
    ),
    attributes: { session_id: crawlId, site_id: site.id },
  });

  return (
    <CrawlSurfaceProvider crawlId={crawlId} crawl={crawl.data} view="reports">
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <CrawlSubnav crawl={crawl.data} />
      <section className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-foreground">
              Crawl reports
            </h1>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
              {CRAWL_REPORTS.length} dedicated views
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Bulk technical-SEO evidence organized by subject, without opening
            snapshots one at a time.
          </p>
        </div>
        <CopyButtons size="icon" {...indexCopy} />
      </section>
      <div className="min-h-0 flex-1 overflow-y-auto pb-12">
        <div className="space-y-5">
          {CATEGORIES.map((category) => (
            <section key={category}>
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {CRAWL_REPORTS.filter(
                  (report) => report.category === category,
                ).map((report) => {
                  const Icon = REPORT_ICONS[report.key];
                  const href = marketingRoutes.crawlReport(
                    site.brand_id,
                    site.id,
                    crawlId,
                    report.key,
                  );
                  const reportCopy = webCopy({
                    kind: "web-crawl-report-definition",
                    label: report.label,
                    description: report.description,
                    surface: `Crawl report catalogue — ${report.label}`,
                    data: report,
                    lines: [
                      ["Report", report.label],
                      ["Category", report.category],
                      ["Description", report.description],
                      ["URL", href],
                    ],
                    attributes: {
                      session_id: crawlId,
                      site_id: site.id,
                      report: report.key,
                    },
                  });
                  return (
                    <div
                      key={report.key}
                      className="group flex min-h-28 rounded-lg border border-border bg-card transition-colors hover:border-emerald-500/50 hover:bg-accent/30"
                    >
                      <Link
                        href={href}
                        className="flex min-w-0 flex-1 gap-3 p-3"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
                            {report.label}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                            {report.description}
                          </span>
                        </span>
                      </Link>
                      <CopyButtons
                        size="icon"
                        className="mr-2 mt-2 shrink-0"
                        {...reportCopy}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
    </CrawlSurfaceProvider>
  );
}
