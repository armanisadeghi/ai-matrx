"use client";

import Link from "next/link";
import { ArrowUpRight, Grid3x3, SearchCheck } from "lucide-react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingCoverageScope } from "@/features/surfaces/manifests/marketing-coverage.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useCoverageMatrix } from "@/features/marketing/data/hooks";
import type {
  PageCoverageFilter,
  PageProvenance,
  SiteCoverageMatrix,
} from "@/features/marketing/data/service";
import { PAGE_PROVENANCES } from "@/features/marketing/data/service";
import { COVERAGE_FILTER_COPY } from "@/features/marketing/lib/coverage";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import type {
  AgentCopyGroomerConfig,
  AgentCopyGroomerSection,
} from "@/components/agent-copy/groomer-types";
import { humanCoverageTile } from "@/features/marketing/components/coverage/format";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

/**
 * Every coverage cell rendered as a tile, paired with the matrix field it
 * counts. ONE list so the tiles, the surface `coverage_filters` value, and the
 * pages-table destinations can never drift apart.
 */
const COVERAGE_TILE_FILTERS: ReadonlyArray<{
  filter: PageCoverageFilter;
  count: (matrix: SiteCoverageMatrix) => number;
}> = [
  { filter: "in_sitemap", count: (m) => m.inSitemaps },
  { filter: "crawled", count: (m) => m.crawled },
  { filter: "never_crawled", count: (m) => m.neverCrawled },
  { filter: "sitemap_not_crawled", count: (m) => m.sitemapNotCrawled },
  { filter: "crawled_no_sitemap", count: (m) => m.crawledNoSitemap },
  { filter: "in_gsc", count: (m) => m.inGsc },
  { filter: "gsc_no_sitemap", count: (m) => m.gscNoSitemap },
  { filter: "sitemap_no_gsc", count: (m) => m.sitemapNoGsc },
];

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
  siteDomain,
  location,
  anchor,
}: {
  label: string;
  description: string;
  value: number | null;
  href: string;
  tone?: "default" | "attention";
  siteDomain: string;
  location: string;
  /** Declared surface value name this tile renders — powers Locate. */
  anchor?: string;
}) {
  return (
    <div
      data-surface-value={anchor}
      className={cn(
        "group/tile relative min-w-0 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted/30",
        tone === "attention" &&
          value !== null &&
          value > 0 &&
          "border-amber-500/40 bg-amber-500/5",
      )}
    >
      <Link href={href} className="block">
        <div className="flex items-start justify-between gap-2 pr-5">
          <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <ArrowUpRight className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/tile:opacity-100" />
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
      <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/tile:opacity-100">
        <CopyButtons
          size="xs"
          label={label}
          human={() => humanCoverageTile(label, value, description, siteDomain)}
          agent={() => ({
            kind: "coverage-tile",
            location,
            description: `The "${label}" page-coverage tile for ${siteDomain}.`,
            data: { metric: label, value: value ?? null, description },
            summary: humanCoverageTile(label, value, description, siteDomain),
            attributes: { metric: label },
          })}
        />
      </div>
    </div>
  );
}

