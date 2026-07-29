"use client";

/**
 * features/marketing/content-plan/components/PlanSitesList.tsx
 *
 * The /marketing/content-plan LIST page — the canonical feature-entry list
 * (doctrine: /agents/all). One row per RLS-visible site, enriched with its
 * plan's aggregates (pages planned, status mix, keyword coverage, last
 * activity). Full-row click opens the site's plan workspace; a per-row menu
 * carries every record action (open a specific view, start Setup, jump to
 * the marketing site record). Data is fully client-loaded (sites + one
 * aggregate sweep), so the table runs CONTROLLED over the canonical local
 * engine — every column sorts AND filters against the whole set.
 */
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Columns3,
  ExternalLink,
  LayoutTemplate,
  ListTree,
  Map as MapIcon,
  MoreVertical,
  Plus,
  Table2,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { filterAndSortRows } from "@/components/official/matrx-data-table/filter-engine";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { MarketingSite } from "@/features/marketing/types";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";

import { planStatusColor } from "../constants";
import { countBy, formatUpdated, withCounts } from "../utils";
import { usePlanSiteStats } from "../data/hooks";
import type { PlanSiteStats } from "../data/service";
import { useContentPlanSites } from "./ContentPlanHeader";

/** Bump `version` when a column is added/removed (lib/list-views backfill contract). */
const SURFACE_PREFS: Partial<ListViewPrefs> = {
  version: 1,
  sort: "updated",
  direction: "desc",
  hiddenColumns: [],
};

const COLUMN_LABELS: Record<string, string> = {
  site: "Site",
  brand: "Brand",
  vertical: "Vertical",
  pages: "Pages",
  keywords: "Keywords",
  statuses: "Statuses",
  updated: "Updated",
};

interface PlanSiteRow {
  site: MarketingSite;
  stats: PlanSiteStats | null;
  id: string;
}

/** `web.site.settings.content_plan.vertical` without casting through `any`. */
function planVertical(settings: MarketingSite["settings"]): string | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return null;
  }
  const block = (settings as Record<string, unknown>)["content_plan"];
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const vertical = (block as Record<string, unknown>)["vertical"];
  return typeof vertical === "string" && vertical.length > 0 ? vertical : null;
}




