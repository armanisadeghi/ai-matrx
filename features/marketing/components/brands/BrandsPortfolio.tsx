"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Globe2,
  Images,
  Inbox,
  Landmark,
  LayoutGrid,
  MapPin,
  Pencil,
  Plus,
  Share2,
  Table as TableIcon,
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
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import {
  MetricNavigation,
  type MetricNavigationItem,
} from "@/components/navigation/MetricNavigation";

export type BrandsPortfolioPresentation = "route" | "home";

interface BrandsPortfolioProps {
  presentation?: BrandsPortfolioPresentation;
  navigationItems?: readonly MetricNavigationItem[];
}

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

export function BrandsPortfolio({
  presentation = "route",
  navigationItems,
}: BrandsPortfolioProps) {
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
  const { prefs, setView } = useListViewPrefs("marketing-brand-portfolio", {
    view: presentation === "home" ? "cards" : "table",
  });
  const view = prefs.view === "cards" ? "cards" : "table";

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
  const homeNavigationItems = navigationItems?.map((item) =>
    item.href === marketingRoutes.brands()
      ? {
          ...item,
          value: brands.data?.total,
          state: brands.isError
            ? ("unavailable" as const)
            : brands.isLoading && !brands.data
              ? ("loading" as const)
              : ("ready" as const),
          description: brands.data
            ? "Accessible brands matching the current portfolio query"
            : "Accessible brand count",
        }
      : item,
  );

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
      {presentation === "route" ? (
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
      ) : null}
      <main
        className={cn(
          "flex min-h-0 flex-col gap-3 bg-textured",
          presentation === "route"
            ? "h-full overflow-hidden px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)] sm:px-4"
            : "px-0 pb-1",
        )}
      >
        {presentation === "home" && homeNavigationItems ? (
          <MetricNavigation
            label="Marketing destinations"
            items={homeNavigationItems}
          />
        ) : null}
        <section className="flex items-center justify-between gap-3 px-0.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">
              Client portfolio
            </h2>
            <p className="text-xs text-muted-foreground">
              Open a brand to work across identity, sites, SEO, content, and
              planning.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant={view === "cards" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9"
              aria-label="Show brand cards"
              title="Cards"
              onClick={() => setView("cards")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant={view === "table" ? "secondary" : "ghost"}
              size="icon"
              className="h-9 w-9"
              aria-label="Show brand table"
              title="Table"
              onClick={() => setView("table")}
            >
              <TableIcon className="h-4 w-4" />
            </Button>
            <Button size="sm" className="h-9" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add brand</span>
            </Button>
          </div>
        </section>
        {brands.isError ? (
          <QueryError
            error={brands.error}
            onRetry={() => void brands.refetch()}
          />
        ) : (
          <div className={cn("min-h-0", presentation === "route" && "flex-1")}>
            <NonEditableContextMenu
              sourceFeature="marketing"
              contentSource={{ type: "raw" }}
              contextData={{ content: "" }}
              resolveContextOnOpen={resolveRowContext}
              extraSections={clickedRow ? [brandSection] : []}
            >
              {view === "table" ? (
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
                  onRowOpen={(row) =>
                    router.push(marketingRoutes.brand(row.id))
                  }
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
                    icon: (
                      <Landmark className="h-8 w-8 text-muted-foreground" />
                    ),
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
              ) : (
                <div className="space-y-3">
                  <BrandCardQueryControls
                    state={table.state}
                    total={brands.data?.total}
                    onStateChange={table.onStateChange}
                  />
                  <BrandCards
                    rows={listRows}
                    loading={brands.isLoading}
                    onEdit={(row) => {
                      setEditing(row);
                      setEditorOpen(true);
                    }}
                    onDelete={setDeleting}
                  />
                </div>
              )}
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

function BrandCardQueryControls({
  state,
  total,
  onStateChange,
}: {
  state: MatrxDataTableQueryState;
  total: number | undefined;
  onStateChange: (next: MatrxDataTableQueryState) => void;
}) {
  const statusFilter = state.columnFilters.status;
  const status =
    statusFilter?.kind === "select"
      ? (statusFilter.values?.[0] ?? statusFilter.value)
      : "all";
  const pageCount =
    total === undefined
      ? undefined
      : Math.max(1, Math.ceil(total / state.pageSize));
  const first =
    total === undefined || total === 0
      ? 0
      : (state.page - 1) * state.pageSize + 1;
  const last =
    total === undefined ? 0 : Math.min(state.page * state.pageSize, total);
  const update = (patch: Partial<MatrxDataTableQueryState>) =>
    onStateChange({ ...state, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
      <Input
        value={state.search}
        onChange={(event) => update({ search: event.target.value, page: 1 })}
        placeholder="Search brand name or website…"
        className="h-9 min-w-52 flex-1"
      />
      <label className="sr-only" htmlFor="brand-card-status">
        Filter brands by status
      </label>
      <select
        id="brand-card-status"
        value={status}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        onChange={(event) => {
          const columnFilters = { ...state.columnFilters };
          if (event.target.value === "all") delete columnFilters.status;
          else {
            columnFilters.status = {
              kind: "select",
              value: event.target.value,
            };
          }
          update({ columnFilters, page: 1 });
        }}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="archived">Archived</option>
      </select>
      <label className="sr-only" htmlFor="brand-card-sort">
        Sort brands
      </label>
      <select
        id="brand-card-sort"
        value={`${state.sort?.id ?? "name"}:${state.sort?.direction ?? "asc"}`}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        onChange={(event) => {
          const [id, direction] = event.target.value.split(":");
          update({
            sort: { id, direction: direction === "desc" ? "desc" : "asc" },
            page: 1,
          });
        }}
      >
        <option value="name:asc">Name, A–Z</option>
        <option value="name:desc">Name, Z–A</option>
        <option value="updated_at:desc">Recently updated</option>
        <option value="updated_at:asc">Least recently updated</option>
      </select>
      <label className="sr-only" htmlFor="brand-card-page-size">
        Brands per page
      </label>
      <select
        id="brand-card-page-size"
        value={String(state.pageSize)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        onChange={(event) =>
          update({ pageSize: Number(event.target.value), page: 1 })
        }
      >
        <option value="10">10 per page</option>
        <option value="25">25 per page</option>
        <option value="50">50 per page</option>
        <option value="100">100 per page</option>
      </select>
      <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        {total === undefined ? (
          <span
            className="h-4 w-16 animate-pulse rounded bg-muted"
            aria-label="Loading brands"
          />
        ) : (
          <span>
            {first}–{last} of {total.toLocaleString()}
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Previous brand page"
          disabled={state.page <= 1}
          onClick={() => update({ page: state.page - 1 })}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Next brand page"
          disabled={pageCount === undefined || state.page >= pageCount}
          onClick={() => update({ page: state.page + 1 })}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function BrandCards({
  rows,
  loading,
  onEdit,
  onDelete,
}: {
  rows: BrandListRow[];
  loading: boolean;
  onEdit: (row: BrandListRow) => void;
  onDelete: (row: BrandListRow) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="h-48 animate-pulse rounded-xl border border-border bg-muted/50"
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
        <Landmark className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium text-foreground">
          No brands yet
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a client brand to organize its sites, assets, facts, and marketing
          work.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <Card
          key={row.id}
          data-row-id={row.id}
          className="group relative overflow-hidden border-border bg-card transition-colors hover:border-primary/45 hover:bg-accent/25"
        >
          <div className="absolute inset-x-0 top-0 h-1 bg-primary/65" />
          <div className="space-y-4 p-4 pt-5">
            <div className="flex items-start gap-3">
              <SiteIdentityMark site={row} size={38} />
              <div className="min-w-0 flex-1">
                <Link
                  href={marketingRoutes.brand(row.id)}
                  className="block truncate text-sm font-semibold text-foreground hover:underline"
                >
                  {row.name}
                </Link>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {row.industry || row.description || "No description yet"}
                </p>
              </div>
              <StatusBadge value={row.status} />
            </div>

            <div className="flex min-h-9 flex-wrap gap-1.5">
              {row.sites.length ? (
                row.sites.map((site) => (
                  <Link
                    key={site.id}
                    href={marketingRoutes.site(row.id, site.id)}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground hover:border-primary/50 hover:bg-muted"
                  >
                    <Globe2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{site.domain}</span>
                  </Link>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">
                  No website connected
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-muted/25 py-2">
              <CardDimension
                icon={Share2}
                value={row.social_count}
                label="socials"
              />
              <CardDimension
                icon={Images}
                value={row.asset_count}
                label="assets"
              />
              <CardDimension
                icon={MapPin}
                value={row.fact_count}
                label="facts"
              />
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-border/70 pt-3">
              <span className="text-[11px] text-muted-foreground">
                Updated {formatCompactDate(row.updated_at)}
              </span>
              <div className="flex items-center gap-1">
                {row.pending_discovered ? (
                  <Badge variant="warning" className="gap-1 text-[10px]">
                    <Inbox className="h-3 w-3" />
                    {row.pending_discovered.toLocaleString()}
                  </Badge>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label={`Edit ${row.name}`}
                  onClick={() => onEdit(row)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => onDelete(row)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function CardDimension({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Images;
  value: number;
  label: string;
}) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-1 px-1 text-[11px] text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}
