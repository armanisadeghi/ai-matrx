"use client";

import { EyeOff, RotateCcw } from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  useDismissedPages,
  useRestorePage,
} from "@/features/marketing/data/hooks";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { parseDismissals } from "@/features/marketing/lib/dismissals";
import type { MarketingPage } from "@/features/marketing/types";
import {
  formatCompactDate,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { PreviouslyDismissedBadge } from "@/features/marketing/components/shared/PreviouslyDismissedBadge";
import { extractErrorMessage } from "@/utils/errors";

const PROVENANCE_OPTIONS = [
  { value: "crawl", label: "Crawl" },
  { value: "gsc", label: "Google Search Console" },
  { value: "sitemap", label: "Sitemap" },
  { value: "manual", label: "Manual" },
];

/**
 * The deliberate "Dismissed" destination (`?scope=dismissed`) — pages the user
 * hid from primary views. Dismissal is not deletion: a future crawl/sitemap/GSC
 * observation revives a row automatically (flagged), and Restore brings one
 * back immediately.
 */
export function DismissedPagesTable() {
  // Dismissed rows deliberately do not open the page workspace — the
  // single-entity fetchers exclude dismissed rows by design.
  const { site } = useMarketingSite();
  const table = useMarketingTableState({
    defaultSort: { id: "dismissed_at", direction: "desc" },
  });
  const pages = useDismissedPages(site.id, table.queryState, true);
  const restoreMutation = useRestorePage(site.id);

  const restore = async (row: MarketingPage) => {
    try {
      await restoreMutation.mutateAsync(row.id);
      toast.success("Page restored", {
        description: `${row.url} is back in the registry.`,
      });
    } catch (error) {
      toast.error("Could not restore page", {
        description: extractErrorMessage(error),
      });
    }
  };

  const columns: MatrxColumnDef<MarketingPage>[] = [
    {
      id: "path",
      accessorKey: "path",
      header: "Canonical page",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-64 max-w-xl">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-mono text-xs font-medium text-foreground">
              {row.path || "/"}
            </p>
            <PreviouslyDismissedBadge metadata={row.metadata} />
          </div>
          <p className="truncate text-[10px] text-muted-foreground">
            {row.url}
          </p>
        </div>
      ),
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
      id: "dismissed_at",
      accessorKey: "deleted_at",
      header: "Dismissed",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.deleted_at)}
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
    <MatrxDataTable<MarketingPage>
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
      toolbar={{ searchPlaceholder: "Search dismissed URLs…" }}
      copy={{
        label: "Dismissed page",
        listLabel: "Dismissed pages",
        location: webLocation(`Dismissed pages — ${site.root_url}`),
        rowKind: "web-page-row",
        listKind: "web-pages-list",
        rowDescription:
          "One canonical page the user dismissed (hidden from primary views).",
        listDescription:
          "Pages the user dismissed from this site's registry. A future crawl, sitemap, or GSC observation revives a row automatically, flagged as previously dismissed.",
        humanRow: (row) =>
          humanLines([
            ["URL", row.url],
            ["Provenance", row.provenance],
            ["Dismissed", formatCompactDate(row.deleted_at)],
            ["Times dismissed before", parseDismissals(row.metadata).length],
            ["Last seen", formatCompactDate(row.last_seen)],
          ]),
        rowAttributes: (row) => ({
          page_id: row.id,
          site_id: site.id,
          dismissed: true,
        }),
        listAttributes: () => ({
          site_id: site.id,
          total_dismissed: pages.data?.total ?? 0,
        }),
      }}
      detail={{ enabled: false }}
      rowActions={(row) => (
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          title="Restore this page to the registry"
          disabled={restoreMutation.isPending}
          onClick={(event) => {
            event.stopPropagation();
            void restore(row);
          }}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restore
        </button>
      )}
      emptyState={{
        icon: <EyeOff className="h-8 w-8 text-muted-foreground" />,
        title: "Nothing dismissed",
        description:
          "Pages you dismiss from the registry appear here. Dismissal hides a page from primary views; the crawler still treats it as observed reality.",
      }}
    />
  );
}