export function PlanSitesList() {
  const router = useRouter();
  const { sites, orgSites } = useContentPlanSites();
  const stats = usePlanSiteStats();

  const { prefs, setPrefs } = useListViewPrefs(
    "content-plan-sites",
    SURFACE_PREFS,
  );
  const [query, setQuery] = useState<MatrxDataTableQueryState>(() => ({
    page: 1,
    pageSize: prefs.pageSize,
    search: "",
    anyOf: "",
    columnFilters: {},
    sort: prefs.sort
      ? { id: prefs.sort, direction: prefs.direction === "desc" ? "desc" : "asc" }
      : null,
  }));

  const statusCategories = useCategories({
    dimension: CATEGORY_DIMENSIONS.planStatus,
  });
  const statusMetaById = useMemo(() => {
    const map = new Map<string, { name: string; slug: string | null }>();
    for (const category of statusCategories.categories) {
      map.set(category.id, { name: category.name, slug: category.slug });
    }
    return map;
  }, [statusCategories.categories]);
  const publishedStatusIds = useMemo(() => {
    const ids = new Set<string>();
    for (const category of statusCategories.categories) {
      if (category.slug === "published" || category.slug === "live-verified") {
        ids.add(category.id);
      }
    }
    return ids;
  }, [statusCategories.categories]);

  const rows = useMemo<PlanSiteRow[]>(() => {
    const bySite = stats.data ?? new Map<string, PlanSiteStats>();
    return orgSites.map((site) => ({
      id: site.id,
      site,
      stats: bySite.get(site.id) ?? null,
    }));
  }, [orgSites, stats.data]);

  const publishedCount = useMemo(
    () => (row: PlanSiteRow) => {
      if (!row.stats) return 0;
      let total = 0;
      for (const [statusId, count] of Object.entries(row.stats.byStatusId)) {
        if (publishedStatusIds.has(statusId)) total += count;
      }
      return total;
    },
    [publishedStatusIds],
  );

  const openWorkspace = useCallback(
    (row: PlanSiteRow, view?: string) => {
      // A site with no plan yet lands on Setup — the "start planning" view;
      // everything else opens the tree.
      const target =
        view ?? ((row.stats?.totalNodes ?? 0) === 0 ? "setup" : "tree");
      router.push(marketingRoutes.contentPlanSite(row.id, target), {
        scroll: false,
      });
    },
    [router],
  );

  const buildRowMenu = (row: PlanSiteRow): ItemMenuConfig => ({
    sections: [
      {
        id: "open",
        items: [
          {
            id: "open-tree",
            label: "Open plan",
            icon: ListTree,
            onSelect: () => openWorkspace(row, "tree"),
          },
          {
            id: "open-table",
            label: "Table",
            icon: Table2,
            onSelect: () => openWorkspace(row, "table"),
          },
          {
            id: "open-map",
            label: "Pillar map",
            icon: MapIcon,
            onSelect: () => openWorkspace(row, "map"),
          },
          {
            id: "open-entities",
            label: "Entities",
            icon: Users,
            onSelect: () => openWorkspace(row, "entities"),
          },
          {
            id: "open-setup",
            label: "Site Setup",
            icon: LayoutTemplate,
            onSelect: () => openWorkspace(row, "setup"),
          },
        ],
      },
      {
        id: "related",
        items: [
          {
            id: "site-record",
            kind: "link",
            label: "Site record (Marketing)",
            icon: ExternalLink,
            href: marketingRoutes.site(row.site.brand_id, row.site.id),
          },
        ],
      },
    ],
  });

  const columns = useMemo<MatrxColumnDef<PlanSiteRow>[]>(() => {
    const brandLabel = (row: PlanSiteRow) =>
      row.site.brand_id ? "Assigned" : "Missing";
    const verticalLabel = (row: PlanSiteRow) =>
      planVertical(row.site.settings) ?? "";

    const brandCounts = countBy(rows, brandLabel);
    const verticalCounts = countBy(rows, verticalLabel);

    return [
      {
        id: "site",
        header: "Site",
        accessorFn: (row) => `${row.site.name ?? ""} ${row.site.domain ?? ""}`,
        filter: "text",
        // Real link (keyboard / SR / cmd-click) — row click stays a mouse
        // convenience (D112).
        href: (row) =>
          marketingRoutes.contentPlanSite(
            row.id,
            (row.stats?.totalNodes ?? 0) === 0 ? "setup" : "tree",
          ),
        cell: (row) => (
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {row.site.name || row.site.domain || row.site.id}
            </span>
            {row.site.domain ? (
              <span className="truncate font-mono text-xs text-muted-foreground">
                {row.site.domain}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "brand",
        header: "Brand",
        accessorFn: brandLabel,
        filter: "select",
        filterOptions: withCounts(
          [
            { value: "Assigned", label: "Assigned" },
            { value: "Missing", label: "Missing" },
          ],
          brandCounts,
        ),
        cell: (row) =>
          row.site.brand_id ? (
            <Badge variant="secondary" className="px-1.5 text-[11px]">
              Assigned
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="px-1.5 text-[11px] text-destructive"
            >
              Missing
            </Badge>
          ),
        width: 100,
      },
      {
        id: "vertical",
        header: "Vertical",
        accessorFn: verticalLabel,
        filter: "select",
        filterOptions: withCounts(
          Array.from(verticalCounts.keys())
            .sort((a, b) => a.localeCompare(b))
            .map((value) => ({ value, label: value })),
          verticalCounts,
        ),
        cell: (row) => {
          const vertical = verticalLabel(row);
          return vertical ? (
            <span className="text-sm text-foreground">{vertical}</span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          );
        },
        width: 120,
      },
      {
        id: "pages",
        header: "Pages",
        accessorFn: (row) => row.stats?.totalNodes ?? 0,
        filter: "number",
        cell: (row) =>
          row.stats ? (
            <span className="text-sm font-medium tabular-nums text-foreground">
              {row.stats.totalNodes}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">No plan</span>
          ),
        width: 80,
        align: "center",
      },
      {
        id: "keywords",
        header: "Keywords",
        accessorFn: (row) => row.stats?.keywordBound ?? 0,
        filter: "number",
        cell: (row) =>
          row.stats && row.stats.totalNodes > 0 ? (
            <span
              className={cn(
                "text-sm tabular-nums",
                row.stats.keywordBound === row.stats.totalNodes
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {row.stats.keywordBound}/{row.stats.totalNodes}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
        width: 100,
        align: "center",
      },
      {
        id: "statuses",
        header: "Statuses",
        // Sort/filter on the published count — "how much of this plan is
        // actually live" is the number that ranks sites meaningfully.
        accessorFn: publishedCount,
        filter: "number",
        cell: (row) => {
          if (!row.stats || row.stats.totalNodes === 0) {
            return <span className="text-sm text-muted-foreground">—</span>;
          }
          const entries = Object.entries(row.stats.byStatusId)
            .filter(([, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4);
          return (
            <span className="flex items-center gap-2">
              {entries.map(([statusId, count]) => {
                const meta = statusId ? statusMetaById.get(statusId) : null;
                return (
                  <span
                    key={statusId || "unset"}
                    className="flex items-center gap-1 text-xs text-muted-foreground"
                    title={meta?.name ?? "No status"}
                  >
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        planStatusColor(meta?.slug),
                      )}
                    />
                    <span className="tabular-nums">{count}</span>
                  </span>
                );
              })}
            </span>
          );
        },
        width: 160,
      },
      {
        id: "updated",
        header: "Updated",
        // ISO string: lexicographic sort IS chronological.
        accessorFn: (row) => row.stats?.lastUpdatedAt ?? "",
        filter: "text",
        cell: (row) => (
          <span className="whitespace-nowrap text-sm text-foreground">
            {formatUpdated(row.stats?.lastUpdatedAt ?? null)}
          </span>
        ),
        width: 100,
      },
      {
        id: "actions",
        header: "",
        accessorFn: () => "",
        sortable: false,
        filter: false,
        // Uncontrolled ItemMenu — controlled open state in column deps forced
        // a whole-table re-filter on every menu open/close (review finding).
        cell: (row) => (
          <ItemMenu config={() => buildRowMenu(row)}>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              aria-label="Row actions"
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </ItemMenu>
        ),
        width: 44,
        align: "center",
      },
    ];
  }, [rows, statusMetaById, publishedCount, openWorkspace]);

  const hiddenColumns = prefs.hiddenColumns ?? [];
  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.includes(column.id ?? "")),
    [columns, hiddenColumns],
  );

  const processed = useMemo(
    () =>
      filterAndSortRows(
        rows,
        visibleColumns,
        query.columnFilters,
        query.sort,
        query.search,
      ),
    [rows, visibleColumns, query.columnFilters, query.sort, query.search],
  );
  const pageRows = useMemo(() => {
    const size = Math.max(1, query.pageSize);
    const start = (Math.max(1, query.page) - 1) * size;
    return processed.slice(start, start + size);
  }, [processed, query.page, query.pageSize]);

  const handleQueryChange = (next: MatrxDataTableQueryState) => {
    setQuery(next);
    const patch: Parameters<typeof setPrefs>[0] = {};
    if (
      (next.sort?.id ?? "") !== (query.sort?.id ?? "") ||
      (next.sort?.direction ?? "") !== (query.sort?.direction ?? "")
    ) {
      patch.sort = next.sort?.id ?? "";
      patch.direction = next.sort?.direction ?? "asc";
    }
    if (next.pageSize !== query.pageSize) patch.pageSize = next.pageSize;
    if (Object.keys(patch).length > 0) setPrefs(patch);
  };

  const toggleColumn = (id: string) => {
    const hiding = !hiddenColumns.includes(id);
    const next = hiding
      ? [...hiddenColumns, id]
      : hiddenColumns.filter((value) => value !== id);
    setPrefs({ hiddenColumns: next });
    if (hiding && (query.columnFilters[id] || query.sort?.id === id)) {
      setQuery((current) => ({
        ...current,
        page: 1,
        columnFilters: { ...current.columnFilters, [id]: undefined },
        sort: current.sort?.id === id ? null : current.sort,
      }));
    }
  };

  if (sites.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        Could not load sites: {extractErrorMessage(sites.error)}
      </div>
    );
  }
  if (stats.isError) {
    return (
      <div className="p-6 text-sm text-destructive">
        Could not load plan stats: {extractErrorMessage(stats.error)}
      </div>
    );
  }

  return (
    <MatrxDataTable<PlanSiteRow>
      data={pageRows}
      columns={visibleColumns}
      getRowId={(row) => row.id}
      isLoading={sites.isLoading || stats.isLoading}
      isFetching={sites.isFetching || stats.isFetching}
      query={{
        mode: "controlled",
        state: query,
        totalItems: processed.length,
        onStateChange: handleQueryChange,
      }}
      detail={{ enabled: false }}
      onRowOpen={(row) => openWorkspace(row)}
      copy={{
        label: "Plan site",
        listLabel: "Plan sites",
        location: "/marketing/content-plan",
        rowKind: "plan_site",
        listKind: "plan_site_list",
        humanRow: (row) =>
          `${row.site.domain ?? row.site.name} — ${row.stats?.totalNodes ?? 0} pages planned`,
        showRow: false,
      }}
      toolbar={{
        searchPlaceholder: "Search site name or domain…",
        actions: (
          <>
            <Button
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs"
              onClick={() => router.push(marketingRoutes.newSite())}
            >
              <Plus className="h-3.5 w-3.5" />
              New site
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2 text-xs"
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">
                  Visible columns
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns
                  .filter((column) => column.id !== "actions")
                  .map((column) => {
                    const id = column.id ?? "";
                    return (
                      <DropdownMenuCheckboxItem
                        key={id}
                        className="text-xs"
                        checked={!hiddenColumns.includes(id)}
                        disabled={id === "site"}
                        onCheckedChange={() => toggleColumn(id)}
                        onSelect={(event) => event.preventDefault()}
                      >
                        {COLUMN_LABELS[id] ?? id}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ),
      }}
      emptyState={{
        title: rows.length === 0 ? "No sites yet" : "No sites match",
        description:
          rows.length === 0
            ? "Create a site in Marketing → Sites, assign it a brand, then plan its content here."
            : "Adjust the search or clear the column filters.",
      }}
      className="p-2"
    />
  );
}
