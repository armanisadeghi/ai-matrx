"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ExternalLink,
  Globe2,
  Plus,
  RefreshCw,
  SearchCheck,
} from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  PlusTapButton,
  RefreshCwTapButton,
} from "@/components/icons/tap-buttons";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useSiteCount, useSites } from "@/features/marketing/data/hooks";
import type { SiteListRow } from "@/features/marketing/types";
import {
  displayScore,
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "error", label: "Error" },
];

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "internal", label: "Organization" },
  { value: "link", label: "Anyone with link" },
  { value: "public", label: "Public" },
];

export function SitesPortfolio() {
  const router = useRouter();
  const table = useMarketingTableState({
    defaultSort: { id: "updated_at", direction: "desc" },
  });
  const sites = useSites(table.queryState);
  const siteCount = useSiteCount();
  const hasFilters =
    Boolean(table.state.search || table.state.anyOf) ||
    Object.values(table.state.columnFilters).some(Boolean);

  const columns: MatrxColumnDef<SiteListRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Site",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="min-w-48">
          <Link
            href={`/marketing/sites/${row.id}`}
            className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.name}
          </Link>
          <p className="truncate text-[11px] text-muted-foreground">
            {row.domain}
          </p>
        </div>
      ),
    },
    {
      id: "domain",
      accessorKey: "domain",
      header: "Domain",
      filter: "text",
      cellKind: "text",
      cell: (row) => <span className="font-mono text-xs">{row.domain}</span>,
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: STATUS_OPTIONS,
      cell: (row) => <StatusBadge value={row.status} />,
    },
    {
      id: "visibility",
      accessorKey: "visibility",
      header: "Access",
      filter: "select",
      filterOptions: VISIBILITY_OPTIONS,
      cell: (row) => (
        <span className="text-xs capitalize">{row.visibility}</span>
      ),
    },
    {
      id: "health_score",
      accessorKey: "health_score",
      header: "Health",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <div className="text-right tabular-nums">
          <span className="text-sm font-semibold">
            {displayScore(row.health_score)}
          </span>
          <span className="ml-1 text-[10px] text-muted-foreground">/ 100</span>
        </div>
      ),
    },
    {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Updated",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.updated_at)}
        </span>
      ),
    },
  ];

  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Marketing Sites
          </h1>
        }
        center={<MarketingWorkspaceNav />}
        right={
          <>
            <RefreshCwTapButton
              ariaLabel="Refresh sites"
              onClick={() => void sites.refetch()}
              disabled={sites.isFetching}
              className={sites.isFetching ? "animate-spin" : undefined}
            />
            <PlusTapButton ariaLabel="Add site" href="/marketing/sites/new" />
          </>
        }
      />
      <main className="flex h-full flex-col gap-2 overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <section className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-primary/25 bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <SearchCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold">
                Seed sites from connected data
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                Set up Google Search Console or organization credentials, then
                bind a property to a managed site.
              </p>
            </div>
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
          >
            <Link href="/marketing/connections">
              Connections <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </section>
        {sites.isError ? (
          <QueryError
            error={sites.error}
            onRetry={() => void sites.refetch()}
          />
        ) : (
          <div className="min-h-0 flex-1">
            <MatrxDataTable<SiteListRow>
              data={sites.data?.rows ?? []}
              columns={columns}
              getRowId={(row) => row.id}
              isLoading={sites.isLoading}
              isFetching={sites.isFetching}
              query={{
                mode: "controlled",
                state: table.state,
                totalItems: sites.data?.total ?? 0,
                onStateChange: table.onStateChange,
              }}
              toolbar={{
                searchPlaceholder: "Search name, domain, or URL…",
                leading:
                  siteCount.data !== undefined ? (
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {siteCount.data.toLocaleString()} managed
                      {hasFilters && sites.data
                        ? ` · ${sites.data.total.toLocaleString()} matching`
                        : ""}
                    </span>
                  ) : undefined,
                actions: (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => router.push("/marketing/sites/new")}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add site
                  </Button>
                ),
              }}
              detail={{ enabled: false }}
              onRowOpen={(row) => router.push(`/marketing/sites/${row.id}`)}
              rowActions={(row) => (
                <a
                  href={row.root_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Open live site"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              emptyState={{
                icon: <Globe2 className="h-8 w-8 text-muted-foreground" />,
                title: hasFilters
                  ? "No sites match your filters"
                  : "No managed sites",
                description: hasFilters
                  ? "Clear the current search and filters to return to the complete site portfolio."
                  : "Add a site to begin building its canonical page registry.",
                action: (
                  <Button
                    size="sm"
                    variant={hasFilters ? "outline" : "default"}
                    onClick={() => {
                      if (hasFilters) {
                        table.onStateChange({
                          ...table.state,
                          page: 1,
                          search: "",
                          anyOf: "",
                          columnFilters: {},
                        });
                      } else {
                        router.push("/marketing/sites/new");
                      }
                    }}
                  >
                    {hasFilters ? "Clear filters" : "Add your first site"}
                  </Button>
                ),
              }}
            />
          </div>
        )}
      </main>
    </>
  );
}

export function SitesPortfolioLoading() {
  return (
    <>
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Marketing Sites
          </h1>
        }
        center={<MarketingWorkspaceNav />}
      />
      <main className="h-full overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-card">
          <div className="h-11 shrink-0 border-b border-border bg-muted/20" />
          <div className="grid h-9 shrink-0 grid-cols-6 gap-3 border-b border-border px-3 py-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="animate-pulse rounded bg-muted" />
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {Array.from({ length: 7 }).map((_, row) => (
              <div
                key={row}
                className="grid h-10 grid-cols-6 gap-3 border-b border-border/60 px-3 py-2.5"
              >
                {Array.from({ length: 6 }).map((__, column) => (
                  <div
                    key={column}
                    className="animate-pulse rounded bg-muted"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