export function CoverageWorkspace() {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
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

  const matrixCopy = webCopy({
    kind: "web-coverage-matrix",
    label: "Coverage matrix",
    description:
      "The full source-disagreement coverage matrix over this site's canonical page registry: sitemap/crawl agreement, first-source provenance counts, and Google Search coverage.",
    surface: `Coverage — ${site.root_url}`,
    data: {
      matrix: data,
      gscSyncedAt: site.gsc_synced_at,
    },
    lines: [
      ["Site", site.root_url],
      ["Canonical pages", data?.totalPages ?? null],
      [COVERAGE_FILTER_COPY.in_sitemap.label, data?.inSitemaps ?? null],
      [COVERAGE_FILTER_COPY.crawled.label, data?.crawled ?? null],
      [COVERAGE_FILTER_COPY.never_crawled.label, data?.neverCrawled ?? null],
      [
        COVERAGE_FILTER_COPY.sitemap_not_crawled.label,
        data?.sitemapNotCrawled ?? null,
      ],
      [
        COVERAGE_FILTER_COPY.crawled_no_sitemap.label,
        data?.crawledNoSitemap ?? null,
      ],
      ...PAGE_PROVENANCES.map(
        (provenance): [string, number | null] => [
          `First source: ${PROVENANCE_COPY[provenance].label}`,
          data?.byProvenance[provenance] ?? null,
        ],
      ),
      [
        "GSC last synced",
        site.gsc_synced_at
          ? formatCompactDate(site.gsc_synced_at)
          : "never",
      ],
      [COVERAGE_FILTER_COPY.in_gsc.label, data?.inGsc ?? null],
      [COVERAGE_FILTER_COPY.gsc_no_sitemap.label, data?.gscNoSitemap ?? null],
      [COVERAGE_FILTER_COPY.sitemap_no_gsc.label, data?.sitemapNoGsc ?? null],
    ],
    attributes: { site_id: site.id },
  });

  const pageLocation = `Marketing — Coverage for ${site.domain}`;

  const groomerSections = (): AgentCopyGroomerSection[] => [
    {
      id: "matrix",
      title: "Coverage matrix",
      description: "Sitemap/crawl/GSC agreement counts for the canonical page registry.",
      build: () => (data ? { ...data, gsc_synced_at: site.gsc_synced_at } : null),
    },
  ];

  const groomerConfig = (): AgentCopyGroomerConfig => ({
    label: `Coverage — ${site.domain}`,
    kind: "marketing-coverage-page",
    location: pageLocation,
    description: `The full page-coverage matrix for ${site.domain}.`,
    attributes: { site_id: site.id, domain: site.domain },
    summary: matrixCopy.human(),
    sections: groomerSections(),
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-coverage"
      getScope={() =>
        createMarketingCoverageScope({
          ...getBaseValues(),
          coverage_matrix: data ? { ...data } : undefined,
          total_pages: data?.totalPages,
          in_sitemaps: data?.inSitemaps,
          crawled: data?.crawled,
          never_crawled: data?.neverCrawled,
          sitemap_not_crawled: data?.sitemapNotCrawled,
          crawled_no_sitemap: data?.crawledNoSitemap,
          pages_by_provenance: data ? { ...data.byProvenance } : undefined,
          gsc_synced: Boolean(site.gsc_synced_at),
          in_gsc: data?.inGsc,
          gsc_no_sitemap: data?.gscNoSitemap,
          sitemap_no_gsc: data?.sitemapNoGsc,
          coverage_filters: data
            ? COVERAGE_TILE_FILTERS.map((tile) => ({
                filter: tile.filter,
                label: COVERAGE_FILTER_COPY[tile.filter].label,
                description: COVERAGE_FILTER_COPY[tile.filter].description,
                count: tile.count(data),
                pages_url: pagesHref(tile.filter),
              }))
            : undefined,
        })
      }
    >
    <main className="h-full overflow-y-auto bg-textured p-3 sm:p-4">
      <div className="grid w-full gap-3">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Grid3x3 className="h-4 w-4 text-muted-foreground" />
              Coverage
            </h1>
            <p className="text-xs text-muted-foreground">
              Where the evidence sources agree — and disagree — about the
              canonical page registry. Every tile opens the filtered page list.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <CopyButtons
              size="icon"
              label={matrixCopy.label}
              human={matrixCopy.human}
              json={() => data}
              agent={matrixCopy.agent}
            />
            <ExportMenu
              label={`coverage-matrix-${site.domain}`}
              items={[jsonExportItem(() => data, "Matrix (.json)")]}
            />
            <AgentCopyGroomerLauncher config={groomerConfig} />
          </div>
        </header>

        <section
          data-surface-value="coverage_filters"
          className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6"
        >
          <CoverageTile
            label="Canonical pages"
            description="Every URL any source recorded"
            value={data?.totalPages ?? null}
            href={pagesHref()}
            anchor="total_pages"
            siteDomain={site.domain}
            location={pageLocation}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.in_sitemap.label}
            description={COVERAGE_FILTER_COPY.in_sitemap.description}
            value={data?.inSitemaps ?? null}
            href={pagesHref("in_sitemap")}
            anchor="in_sitemaps"
            siteDomain={site.domain}
            location={pageLocation}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.crawled.label}
            description={COVERAGE_FILTER_COPY.crawled.description}
            value={data?.crawled ?? null}
            href={pagesHref("crawled")}
            anchor="crawled"
            siteDomain={site.domain}
            location={pageLocation}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.never_crawled.label}
            description={COVERAGE_FILTER_COPY.never_crawled.description}
            value={data?.neverCrawled ?? null}
            href={pagesHref("never_crawled")}
            anchor="never_crawled"
            siteDomain={site.domain}
            location={pageLocation}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.sitemap_not_crawled.label}
            description={COVERAGE_FILTER_COPY.sitemap_not_crawled.description}
            value={data?.sitemapNotCrawled ?? null}
            href={pagesHref("sitemap_not_crawled")}
            anchor="sitemap_not_crawled"
            tone="attention"
            siteDomain={site.domain}
            location={pageLocation}
          />
          <CoverageTile
            label={COVERAGE_FILTER_COPY.crawled_no_sitemap.label}
            description={COVERAGE_FILTER_COPY.crawled_no_sitemap.description}
            value={data?.crawledNoSitemap ?? null}
            href={pagesHref("crawled_no_sitemap")}
            anchor="crawled_no_sitemap"
            tone="attention"
            siteDomain={site.domain}
            location={pageLocation}
          />
        </section>

        <section data-surface-value="pages_by_provenance" className="grid gap-2">
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
                siteDomain={site.domain}
                location={pageLocation}
              />
            ))}
          </div>
        </section>

        <section data-surface-value="gsc_synced" className="grid gap-2">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <SearchCheck className="h-3.5 w-3.5" />
            Google Search coverage
            {site.gsc_synced_at ? (
              <span className="font-normal normal-case tracking-normal">
                · last synced {formatCompactDate(site.gsc_synced_at)}
              </span>
            ) : null}
          </h2>
          {site.gsc_synced_at ? (
            <div className="grid gap-2 sm:grid-cols-3">
              <CoverageTile
                label={COVERAGE_FILTER_COPY.in_gsc.label}
                description={COVERAGE_FILTER_COPY.in_gsc.description}
                value={data?.inGsc ?? null}
                href={pagesHref("in_gsc")}
                anchor="in_gsc"
                siteDomain={site.domain}
                location={pageLocation}
              />
              <CoverageTile
                label={COVERAGE_FILTER_COPY.gsc_no_sitemap.label}
                description={COVERAGE_FILTER_COPY.gsc_no_sitemap.description}
                value={data?.gscNoSitemap ?? null}
                href={pagesHref("gsc_no_sitemap")}
                anchor="gsc_no_sitemap"
                tone="attention"
                siteDomain={site.domain}
                location={pageLocation}
              />
              <CoverageTile
                label={COVERAGE_FILTER_COPY.sitemap_no_gsc.label}
                description={COVERAGE_FILTER_COPY.sitemap_no_gsc.description}
                value={data?.sitemapNoGsc ?? null}
                href={pagesHref("sitemap_no_gsc")}
                anchor="sitemap_no_gsc"
                tone="attention"
                siteDomain={site.domain}
                location={pageLocation}
              />
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-card/50 p-4">
              <SearchCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Search Console has never been synced for this site
                </p>
                <p className="mt-1 max-w-xl text-xs text-muted-foreground">
                  Connect Search Console and run a sync from the Integrations
                  workspace to add Google's evidence to this matrix: pages
                  Google serves, traffic no sitemap advertises, and advertised
                  pages Google never reports.
                </p>
                <Link
                  href={`${sitePath}/integrations`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary"
                >
                  Open Integrations
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
    </SurfaceRuntimeProvider>
  );
}
