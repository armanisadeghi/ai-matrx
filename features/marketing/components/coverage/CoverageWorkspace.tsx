"use client";

import Link from "next/link";
import { ArrowUpRight, Grid3x3, SearchCheck } from "lucide-react";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useCoverageMatrix } from "@/features/marketing/data/hooks";
import type {
  PageCoverageFilter,
  PageProvenance,
} from "@/features/marketing/data/service";
import { PAGE_PROVENANCES } from "@/features/marketing/data/service";
import { COVERAGE_FILTER_COPY } from "@/features/marketing/lib/coverage";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

const PROVENANCE_COPY: Record<
  PageProvenance,
  { label: string; description: string }
> = {
  sitemap: { label: "Sitemap", description: "First recorded from a sitemap" },
  crawl: { label: "Crawl", description: "First recorded by a crawl" },
  gsc: {
    label: "Search Console",
    description: "First recorded from GSC data",
  },
  manual: { label: "Manual", description: "Entered by a person" },
};

function CoverageTile({
  label,
  description,
  value,
  href,
  tone = "default",
}: {
  label: string;
  description: string;
  value: number | null;
  href: string;
  tone?: "default" | "attention";
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/30",
        tone === "attention" &&
          value !== null &&
          value > 0 &&
          "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p
        className={cn(
          "mt-0.5 text-xl font-semibold tabular-nums text-foreground",
          tone === "attention" &&
            value !== null &&
            value > 0 &&
            "text-amber-600 dark:text-amber-400",
        )}
      >
        {value === null ? "—" : value.toLocaleString()}
      </p>
      <p className="truncate text-[11px] text-muted-foreground">
        {description}
      </p>
    </Link>
  );
}

export function CoverageWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const matrix = useCoverageMatrix(site.id);

  if (matrix.isLoading) return <LoadingSurface label="Loading coverage…" />;
  if (matrix.isError) {
    return (
      <QueryError error={matrix.error} onRetry={() => void matrix.refetch()} />
    );
  }
  const data = matrix.data ?? null;

  const pagesHref = (coverage?: PageCoverageFilter) =>
    coverage
      ? `${sitePath}/pages?coverage=${coverage}`
      : `${sitePath}/pages`;

  return (
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <header>
          <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Grid3x3 className="h-4 w-4 text-muted-foreground" />
            Coverage
          </h1>
          <p className="text-xs text-muted-foreground">
            Where the evidence sources agree — and disagree — about the
            canonical page registry. Every tile opens the filtered page list.
          </p>
        </header>

        <section className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <CoverageTile
            label="Canonical pages"
            description="Every URL any source recorded"
            value={data?.totalPages ?? null}
            href={pagesHref()}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.in_sitemap.label}
            description={COVERAGE_FILTER_COPY.in_sitemap.description}
            value={data?.inSitemaps ?? null}
            href={pagesHref("in_sitemap")}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.crawled.label}
            description={COVERAGE_FILTER_COPY.crawled.description}
            value={data?.crawled ?? null}
            href={pagesHref("crawled")}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.never_crawled.label}
            description={COVERAGE_FILTER_COPY.never_crawled.description}
            value={data?.neverCrawled ?? null}
            href={pagesHref("never_crawled")}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.sitemap_not_crawled.label}
            description={COVERAGE_FILTER_COPY.sitemap_not_crawled.description}
            value={data?.sitemapNotCrawled ?? null}
            href={pagesHref("sitemap_not_crawled")}
            tone="attention"
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.crawled_no_sitemap.label}
            description={COVERAGE_FILTER_COPY.crawled_no_sitemap.description}
            value={data?.crawledNoSitemap ?? null}
            href={pagesHref("crawled_no_sitemap")}
            tone="attention"
          />
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pages by first source
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PAGE_PROVENANCES.map((provenance) => (
              <CoverageTile
                key={provenance}
                label={PROVENANCE_COPY[provenance].label}
                description={PROVENANCE_COPY[provenance].description}
                value={data?.byProvenance[provenance] ?? null}
                href={`${sitePath}/pages?f_provenance=select:${provenance}`}
              />
            ))}
          </div>
        </section>

        {/* TODO(gsc-sync): once web.gsc_page_stat lands in the generated
            database types, replace this placeholder with real GSC cells (in
            GSC, traffic-but-not-in-sitemap, in-sitemap-but-no-impressions)
            fed by the same getCoverageMatrix service shape. */}
        <section className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-card/50 p-4">
          <SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Search Console coverage — sync not yet available
            </p>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Once GSC synchronization lands, this matrix gains the third
              evidence source: pages Google knows about, pages receiving
              traffic that no sitemap advertises, and advertised pages with no
              impressions.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
