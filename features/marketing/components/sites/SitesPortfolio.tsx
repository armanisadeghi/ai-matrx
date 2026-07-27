"use client";

import { useState } from "react";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ExternalLink,
  Globe2,
  Pencil,
  Plus,
  SearchCheck,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RefreshCwTapButton } from "@/components/icons/tap-buttons";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createMarketingScope } from "@/features/surfaces/manifests/marketing.manifest";
import { marketingListQuery } from "@/features/marketing/lib/scopes/marketing-hub-scope";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import {
  useDeleteSite,
  useSiteCount,
  useSites,
} from "@/features/marketing/data/hooks";
import { SiteEditorDialog } from "@/features/marketing/components/sites/SiteEditorDialog";
import type { MarketingSite, SiteListRow } from "@/features/marketing/types";
import { extractErrorMessage } from "@/utils/errors";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  SiteConnectionChips,
  SiteIdentityMark,
} from "@/features/marketing/components/shared/SiteConnectionChips";
import { MarketingWorkspaceNav } from "@/features/marketing/components/shared/MarketingWorkspaceNav";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "error", label: "Error" },
];

const VISIBILITY_OPTIONS = [
  { value: "personal", label: "Personal" },
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
  const deleteMutation = useDeleteSite();
  const [editing, setEditing] = useState<MarketingSite | null>(null);
  const [deleting, setDeleting] = useState<MarketingSite | null>(null);

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      toast.success(`Deleted ${deleting.name}`);
      setDeleting(null);
    } catch (error) {
      toast.error("Could not delete site", {
        description: extractErrorMessage(error),
      });
    }
  };

  const hasFilters =
    Boolean(table.state.search || table.state.anyOf) ||
    Object.values(table.state.columnFilters).some(Boolean);

  const siteRowCopy = (row: SiteListRow) =>
    webCopy({
      kind: "web-site",
      label: `Site ${row.domain}`,
      description: "One managed website row from the Marketing sites list.",
      surface: `Sites list — ${row.domain}`,
      data: row,
      lines: [
        ["Site", row.name],
        ["Domain", row.domain],
        ["Root URL", row.root_url],
        ["Description", row.description],
        ["Status", row.status],
        ["Visibility", row.visibility],
        ["Initialized", row.initialized_at ? "yes" : "no"],
        ["Updated", formatCompactDate(row.updated_at)],
      ],
      attributes: { site_id: row.id, brand_id: row.brand_id, status: row.status },
    });

  const listRows = sites.data?.rows ?? [];

  // Surface scope — assembled at trigger time from already-loaded queries.
  // Brand totals and the per-brand portfolio rollup are not loaded on this
  // view, so brand_count and portfolio_summary are honestly omitted.
  const getHubScope = () =>
    createMarketingScope({
      hub_view: "sites",
      list_query: marketingListQuery(table.state),
      ...(typeof siteCount.data === "number"
        ? { site_count: siteCount.data }
        : {}),
      ...(typeof sites.data?.total === "number"
        ? { sites_total: sites.data.total }
        : {}),
      ...(listRows.length > 0
        ? {
            visible_sites: listRows.map((row) => ({
              site_id: row.id,
              brand_id: row.brand_id,
              name: row.name,
              domain: row.domain,
              root_url: row.root_url,
              description: row.description,
              status: row.status,
              visibility: row.visibility,
              initialized: Boolean(row.initialized_at),
              health_score: row.health_score,
              scored_pages: row.scored_pages,
              updated_at: row.updated_at,
            })),
          }
        : {}),
    });

  const sitesListCopy = webCopy({
    kind: "web-sites-list",
    label: "Managed sites",
    description:
      "The flattened all-sites list currently loaded at /marketing/sites (respects active search/filters/page).",
    surface: "Sites list",
    data: listRows,
    lines: [
      ["Sites on this page", listRows.length],
      ["Total matching", sites.data?.total ?? listRows.length],
      ["Total managed", siteCount.data ?? null],
      ...listRows.map(
        (row): [string, string] => [
          row.domain,
          `${row.name} · ${row.status} · ${row.visibility}`,
        ],
      ),
    ],
    attributes: { count: listRows.length, total: sites.data?.total ?? null },
  });

  const columns: MatrxColumnDef<SiteListRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Site",
      filter: "text",
      cellKind: "text",
      cell: (row) => (
        <div className="flex min-w-56 items-center gap-2.5">
          <SiteIdentityMark site={row} size={30} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {row.name}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {row.domain}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "connections",
      accessorKey: "id",
      header: "Connections",
      filter: false,
      sortable: false,
      cell: (row) => <SiteConnectionChips site={row} />,
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      filter: false,
      sortable: false,
      cell: (row) => (
        <span className="block max-w-72 truncate text-xs text-muted-foreground">
          {row.description || "—"}
        </span>
      ),
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
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/marketing"
      getScope={getHubScope}
    >
      <RouteHeader
        left={
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Marketing Sites
          </h1>
        }
        center={<MarketingWorkspaceNav />}
        right={
          <div className="flex items-center gap-1">
            {listRows.length > 0 ? (
              <CopyButtons size="icon" {...sitesListCopy} />
            ) : null}
            <RefreshCwTapButton
              ariaLabel="Refresh sites"
              onClick={() => void sites.refetch()}
              disabled={sites.isFetching}
              className={sites.isFetching ? "animate-spin" : undefined}
            />
          </div>
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
              onRowOpen={(row) => router.push(marketingRoutes.site(row.brand_id, row.id))}
              rowActions={(row) => (
                <div className="flex items-center gap-0.5">
                  <span onClick={(event) => event.stopPropagation()}>
                    <CopyButtons size="icon" {...siteRowCopy(row)} />
                  </span>
                  <a
                    href={row.root_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Open live site"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Edit site"
                    onClick={(event) => {
                      event.stopPropagation();
                      setEditing(row);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    title="Delete site"
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

      <SiteEditorDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        site={editing}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete ${deleting.name}?` : "Delete site?"}
        description="The site moves to trash and disappears from every list. This does not delete the brand."
        variant="destructive"
        confirmLabel="Delete site"
        busy={deleteMutation.isPending}
        onConfirm={() => void confirmDelete()}
      />
    </SurfaceRuntimeProvider>
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
