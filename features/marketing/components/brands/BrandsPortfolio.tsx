"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe2, Inbox, Landmark, Plus } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  PlusTapButton,
  RefreshCwTapButton,
} from "@/components/icons/tap-buttons";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useBrands } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { BrandListRow } from "@/features/marketing/types";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { SiteIdentityMark } from "@/features/marketing/components/shared/SiteConnectionChips";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";

export function BrandsPortfolio() {
  const router = useRouter();
  const table = useMarketingTableState({
    defaultSort: { id: "name", direction: "asc" },
  });
  const brands = useBrands(table.queryState);

  const columns: MatrxColumnDef<BrandListRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Brand",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="flex min-w-56 items-center gap-2.5">
          <SiteIdentityMark site={row} size={30} />
          <div className="min-w-0">
            <Link
              href={marketingRoutes.brand(row.id)}
              className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.name}
            </Link>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.website_url || row.description || "—"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "properties",
      accessorKey: "id",
      header: "Properties",
      filter: false,
      sortable: false,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.sites.length === 0 ? (
            <span className="text-xs text-muted-foreground">No properties</span>
          ) : (
            row.sites.map((site) => (
              <Link
                key={site.id}
                href={marketingRoutes.site(site.brand_id, site.id)}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:border-primary/50"
              >
                <Globe2 className="h-3 w-3 text-muted-foreground" />
                {site.domain}
              </Link>
            ))
          )}
        </div>
      ),
    },
    {
      id: "review",
      accessorKey: "id",
      header: "Review",
      filter: false,
      sortable: false,
      cell: (row) =>
        row.pending_discovered ? (
          <Badge variant="warning" className="gap-1 text-[10px]">
            <Inbox className="h-3 w-3" />
            {row.pending_discovered.toLocaleString()} pending
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: "Status",
      filter: "select",
      filterOptions: [
        { value: "active", label: "Active" },
        { value: "paused", label: "Paused" },
        { value: "archived", label: "Archived" },
      ],
      cell: (row) => <StatusBadge value={row.status} />,
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
            Brands
          </h1>
        }
        center={<MarketingWorkspaceNav />}
        right={
          <>
            <RefreshCwTapButton
              ariaLabel="Refresh brands"
              onClick={() => void brands.refetch()}
              disabled={brands.isFetching}
              className={brands.isFetching ? "animate-spin" : undefined}
            />
            <PlusTapButton
              ariaLabel="Add site"
              href={marketingRoutes.newSite()}
            />
          </>
        }
      />
      <main className="flex h-full flex-col gap-2 overflow-hidden bg-textured px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4">
        {brands.isError ? (
          <QueryError
            error={brands.error}
            onRetry={() => void brands.refetch()}
          />
        ) : (
          <div className="min-h-0 flex-1">
            <MatrxDataTable<BrandListRow>
              data={brands.data?.rows ?? []}
              columns={columns}
              getRowId={(row) => row.id}
              isLoading={brands.isLoading}
              isFetching={brands.isFetching}
              query={{
                mode: "controlled",
                state: table.state,
                totalItems: brands.data?.total ?? 0,
                onStateChange: table.onStateChange,
              }}
              toolbar={{
                searchPlaceholder: "Search brand name or website…",
                actions: (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5"
                    onClick={() => router.push(marketingRoutes.newSite())}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add site
                  </Button>
                ),
              }}
              detail={{ enabled: false }}
              onRowOpen={(row) => router.push(marketingRoutes.brand(row.id))}
              emptyState={{
                icon: <Landmark className="h-8 w-8 text-muted-foreground" />,
                title: "No brands yet",
                description:
                  "Add a site — its brand is created automatically and grows into the full profile (socials, assets, facts).",
                action: (
                  <Button
                    size="sm"
                    onClick={() => router.push(marketingRoutes.newSite())}
                  >
                    Add your first site
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
