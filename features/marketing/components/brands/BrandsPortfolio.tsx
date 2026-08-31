"use client";

import { useState } from "react";
import Link from "next/link";
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
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type { ContextMenuExtraItem } from "@/features/context-menu-v3/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RefreshCwTapButton } from "@ai-matrx/tap-target/buttons";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingScope } from "@/features/surfaces/manifests/marketing.manifest";
import { marketingListQuery } from "@/features/marketing/lib/scopes/marketing-hub-scope";
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
  const [clickedRow, setClickedRow] = useState<BrandListRow | null>(null);

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

  const humanBrandRow = (row: BrandListRow): string =>
    humanLines([
      ["Brand", row.name],
      ["Industry", row.industry],
      ["Description", row.description],
      ["Status", row.status],
      ["Websites", row.sites.map((site) => site.domain).join(", ") || "none"],
      ["Social profiles", row.social_count],
      ["Brand assets", row.asset_count],
      ["Business facts", row.fact_count],
      ["Pending review", row.pending_discovered],
      ["Updated", formatCompactDate(row.updated_at)],
    ]);

  const listRows = brands.data?.rows ?? [];

  // Surface scope — assembled at trigger time from the already-loaded
  // portfolio query. Site totals are not loaded on this view, so site_count
  // is honestly omitted.
  const getHubScope = () =>
    createMarketingScope({
      hub_view: "brands",
      list_query: marketingListQuery(table.state),
      ...(typeof brands.data?.total === "number"
        ? { brand_count: brands.data.total }
        : {}),
      ...(listRows.length > 0
        ? {
            visible_brands: listRows.map((row) => ({
              brand_id: row.id,
              name: row.name,
              industry: row.industry,
              description: row.description,
              status: row.status,
              sites: row.sites.map((site) => ({
                site_id: site.id,
                domain: site.domain,
                name: site.name,
                initialized: Boolean(site.initialized_at),
              })),
              social_count: row.social_count,
              asset_count: row.asset_count,
              fact_count: row.fact_count,
              pending_review: row.pending_discovered,
              updated_at: row.updated_at,
            })),
            portfolio_summary: listRows.map((row) => ({
              brand_id: row.id,
              brand: row.name,
              status: row.status,
              sites: row.sites.map((site) => site.domain),
              pending_review: row.pending_discovered,
            })),
          }
        : {}),
    });

  // Right-click: ONE menu for the whole portfolio table, resolved per row
  // via `data-row-id` + STATE. A brand (`web.brand`) renders only here as a
  // list row (a grep for `BrandListRow` across features/ and app/ turns up
  // only this file), so its actions are an inline `extraSections`, not a
  // shared builder.
  const resolveRowContext = (target: HTMLElement | null) => {
    const id = target?.closest("[data-row-id]")?.getAttribute("data-row-id");
    const row = (id && listRows.find((r) => r.id === id)) || null;
    setClickedRow(row);
    if (!row) return null;
    return {
      [CONTEXT_MENU_ENTITY_KEY]: {
        type: "web_brand" as const,
        id: row.id,
        title: row.name,
      },
      content: humanBrandRow(row),
    };
  };
  const brandItems: ContextMenuExtraItem[] = clickedRow
    ? [
        {
          kind: "link",
          id: "brand-open",
          label: "Open brand",
          icon: Landmark,
          href: marketingRoutes.brand(clickedRow.id),
        },
        {
          kind: "item",
          id: "brand-edit",
          label: "Edit brand…",
          icon: Pencil,
          onSelect: () => {
            setEditing(clickedRow);
            setEditorOpen(true);
          },
        },
        {
          kind: "item",
          id: "brand-delete",
          label: "Delete brand",
          icon: Trash2,
          destructive: true,
          onSelect: () => setDeleting(clickedRow),
        },
      ]
    : [];
  const brandSection = {
    id: "brand-portfolio-actions",
    label: "Brand",
    icon: Landmark,
    items: brandItems,
  };

  const columns: MatrxColumnDef<BrandListRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Brand",
      filter: "text",
      cellKind: "text",
      // THE DOOR LAW: the whole-row click is a mouse convenience; the name cell
      // is the real anchor (keyboard, screen reader, cmd/middle-click).
      href: (row) => marketingRoutes.brand(row.id),
      cell: (row) => (
        <div className="flex w-52 min-w-52 max-w-52 items-center gap-2.5">
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
            // Every site named here has an id AND a canonical route — the
            // chips were inert text listing records the user could not reach.
            row.sites.map((site) => (
              <Link
                key={site.id}
                href={marketingRoutes.site(row.id, site.id)}
                title={`Open ${site.domain}`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium text-foreground hover:border-primary/50 hover:bg-muted"
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
      id: "socials",
      accessorKey: "id",
      header: "Socials",
      filter: false,
      sortable: false,
      align: "right",
      className: "max-lg:hidden",
      headerClassName: "max-lg:hidden",
      cell: (row) => (
        <CountPill
          icon={Share2}
          count={row.social_count}
          label="social profiles"
        />
      ),
    },
    {
      id: "assets",
      accessorKey: "id",
      header: "Assets",
      filter: false,
      sortable: false,
      align: "right",
      className: "max-lg:hidden",
      headerClassName: "max-lg:hidden",
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
      className: "max-lg:hidden",
      headerClassName: "max-lg:hidden",
      cell: (row) => (
        <CountPill
          icon={MapPin}
          count={row.fact_count}
          label="business facts"
        />
      ),
    },
    {
      id: "review",
      accessorKey: "id",
      header: "Review",
      filter: false,
      sortable: false,
      className: "max-lg:hidden",
      headerClassName: "max-lg:hidden",
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
      className: "max-lg:hidden",
      headerClassName: "max-lg:hidden",
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.updated_at)}
        </span>
      ),
    },
  ];

  return (
    // Read-only mount, deliberately: no `getWriteHandlers`, so the surface's
    // `site_editor_draft` target is not offered here. The brand editor below
    // writes { name, industry, description }, and `matrx-user/marketing-brand`
    // already ships `brand_identity` over industry/description while declaring
    // the brand NAME human-owned. Adding a second target set over the same
    // fields would be a defect — see the writeTargets block in
    // `features/surfaces/manifests/marketing.manifest.ts`.
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing"
      getScope={getHubScope}
    >
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
            <NonEditableContextMenu
              sourceFeature="marketing"
              contentSource={{ type: "raw" }}
              contextData={{ content: "" }}
              resolveContextOnOpen={resolveRowContext}
              extraSections={clickedRow ? [brandSection] : []}
            >
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
                    aria-label="Add brand"
                    title="Add brand"
                    className="h-11 w-11 shrink-0 gap-1.5 p-0 sm:h-8 sm:w-auto sm:px-3"
                    onClick={openCreate}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Add brand</span>
                  </Button>
                ),
              }}
              copy={{
                label: "Brand",
                listLabel: "Brand portfolio view",
                location: webLocation("Brands portfolio"),
                rowKind: "web-brand",
                listKind: "web-brands-list",
                rowDescription:
                  "One brand row from the Marketing brand portfolio.",
                listDescription:
                  "The brand portfolio rows currently loaded (respecting search, filters, sort, and pagination).",
                humanRow: humanBrandRow,
                rowAttributes: (row) => ({
                  brand_id: row.id,
                  status: row.status,
                }),
                listAttributes: (visible) => ({
                  loaded_brands: visible.length,
                  total_matching: brands.data?.total ?? visible.length,
                }),
              }}
              detail={{ enabled: false }}
              onRowOpen={(row) => router.push(marketingRoutes.brand(row.id))}
              rowActions={(row) => (
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Edit ${row.name}`}
                    title="Edit brand"
                    className="h-11 w-11 text-muted-foreground hover:text-foreground lg:h-5 lg:w-5 lg:min-w-5"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing(row);
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${row.name}`}
                    title="Delete brand"
                    className="h-11 w-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive lg:h-5 lg:w-5 lg:min-w-5"
                    onClick={(event) => {
                      event.stopPropagation();
                      setDeleting(row);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
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
            </NonEditableContextMenu>
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
    </SurfaceRuntimeProvider>
  );
}
