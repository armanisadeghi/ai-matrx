"use client";

/**
 * features/marketing/content-plan/components/PlanNodesTable.tsx
 *
 * The `table` view of the plan workspace — every planned URL as one
 * MatrxDataTable row. The plan is fully loaded client-side (usePlanNodes),
 * so the table runs in CONTROLLED mode over the canonical local engine
 * (`filterAndSortRows`): every column sorts AND filters against the WHOLE
 * plan, finite columns get real option lists with counts, and full-row click
 * opens the node in the same NodePanel sheet the map view uses. Style
 * (sort, page size, hidden columns) persists via useListViewPrefs
 * ("content-plan-nodes"); search/filters/page are query state and never
 * persist.
 */
import { useMemo, useState } from "react";
import { Columns3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { filterAndSortRows } from "@/components/official/matrx-data-table/filter-engine";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { cn } from "@/lib/utils";

import { NODE_TYPE_LABELS, planStatusColor } from "../constants";
import { countBy, formatUpdated, withCounts } from "../utils";
import type { PlanNodeRow, PlanNodeType } from "../types";

/** Bump `version` when a column is added/removed (lib/list-views backfill contract). */
const SURFACE_PREFS: Partial<ListViewPrefs> = {
  version: 1,
  sort: "route",
  direction: "asc",
  hiddenColumns: ["reviewer"],
};

const COLUMN_LABELS: Record<string, string> = {
  label: "Label",
  route: "Route",
  type: "Type",
  status: "Status",
  priority: "Priority",
  keyword: "Keyword",
  pillar: "Pillar",
  cluster: "Cluster",
  depth: "Depth",
  reviewer: "Reviewer",
  updated: "Updated",
};




export interface PlanNodesTableProps {
  nodes: PlanNodeRow[];
  isLoading: boolean;
  isFetching: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PlanNodesTable({
  nodes,
  isLoading,
  isFetching,
  selectedId,
  onSelect,
}: PlanNodesTableProps) {
  const { prefs, setPrefs } = useListViewPrefs(
    "content-plan-nodes",
    SURFACE_PREFS,
  );

  // Query state (search / filters / page) — session-only, never persisted.
  // Sort and page size SEED from the persisted style prefs and write back.
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

  const columns = useMemo<MatrxColumnDef<PlanNodeRow>[]>(() => {
    const statusName = (row: PlanNodeRow) =>
      row.status_id ? (statusMetaById.get(row.status_id)?.name ?? "") : "";
    const typeLabel = (row: PlanNodeRow) =>
      NODE_TYPE_LABELS[row.node_type as PlanNodeType] ?? row.node_type;

    const typeCounts = countBy(nodes, typeLabel);
    const statusCounts = countBy(nodes, statusName);
    const priorityCounts = countBy(nodes, (row) =>
      row.priority == null ? "" : String(row.priority),
    );
    const keywordCounts = countBy(nodes, (row) =>
      row.primary_keyword_id ? "Bound" : "Missing",
    );
    const pillarCounts = countBy(nodes, (row) => row.pillar_label ?? "");
    const clusterCounts = countBy(nodes, (row) => row.cluster_label ?? "");

    return [
      {
        id: "label",
        accessorKey: "label",
        header: "Label",
        filter: "text",
        cell: (row) => (
          <span className="text-sm font-medium text-foreground">
            {row.label}
          </span>
        ),
      },
      {
        id: "route",
        accessorKey: "route",
        header: "Route",
        filter: "text",
        cell: (row) => (
          <span className="font-mono text-xs text-foreground">
            {row.route ?? "—"}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        accessorFn: typeLabel,
        filter: "select",
        filterOptions: withCounts(
          Object.values(NODE_TYPE_LABELS).map((label) => ({
            value: label,
            label,
          })),
          typeCounts,
        ),
        cell: (row) => (
          <span className="rounded bg-muted px-1.5 py-px text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {typeLabel(row)}
          </span>
        ),
        width: 90,
      },
      {
        id: "status",
        header: "Status",
        accessorFn: statusName,
        filter: "select",
        filterOptions: withCounts(
          // Category list order IS the pipeline order.
          statusCategories.categories.map((category) => ({
            value: category.name,
            label: category.name,
          })),
          statusCounts,
        ),
        cell: (row) => {
          const meta = row.status_id
            ? statusMetaById.get(row.status_id)
            : undefined;
          return (
            <span className="flex items-center gap-1.5 text-sm text-foreground">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  planStatusColor(meta?.slug),
                )}
              />
              {meta?.name ?? "—"}
            </span>
          );
        },
        width: 130,
      },
      {
        id: "priority",
        header: "Priority",
        accessorFn: (row) => row.priority,
        filter: "select",
        filterOptions: withCounts(
          [1, 2, 3].map((priority) => ({
            value: String(priority),
            label: `P${priority}`,
          })),
          priorityCounts,
        ),
        cell: (row) =>
          row.priority == null ? (
            <span className="text-sm text-muted-foreground">—</span>
          ) : (
            <span className="text-sm font-medium tabular-nums text-foreground">
              P{row.priority}
            </span>
          ),
        width: 80,
        align: "center",
      },
      {
        id: "keyword",
        header: "Keyword",
        accessorFn: (row) => (row.primary_keyword_id ? "Bound" : "Missing"),
        filter: "select",
        filterOptions: withCounts(
          [
            { value: "Bound", label: "Bound" },
            { value: "Missing", label: "Missing" },
          ],
          keywordCounts,
        ),
        cell: (row) =>
          row.primary_keyword_id ? (
            <Badge variant="secondary" className="px-1.5 text-[11px]">
              Bound
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="px-1.5 text-[11px] text-muted-foreground"
            >
              Missing
            </Badge>
          ),
        width: 90,
      },
      {
        id: "pillar",
        accessorKey: "pillar_label",
        header: "Pillar",
        filter: "select",
        filterOptions: withCounts(
          Array.from(pillarCounts.keys())
            .sort((a, b) => a.localeCompare(b))
            .map((label) => ({ value: label, label })),
          pillarCounts,
        ),
      },
      {
        id: "cluster",
        accessorKey: "cluster_label",
        header: "Cluster",
        filter: "select",
        filterOptions: withCounts(
          Array.from(clusterCounts.keys())
            .sort((a, b) => a.localeCompare(b))
            .map((label) => ({ value: label, label })),
          clusterCounts,
        ),
      },
      {
        id: "depth",
        accessorKey: "depth",
        header: "Depth",
        filter: "number",
        cell: (row) => (
          <span className="text-sm tabular-nums text-foreground">
            {row.depth ?? "—"}
          </span>
        ),
        width: 70,
        align: "center",
      },
      {
        id: "reviewer",
        header: "Reviewer",
        accessorFn: (row) => row.needs_reviewer === true,
        filter: "boolean",
        cell: (row) =>
          row.needs_reviewer === true ? (
            <Badge variant="outline" className="px-1.5 text-[11px]">
              Needed
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          ),
        width: 90,
      },
      {
        id: "updated",
        header: "Updated",
        // ISO string: lexicographic sort IS chronological; text filter
        // matches date fragments like "2026-07".
        accessorFn: (row) => row.updated_at,
        filter: "text",
        cell: (row) => (
          <span className="whitespace-nowrap text-sm text-foreground">
            {formatUpdated(row.updated_at)}
          </span>
        ),
        width: 100,
      },
    ];
  }, [nodes, statusCategories.categories, statusMetaById]);

  const hiddenColumns = prefs.hiddenColumns ?? [];
  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.includes(column.id ?? "")),
    [columns, hiddenColumns],
  );

  // The canonical local engine over the FULL plan; the table only paginates.
  const processed = useMemo(
    () =>
      filterAndSortRows(
        nodes,
        visibleColumns,
        query.columnFilters,
        query.sort,
        query.search,
      ),
    [nodes, visibleColumns, query.columnFilters, query.sort, query.search],
  );
  const pageRows = useMemo(() => {
    const size = Math.max(1, query.pageSize);
    const start = (Math.max(1, query.page) - 1) * size;
    return processed.slice(start, start + size);
  }, [processed, query.page, query.pageSize]);

  const handleQueryChange = (next: MatrxDataTableQueryState) => {
    setQuery(next);
    // Sort + page size are STYLE — persist them. Everything else is query.
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
    // A hidden column's filter/sort would keep "counting" in the toolbar
    // while doing nothing — drop them with the column.
    if (hiding && (query.columnFilters[id] || query.sort?.id === id)) {
      setQuery((current) => ({
        ...current,
        page: 1,
        columnFilters: { ...current.columnFilters, [id]: undefined },
        sort: current.sort?.id === id ? null : current.sort,
      }));
    }
  };

  return (
    <MatrxDataTable<PlanNodeRow>
      data={pageRows}
      columns={visibleColumns}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      isFetching={isFetching}
      query={{
        mode: "controlled",
        state: query,
        totalItems: processed.length,
        onStateChange: handleQueryChange,
      }}
      selectedId={selectedId}
      // Full-row click opens the SAME NodePanel (right sheet, wired by the
      // workbench) — the built-in inspector panel/window stay off so there is
      // exactly one detail surface.
      detail={{ enabled: false }}
      onRowOpen={(row) => onSelect(row.id)}
      copy={{
        label: "Plan node",
        listLabel: "Plan nodes",
        location: "/marketing/content-plan/[siteId]?view=table",
        rowKind: "plan_node",
        listKind: "plan_node_list",
        humanRow: (row) =>
          `${row.label} — ${row.route ?? "(no route)"} [${row.node_type}]`,
        showRow: false,
      }}
      toolbar={{
        searchPlaceholder: "Search label, route, keyword…",
        actions: (
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
              {columns.map((column) => {
                const id = column.id ?? "";
                return (
                  <DropdownMenuCheckboxItem
                    key={id}
                    className="text-xs"
                    checked={!hiddenColumns.includes(id)}
                    // Label stays orientable even with every column off.
                    disabled={id === "label"}
                    onCheckedChange={() => toggleColumn(id)}
                    onSelect={(event) => event.preventDefault()}
                  >
                    {COLUMN_LABELS[id] ?? id}
                  </DropdownMenuCheckboxItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      }}
      emptyState={{
        title: nodes.length === 0 ? "No plan yet" : "No pages match",
        description:
          nodes.length === 0
            ? "Add a root node in the tree view — agents can fill in the bulk."
            : "Adjust the search or clear the column filters.",
      }}
      className="p-2"
    />
  );
}
