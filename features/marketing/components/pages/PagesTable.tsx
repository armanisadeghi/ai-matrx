"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileQuestion, RefreshCw, X } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { usePages } from "@/features/marketing/data/hooks";
import {
  PAGE_COVERAGE_FILTERS,
  isPageCoverageFilter,
} from "@/features/marketing/data/service";
import { COVERAGE_FILTER_COPY } from "@/features/marketing/lib/coverage";
import type { PageListRow } from "@/features/marketing/types";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "missing", label: "Missing" },
  { value: "gone", label: "Gone" },
];

const PROVENANCE_OPTIONS = [
  { value: "crawl", label: "Crawl" },
  { value: "gsc", label: "Google Search Console" },
  { value: "sitemap", label: "Sitemap" },
  { value: "manual", label: "Manual" },
];

/** Coverage chips: URL-owned (`?coverage=`) so matrix tiles deep-link here. */
function CoverageChips() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("coverage");
  const active = isPageCoverageFilter(raw) ? raw : null;

  const setCoverage = useCallback(
    (value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set("coverage", value);
      else next.delete("coverage");
      // Coverage changes the result set; return to page 1.
      next.delete("page");
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PAGE_COVERAGE_FILTERS.map((filter) => {
        const isActive = active === filter;
        return (
          <button
            key={filter}
            type="button"
            onClick={() => setCoverage(isActive ? null : filter)}
            title={COVERAGE_FILTER_COPY[filter].description}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {COVERAGE_FILTER_COPY[filter].label}
            {isActive ? <X className="h-3 w-3" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function PagesTable() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { site, sitePath } = useMarketingSite();
  const coverageRaw = searchParams.get("coverage");
  const coverage = isPageCoverageFilter(coverageRaw) ? coverageRaw : null;
  const table = useMarketingTableState({
    defaultSort: { id: "last_seen", direction: "desc" },
  });
  const pages = usePages(site.id, table.queryState, coverage);
  const columns: MatrxColumnDef<PageListRow>[] = [
    {
      id: "path",
      accessorKey: "path",
      header: "Canonical page",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-64 max-w-xl">
          <p className="truncate font-mono text-xs font-medium text-foreground">
            {row.path || "/"}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {row.url}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "State",
      filter: "select",
      filterOptions: STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      id: "provenance",
      accessorKey: "provenance",
      header: "Source",
      filter: "select",
      filterOptions: PROVENANCE_OPTIONS,
      cell: (row) => (
        <span className="text-xs uppercase text-muted-foreground">
          {row.provenance}
        </span>
      ),
    },
    {
      id: "sitemap_count",
      accessorKey: "sitemap_count",
      header: "Sitemaps",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            row.sitemap_count === 0 && "text-muted-foreground",
          )}
        >
          {row.sitemap_count}
        </span>
      ),
    },
    {
      id: "http_status_last",
      accessorKey: "http_status_last",
      header: "HTTP",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.http_status_last ?? "—"}
        </span>
      ),
    },
    {
      id: "last_seen",
      accessorKey: "last_seen",
      header: "Last seen",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.last_seen)}
        </span>
      ),
    },
  ];

  if (pages.isError) {
    return (
      <QueryError error={pages.error} onRetry={() => void pages.refetch()} />
    );
  }

  return (
    <main className="flex h-full flex-col gap-2 overflow-hidden bg-textured p-3 sm:p-4">
      <CoverageChips />
      <div className="min-h-0 flex-1 overflow-hidden">
        <MatrxDataTable<PageListRow>
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
          toolbar={{
            searchPlaceholder: "Search URL, path, or target keyword…",
            actions: (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => void pages.refetch()}
                disabled={pages.isFetching}
              >
                <RefreshCw
                  className={
                    pages.isFetching
                      ? "h-3.5 w-3.5 animate-spin"
                      : "h-3.5 w-3.5"
                  }
                />
                Refresh
              </Button>
            ),
          }}
          detail={{ enabled: false }}
          onRowOpen={(row) => router.push(`${sitePath}/pages/${row.id}`)}
          emptyState={{
            icon: <FileQuestion className="h-8 w-8 text-muted-foreground" />,
            title: coverage
              ? `No pages match “${COVERAGE_FILTER_COPY[coverage].label}”`
              : "No canonical pages",
            description: coverage
              ? COVERAGE_FILTER_COPY[coverage].description
              : "A crawl, sitemap, GSC sync, or manual entry can add URLs to this independent registry.",
          }}
        />
      </div>
    </main>
  );
}
