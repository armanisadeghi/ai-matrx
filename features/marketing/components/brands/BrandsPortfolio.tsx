"use client";

import { useState, type ReactNode } from "react";
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
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import type { ContextMenuExtraItem } from "@/features/context-menu-v3/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@ai-matrx/design-system/controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RefreshCwTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
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
import type { MatrxDataTableQueryState } from "@ai-matrx/design-system/data-table/types";
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
      ["Social profiles tracked", row.social_tracked_count],
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
            {row.industry && (
              <p className="truncate text-xs text-muted-foreground">
                {row.industry}
              </p>
            )}
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
            <span className="text-xs text-muted-foreground/60">No website</span>
          ) : (
            // Every site named here has an id AND a canonical route — the
            // chips were inert text listing records the user could not reach.
            row.sites.map((site) => (
              <Link
                key={site.id}
                href={marketingRoutes.site(row.id, site.id)}
                title={`Open ${site.domain}`}
                onClick={(event) => event.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-muted"
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
          label={`social profiles · ${row.social_tracked_count} tracked`}
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
          <Link
            href={marketingRoutes.brandDiscovery(row.id)}
            aria-label={`${row.pending_discovered.toLocaleString()} to review for ${row.name}`}
            title={`${row.pending_discovered.toLocaleString()} to review`}
            onClick={(event) => event.stopPropagation()}
          >
            <Badge variant="warning" className="gap-1 text-xs">
              <Inbox className="h-3 w-3" />
              {row.pending_discovered.toLocaleString()}
            </Badge>
          </Link>
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
          "matrx-touch-targets flex min-h-0 flex-col gap-3 bg-textured",
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

        {brands.isError ? (
          <div className="space-y-2">
            <Button
              icon={<Plus />}
              variant="primary"
              aria-label="Add brand"
              onClick={openCreate}
            >
              Add brand
            </Button>
            <QueryError
              error={brands.error}
              onRetry={() => void brands.refetch()}
            />
          </div>
        ) : (
          <div
            className={cn(
              "min-h-0 space-y-3",
              presentation === "route" && "flex-1",
            )}
          >
            <BrandCardQueryControls
              state={table.state}
              total={brands.data?.total}
              onStateChange={table.onStateChange}
              actions={
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    icon={<LayoutGrid />}
                    type="button"
                    variant={view === "cards" ? "outline" : "quiet"}
                    aria-label="Show brand cards"
                    title="Cards"
                    onClick={() => setView("cards")}
                  />
                  <Button
                    icon={<TableIcon />}
                    type="button"
                    variant={view === "table" ? "outline" : "quiet"}
                    aria-label="Show brand table"
                    title="Table"
                    onClick={() => setView("table")}
                  />
                  <Button
                    icon={<Plus />}
                    variant="primary"
                    className="w-11 sm:w-auto"
                    aria-label="Add brand"
                    onClick={openCreate}
                  >
                    <span className="hidden sm:inline">Add brand</span>
                  </Button>
                </div>
              }
            />
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
                    search: false,
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
                  rowActions={(row) => [...[{ id: "edit", icon: Pencil, label: `Edit ${row.name}`, onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          setEditing(row);
                          setEditorOpen(true);
                        }, variant: "ghost" as const, tooltip: "Edit brand" }], ...[{ id: "delete", icon: Trash2, tone: "destructive" as const, label: `Delete ${row.name}`, onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
                          event.stopPropagation();
                          setDeleting(row);
                        }, variant: "ghost" as const, tooltip: "Delete brand" }]]}
                  emptyState={{
                    icon: (
                      <Landmark className="h-8 w-8 text-muted-foreground" />
                    ),
                    title: "No brands yet",
                    action: (
                      <Button variant="primary" onClick={openCreate}>
                        Add your first brand
                      </Button>
                    ),
                  }}
                />
              ) : (
                <BrandCards
                  rows={listRows}
                  loading={brands.isLoading}
                  onEdit={(row) => {
                    setEditing(row);
                    setEditorOpen(true);
                  }}
                  onDelete={setDeleting}
                />
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
  actions,
  state,
  total,
  onStateChange,
}: {
  actions: ReactNode;
  state: MatrxDataTableQueryState;
  total: number | undefined;
  onStateChange: (next: MatrxDataTableQueryState) => void;
}) {
  const statusFilter = state.columnFilters.status;
  const status =
    statusFilter?.kind === "select"
      ? (statusFilter.values?.[0] ?? statusFilter.value ?? "all")
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
      {actions}
      <Input
        value={state.search}
        onChange={(event) => update({ search: event.target.value, page: 1 })}
        placeholder="Search brand name or website…"
        className="min-w-52 flex-1"
      />
      <Select
        aria-label="Filter brands by status"
        value={status}
        options={[
          { value: "all", label: "All statuses" },
          { value: "active", label: "Active" },
          { value: "paused", label: "Paused" },
          { value: "archived", label: "Archived" },
        ]}
        onValueChange={(value) => {
          const columnFilters = { ...state.columnFilters };
          if (value === "all") delete columnFilters.status;
          else {
            columnFilters.status = { kind: "select", value };
          }
          update({ columnFilters, page: 1 });
        }}
      />
      <Select
        aria-label="Sort brands"
        value={`${state.sort?.id ?? "name"}:${state.sort?.direction ?? "asc"}`}
        options={[
          { value: "name:asc", label: "Name, A–Z" },
          { value: "name:desc", label: "Name, Z–A" },
          { value: "updated_at:desc", label: "Recently updated" },
          { value: "updated_at:asc", label: "Least recently updated" },
        ]}
        onValueChange={(value) => {
          const [id, direction] = value.split(":");
          update({
            sort: { id, direction: direction === "desc" ? "desc" : "asc" },
            page: 1,
          });
        }}
      />
      <Select
        aria-label="Brands per page"
        value={String(state.pageSize)}
        options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} per page` }))}
        onValueChange={(value) => update({ pageSize: Number(value), page: 1 })}
      />
      <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
        {total === undefined ? (
          <span
            // The same width as the shortest count text (min-w on it too): a placeholder wider than the real text wrapped the
            // pager onto a second row, and the whole list jumped up when the count landed (/marketing, CLS 0.047).
            className="h-4 w-[3.5rem] animate-pulse rounded bg-muted"
            aria-label="Loading brands"
          />
        ) : (
          <span className="min-w-[3.5rem] text-right">
            {first}–{last} of {total.toLocaleString()}
          </span>
        )}
        <Button
          icon={<ChevronLeft />}
          type="button"
          variant="quiet"
          aria-label="Previous brand page"
          disabled={state.page <= 1}
          onClick={() => update({ page: state.page - 1 })}
        />
        <Button
          icon={<ChevronRight />}
          type="button"
          variant="quiet"
          aria-label="Next brand page"
          disabled={pageCount === undefined || state.page >= pageCount}
          onClick={() => update({ page: state.page + 1 })}
        />
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
        {/* read-gate-exempt: BrandCards renders only in the parent's non-error branch; a failed brands read shows QueryError there instead */}
        <p className="mt-3 text-sm font-medium text-foreground">
          No brands yet
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
                {row.industry && (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {row.industry}
                  </p>
                )}
              </div>
              <StatusBadge value={row.status} />
            </div>

            <div className="flex min-h-9 flex-wrap gap-1.5">
              {row.sites.length ? (
                row.sites.map((site) => (
                  <Link
                    key={site.id}
                    href={marketingRoutes.site(row.id, site.id)}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-border/70 bg-muted/30 px-2 py-1 text-xs font-medium text-foreground hover:border-primary/50 hover:bg-muted"
                  >
                    <Globe2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{site.domain}</span>
                  </Link>
                ))
              ) : (
                // read-gate-exempt: a field of one loaded brand row (it has no sites), not the answer of a read
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
              <span className="text-xs text-muted-foreground">
                Updated {formatCompactDate(row.updated_at)}
              </span>
              <div className="flex items-center gap-1">
                {row.pending_discovered ? (
                  <Link
                    href={marketingRoutes.brandDiscovery(row.id)}
                    aria-label={`${row.pending_discovered.toLocaleString()} to review for ${row.name}`}
                    title={`${row.pending_discovered.toLocaleString()} to review`}
                  >
                    <Badge variant="warning" className="gap-1 text-xs">
                      <Inbox className="h-3 w-3" />
                      {row.pending_discovered.toLocaleString()}
                    </Badge>
                  </Link>
                ) : null}
                <Button
                  icon={<Pencil />}
                  type="button"
                  variant="quiet"
                  aria-label={`Edit ${row.name}`}
                  onClick={() => onEdit(row)}
                />
                <Button
                  icon={<Trash2 />}
                  type="button"
                  variant="quiet"
                  aria-label={`Delete ${row.name}`}
                  onClick={() => onDelete(row)}
                />
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
    <div className="flex min-w-0 items-center justify-center gap-1 px-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="font-semibold tabular-nums text-foreground">
        {value.toLocaleString()}
      </span>
      <span className="truncate">{label}</span>
    </div>
  );
}
