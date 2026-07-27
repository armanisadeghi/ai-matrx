"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ExternalLink, FileQuestion } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingSitemapsScope } from "@/features/surfaces/manifests/marketing-sitemaps.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useSitemap, useSitemapPages } from "@/features/marketing/data/hooks";
import type { SitemapPagesFilter } from "@/features/marketing/data/service";
import type { SitemapPageRow } from "@/features/marketing/types";
import {
  humanLines,
  webCopy,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import {
  formatCompactDate,
  LoadingSurface,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

const FILTERS: Array<{ value: SitemapPagesFilter; label: string }> = [
  { value: "all", label: "All listed" },
  { value: "never_crawled", label: "Never crawled" },
];

export function SitemapDetail({ sitemapId }: { sitemapId: string }) {
  const { site, sitePath } = useMarketingSite();
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const router = useRouter();
  const sitemap = useSitemap(site.id, sitemapId);
  const [filter, setFilter] = useState<SitemapPagesFilter>("all");
  const table = useMarketingTableState({
    defaultSort: { id: "page", direction: "asc" },
  });
  const pages = useSitemapPages(site.id, sitemapId, table.queryState, filter);

  const columns: MatrxColumnDef<SitemapPageRow>[] = [
    {
      id: "page",
      accessorKey: "page_id",
      header: "URL",
      filter: false,
      cell: (row) => (
        <div className="min-w-64 max-w-2xl">
          <p className="truncate font-mono text-xs font-medium text-foreground">
            {row.page.path || "/"}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {row.page.url}
          </p>
        </div>
      ),
    },
    {
      id: "crawled",
      accessorKey: "id",
      header: "Captured",
      filter: false,
      sortable: false,
      cell: (row) =>
        row.page.latest_snapshot_id ? (
          <Badge variant="success" className="text-[10px]">
            Crawled
          </Badge>
        ) : (
          <Badge variant="warning" className="text-[10px]">
            Never crawled
          </Badge>
        ),
    },
    {
      id: "status",
      accessorKey: "id",
      header: "State",
      filter: false,
      sortable: false,
      cell: (row) => <StatusBadge value={row.page.status} />,
    },
    {
      id: "membership",
      accessorKey: "id",
      header: "Sitemaps",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            row.membership_count === 1 ? "text-amber-600 dark:text-amber-500" : "",
          )}
          title={
            row.membership_count === 1
              ? "Only listed in this sitemap"
              : `Listed in ${row.membership_count} sitemaps`
          }
        >
          {row.membership_count}
        </span>
      ),
    },
    {
      id: "lastmod",
      accessorKey: "lastmod",
      header: "Last modified",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {row.lastmod ? formatCompactDate(row.lastmod) : "—"}
        </span>
      ),
    },
  ];

  if (sitemap.isLoading) return <LoadingSurface label="Loading sitemap…" />;
  if (sitemap.isError || !sitemap.data) {
    return (
      <QueryError
        error={sitemap.error ?? new Error("Sitemap not found")}
        onRetry={() => void sitemap.refetch()}
      />
    );
  }

  const doc = sitemap.data;
  /** The surface's `open_sitemap` shape — one document, emitted twice. */
  const openSitemap: Record<string, unknown> = {
    url: doc.url,
    kind: doc.kind,
    http_status: doc.status_code,
    url_count: doc.url_count,
    child_count: doc.child_count,
    is_active: doc.is_active,
    fetch_error: doc.fetch_error,
    last_fetched_at: doc.last_fetched_at,
  };
  const sitemapCopy = webCopy({
    kind: "web-sitemap",
    label: `Sitemap ${doc.url}`,
    description: "One discovered sitemap document for this site.",
    surface: `Sitemap — ${doc.url}`,
    data: doc,
    lines: [
      ["URL", doc.url],
      ["Kind", doc.kind],
      ["URLs listed", doc.url_count],
      ["HTTP", doc.status_code],
      ["Active", doc.is_active ? "yes" : "no"],
      ["Fetch error", doc.fetch_error],
    ],
    attributes: { sitemap_id: doc.id, site_id: site.id, kind: doc.kind },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-sitemaps"
      getScope={() =>
        createMarketingSitemapsScope({
          ...getBaseValues(),
          sitemap_id: sitemapId,
          sitemaps_summary: [openSitemap],
          open_sitemap: openSitemap,
          sitemap_pages: (pages.data?.rows ?? []).map((row) => ({
            page_id: row.page_id,
            path: row.page.path,
            url: row.page.url,
            crawled: Boolean(row.page.latest_snapshot_id),
            status: row.page.status,
            membership_count: row.membership_count,
            lastmod: row.lastmod,
          })),
          sitemap_pages_table_state: {
            total_matching: pages.data?.total ?? 0,
            loaded_rows: pages.data?.rows.length ?? 0,
            page: table.state.page,
            search: table.state.search || null,
            listed_filter: filter,
          },
        })
      }
    >
    <main className="flex h-full flex-col gap-2 overflow-hidden bg-textured p-3 sm:p-4">
      <header className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1"
          onClick={() => router.push(`${sitePath}/sitemaps`)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All sitemaps
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs font-medium text-foreground">
            {sitemap.data.url}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {sitemap.data.url_count?.toLocaleString() ?? "—"} URLs listed
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setFilter(option.value);
                table.onStateChange({ ...table.state, page: 1 });
              }}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                filter === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <CopyButtons size="icon" {...sitemapCopy} />
        <a
          href={sitemap.data.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Open sitemap XML"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </header>

      <div className="min-h-0 flex-1">
        <MatrxDataTable<SitemapPageRow>
          data={pages.data?.rows ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={pages.isLoading}
          isFetching={pages.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: pages.data?.total ?? 0,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search listed URLs…" }}
          copy={{
            label: "Listed page",
            listLabel: "All listed pages",
            location: webLocation(`Sitemap pages — ${doc.url}`),
            rowKind: "web-sitemap-page-row",
            listKind: "web-sitemap-pages-list",
            rowDescription:
              "One canonical page's membership in this sitemap document.",
            listDescription:
              "The currently loaded page-membership rows for this sitemap (respecting the crawled filter, search, sort, and pagination).",
            humanRow: (row) =>
              humanLines([
                ["URL", row.page.url],
                ["State", row.page.status],
                [
                  "Captured",
                  row.page.latest_snapshot_id ? "crawled" : "never crawled",
                ],
                ["Sitemap memberships", row.membership_count],
                ["Last modified", row.lastmod ? formatCompactDate(row.lastmod) : null],
              ]),
            rowAttributes: (row) => ({
              page_id: row.page_id,
              sitemap_id: sitemapId,
              site_id: site.id,
            }),
            listAttributes: () => ({
              sitemap_id: sitemapId,
              site_id: site.id,
              listed_filter: filter,
              total_matching: pages.data?.total ?? 0,
            }),
          }}
          detail={{ enabled: false }}
          onRowOpen={(row) => router.push(`${sitePath}/pages/${row.page_id}`)}
          emptyState={{
            icon: <FileQuestion className="h-8 w-8 text-muted-foreground" />,
            title:
              filter === "never_crawled"
                ? "Everything in this sitemap has been crawled"
                : "No pages recorded from this sitemap",
            description:
              filter === "never_crawled"
                ? "Every URL listed here has at least one snapshot."
                : "Run a sitemap sync to ingest this sitemap's URLs into the canonical registry.",
          }}
        />
      </div>
    </main>
    </SurfaceRuntimeProvider>
  );
}
