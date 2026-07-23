"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  FileQuestion,
  Plus,
  RefreshCw,
  Search,
  Share2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingSitePagesScope } from "@/features/surfaces/manifests/marketing-site-pages.manifest";
import { useMarketingSiteSurfaceBase } from "@/features/marketing/lib/scopes/site-surface-base";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { FetchPageButton } from "@/features/marketing/components/pages/FetchPageButton";
import { fetchPageNow } from "@/features/marketing/crawler/direct-client";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  useCreateManualPage,
  useDeletePage,
  usePages,
} from "@/features/marketing/data/hooks";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { normalisePageUrl } from "@/features/marketing/lib/page-url";
import { extractErrorMessage } from "@/utils/errors";
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
/**
 * Three deterministic verdict glyphs per page — SERP metadata, social card,
 * indexability — read from the stored snapshot metrics. Muted dot = the
 * latest snapshot predates metric stamping (re-crawl or backfill fills it).
 */
function PageHealthChips({ row }: { row: PageListRow }) {
  const chip = (
    Icon: typeof Search,
    label: string,
    state: "pass" | "warn" | "fail" | "none",
  ) => (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-4 w-4 items-center justify-center",
        state === "pass" && "text-success",
        state === "warn" && "text-warning",
        state === "fail" && "text-destructive",
        state === "none" && "text-muted-foreground/40",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
  const verdict = row.indexability_verdict;
  return (
    <span className="inline-flex items-center gap-1">
      {chip(
        Search,
        row.serp_ok === null
          ? "SERP metadata: not computed yet"
          : row.serp_ok
            ? "SERP metadata: passes pixel + character limits"
            : "SERP metadata: outside limits",
        row.serp_ok === null ? "none" : row.serp_ok ? "pass" : "warn",
      )}
      {chip(
        Share2,
        row.social_ok === null
          ? "Social card: not computed yet"
          : row.social_ok
            ? "Social card: complete"
            : "Social card: missing title or image",
        row.social_ok === null ? "none" : row.social_ok ? "pass" : "warn",
      )}
      {chip(
        ShieldCheck,
        verdict === null
          ? "Indexability: not computed yet"
          : verdict === "indexable"
            ? "Indexability: indexable"
            : verdict === "check"
              ? "Indexability: needs review"
              : "Indexability: blocked from Google",
        verdict === null
          ? "none"
          : verdict === "indexable"
            ? "pass"
            : verdict === "check"
              ? "warn"
              : "fail",
      )}
    </span>
  );
}

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
  const { getBaseValues } = useMarketingSiteSurfaceBase();
  const coverageRaw = searchParams.get("coverage");
  const coverage = isPageCoverageFilter(coverageRaw) ? coverageRaw : null;
  const table = useMarketingTableState({
    defaultSort: { id: "gsc_clicks_28d", direction: "desc" },
  });
  const pages = usePages(site.id, table.queryState, coverage);
  const createMutation = useCreateManualPage(site.id);
  const deleteMutation = useDeletePage(site.id);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<PageListRow | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success("Page deleted");
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete page", {
        description: extractErrorMessage(error),
      });
    }
  };

  const columns: MatrxColumnDef<PageListRow>[] = [
    {
      id: "path",
      accessorKey: "path",
      header: "Canonical page",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-64 max-w-xl">
          {row.observed_title ? (
            <p className="truncate text-xs font-medium text-foreground">
              {row.observed_title}
            </p>
          ) : (
            <p className="truncate font-mono text-xs font-medium text-foreground">
              {row.path || "/"}
            </p>
          )}
          <p className="truncate text-[10px] text-muted-foreground">
            {row.observed_title ? `${row.path || "/"} · ${row.url}` : row.url}
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
      filter: "number",
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
      id: "word_count",
      accessorKey: "word_count",
      header: "Words",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.word_count === null ? "—" : row.word_count.toLocaleString()}
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
      // Deterministic per-capture verdicts stamped in web.snapshot
      // (seo_metrics + audit_metrics) — SERP metadata, social card,
      // indexability. "·" = no stored metrics for the latest snapshot yet.
      id: "health_score",
      accessorKey: "health_score",
      header: "Health",
      filter: "number",
      cell: (row) => <PageHealthChips row={row} />,
    },
    {
      id: "gsc_clicks_28d",
      accessorKey: "gsc_clicks_28d",
      header: "Clicks 28d",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.gsc_clicks_28d === null
            ? "—"
            : row.gsc_clicks_28d.toLocaleString()}
        </span>
      ),
    },
    {
      id: "gsc_impressions_28d",
      accessorKey: "gsc_impressions_28d",
      header: "Impr 28d",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.gsc_impressions_28d === null
            ? "—"
            : row.gsc_impressions_28d.toLocaleString()}
        </span>
      ),
    },
    {
      id: "gsc_position_28d",
      accessorKey: "gsc_position_28d",
      header: "Pos",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="font-mono text-xs tabular-nums">
          {row.gsc_position_28d === null
            ? "—"
            : row.gsc_position_28d.toFixed(1)}
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
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing-site-pages"
      surfaceLabel="Pages"
      getScope={() =>
        createMarketingSitePagesScope({
          ...getBaseValues(),
          pages_total: pages.data?.total,
          coverage_filter: coverage ?? undefined,
          visible_pages: pages.data?.rows.map((row) => ({
            url: row.url,
            title: row.observed_title,
            serp_ok: row.serp_ok,
            social_ok: row.social_ok,
            indexability_verdict: row.indexability_verdict,
            sitemap_count: row.sitemap_count,
            word_count: row.word_count,
            gsc_clicks_28d: row.gsc_clicks_28d,
            gsc_impressions_28d: row.gsc_impressions_28d,
            gsc_position_28d: row.gsc_position_28d,
          })),
        })
      }
    >
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
              <div className="flex items-center gap-2">
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
                <Button
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setAdding(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add page
                </Button>
              </div>
            ),
          }}
          copy={{
            label: "Page",
            listLabel: "All pages",
            location: webLocation(`Pages — ${site.root_url}`),
            rowKind: "web-page-row",
            listKind: "web-pages-list",
            rowDescription:
              "One canonical page from this site's page registry.",
            listDescription:
              "The currently loaded canonical page rows (respecting search, filters, coverage chip, sort, and pagination).",
            humanRow: (row) =>
              humanLines([
                ["URL", row.url],
                ["Title", row.observed_title],
                ["Status", row.status],
                ["Provenance", row.provenance],
                ["Sitemaps", row.sitemap_count],
                ["Words", row.word_count],
                ["Last HTTP", row.http_status_last],
                ["Clicks 28d", row.gsc_clicks_28d],
                ["Impressions 28d", row.gsc_impressions_28d],
                ["Position 28d", row.gsc_position_28d],
                ["Last seen", formatCompactDate(row.last_seen)],
              ]),
            rowAttributes: (row) => ({
              page_id: row.id,
              site_id: site.id,
              status: row.status,
            }),
            listAttributes: () => ({
              site_id: site.id,
              coverage_filter: coverage,
              total_matching: pages.data?.total ?? 0,
            }),
          }}
          detail={{ enabled: false }}
          onRowOpen={(row) => router.push(`${sitePath}/pages/${row.id}`)}
          rowActions={(row) => (
            <>
              <FetchPageButton
                siteId={site.id}
                url={row.url}
                pageId={row.id}
                size="icon"
              />
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Delete page"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleting(row);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
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

      <TextInputDialog
        open={adding}
        onOpenChange={(open) => !createMutation.isPending && setAdding(open)}
        title="Add page manually"
        description="Registers a canonical page with provenance “manual”. It joins coverage and can be crawled like any discovered page."
        placeholder={`${site.root_url.replace(/\/$/, "")}/pricing`}
        confirmLabel="Add page"
        busy={createMutation.isPending}
        validate={(value) => {
          try {
            normalisePageUrl(value);
            return null;
          } catch (error) {
            return extractErrorMessage(error);
          }
        }}
        onConfirm={async (value) => {
          try {
            await createMutation.mutateAsync({
              siteId: site.id,
              organizationId: site.organization_id,
              url: value,
            });
            toast.success("Page added", {
              description: "Fetching its first capture now…",
            });
            setAdding(false);
            // First capture kicks off immediately — non-blocking so the
            // dialog closes; failures surface via toast + Error Inspector.
            // Normalize first: the dialog accepts scheme-less input, but the
            // scraper's seed validation needs a full URL.
            void fetchPageNow(site.id, normalisePageUrl(value))
              .then(() => {
                void pages.refetch();
                toast.success("Page captured");
              })
              .catch((error: unknown) => {
                toast.error("Could not capture the new page", {
                  description: extractErrorMessage(error),
                });
              });
          } catch (error) {
            toast.error("Could not add page", {
              description: extractErrorMessage(error),
            });
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete page?"
        description={
          deleting
            ? `${deleting.url} moves to trash and leaves the registry. Its snapshots stay in the database. A future crawl, sitemap, or GSC sync that finds the URL again will NOT resurrect it automatically.`
            : ""
        }
        variant="destructive"
        confirmLabel="Delete page"
        busy={deleteMutation.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </main>
    </SurfaceRuntimeProvider>
  );
}
