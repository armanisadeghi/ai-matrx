"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Globe2,
  Images,
  Inbox,
  Landmark,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { useBrands, useDeleteBrand } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { BrandListRow, MarketingBrand } from "@/features/marketing/types";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { SiteIdentityMark } from "@/features/marketing/components/shared/SiteConnectionChips";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";
import { BrandEditorDialog } from "@/features/marketing/components/brands/BrandEditorDialog";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

function CountPill({
  icon: Icon,
  count,
  label,
}: {
  icon: typeof Images;
  count: number;
  label: string;
}) {
  return (
    <span
      title={`${count.toLocaleString()} ${label}`}
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs tabular-nums",
        count ? "text-foreground" : "text-muted-foreground/50",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {count.toLocaleString()}
    </span>
  );
}

export function BrandsPortfolio() {
  const router = useRouter();
  const table = useMarketingTableState({
    defaultSort: { id: "name", direction: "asc" },
  });
  const brands = useBrands(table.queryState);
  const deleteMutation = useDeleteBrand();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<MarketingBrand | null>(null);
  const [deleting, setDeleting] = useState<MarketingBrand | null>(null);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete brand", {
        description: extractErrorMessage(error),
      });
    }
  };

  const columns: MatrxColumnDef<BrandListRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Brand",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="flex min-w-52 items-center gap-2.5">
          <SiteIdentityMark site={row} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.industry || row.description || "No description yet"}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "websites",
      accessorKey: "id",
      header: "Websites",
      filter: false,
      sortable: false,
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-1">
          {row.sites.length === 0 ? (
            <span className="text-xs text-muted-foreground/60">None</span>
          ) : (
            row.sites.map((site) => (
              <span
                key={site.id}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-foreground"
              >
                <Globe2 className="h-3 w-3 text-muted-foreground" />
                {site.domain}
              </span>
            ))
          )}
        </div>
      ),
    },
    {
      id: "socials",
      accessorKey: "id",
      header: "Socials",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <CountPill icon={Share2} count={row.social_count} label="social profiles" />
      ),
    },
    {
      id: "assets",
      accessorKey: "id",
      header: "Assets",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <CountPill icon={Images} count={row.asset_count} label="brand assets" />
      ),
    },
    {
      id: "facts",
      accessorKey: "id",
      header: "Facts",
      filter: false,
      sortable: false,
      align: "right",
      cell: (row) => (
        <CountPill icon={MapPin} count={row.fact_count} label="business facts" />
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
            {row.pending_discovered.toLocaleString()}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground/50">—</span>
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
          <RefreshCwTapButton
            ariaLabel="Refresh brands"
            onClick={() => void brands.refetch()}
            disabled={brands.isFetching}
            className={brands.isFetching ? "animate-spin" : undefined}
          />
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
                  <Button size="sm" className="h-8 gap-1.5" onClick={openCreate}>
                    <Plus className="h-3.5 w-3.5" />
                    Add brand
                  </Button>
                ),
              }}
              detail={{ enabled: false }}
              onRowOpen={(row) => router.push(marketingRoutes.brand(row.id))}
              rowActions={(row) => (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit brand"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing(row);
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete brand"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleting(row);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              emptyState={{
                icon: <Landmark className="h-8 w-8 text-muted-foreground" />,
                title: "No brands yet",
                description:
                  "A brand is the company you manage — websites, social accounts, assets, and facts all attach to it.",
                action: (
                  <Button size="sm" onClick={openCreate}>
                    Add your first brand
                  </Button>
                ),
              }}
            />
          </div>
        )}
      </main>

      <BrandEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        brand={editing}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : "Delete brand?"}
        description="The brand moves to trash. Brands that still own sites can’t be deleted — delete or move their sites first."
        variant="destructive"
        confirmLabel="Delete brand"
        busy={deleteMutation.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
