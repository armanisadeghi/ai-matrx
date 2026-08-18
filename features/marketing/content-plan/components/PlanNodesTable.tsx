"use client";

/**
 * features/marketing/content-plan/components/PlanNodesTable.tsx
 *
 * The `table` view of the plan workspace — every planned URL as one
 * MatrxDataTable row. The plan is fully loaded client-side (usePlanNodes),
 * so the table runs in CONTROLLED mode over the canonical local engine
 * (`filterAndSortRows`): every column sorts AND filters against the WHOLE
 * plan, finite columns get real option lists with counts, and full-row click
 * opens the node in a WindowPanel. The row's panel action switches the same
 * canonical NodePanel into the adjustable SidePanelSurface. Style
 * (sort, page size, hidden columns) persists via useListViewPrefs
 * ("content-plan-nodes"); search/filters/page are query state and never
 * persist.
 */
import { useMemo, useState, type ReactNode } from "react";
import { Columns3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cmsPageEditorHref } from "@/features/cms/utils/cmsRoutes";
import type { PageSearchPerformance } from "@/features/marketing/types";
import { NodeMeasureDoor } from "./NodeMeasureDoor";
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
import {
  keyFieldsAiVariant,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { CATEGORY_DIMENSIONS } from "@/features/scopes/categoryDimensions";
import { useCategories } from "@/features/scopes/hooks/useCategories";
import { useListViewPrefs } from "@/lib/list-views/useListViewPrefs";
import type { ListViewPrefs } from "@/lib/redux/preferences/userPreferencesSlice";
import { cn } from "@/lib/utils";

import { NODE_TYPE_LABELS, planStatusColor } from "../constants";
import type { PlanDriftModel } from "../lib/drift";
import { planNodeKeyFields, planNodeSummary } from "../format";
import {
  PIPELINE_FILTER_OPTIONS,
  type NodePipelineProgress,
} from "../lib/pipeline-progress";
import { countBy, formatUpdated, withCounts } from "../utils";
import type { PlanNodeRow, PlanNodeType } from "../types";
import { PipelineProgressBadge } from "./PipelineProgressBadge";

/** Bump `version` when a column is added/removed (lib/list-views backfill contract). */
const SURFACE_PREFS: Partial<ListViewPrefs> = {
  version: 4,
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
  pipeline: "Pipeline",
  page: "Page",
  alignment: "Alignment",
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
  /** node_id → its realized CMS page (WF-11 overlay; absent = no pairing). */
  cmsPageById?: Map<
    string,
    {
      pageId: string;
      isPublished: boolean;
      route: string | null;
      /** `client_pages.web_page_id` — the AFTER door (absent = not measured). */
      webPageId: string | null;
    }
  >;
  /** The paired CMS site — the Page badge is a DOOR into the editor with it. */
  cmsSiteId?: string | null;
  /** web.page id → 28d Search Console standing (usePlanMeasureOverlay). */
  measureByWebPageId?: ReadonlyMap<string, PageSearchPerformance>;
  /** One site-wide node_step query projected by node; untouched nodes absent. */
  pipelineByNodeId: ReadonlyMap<string, NodePipelineProgress>;
  /** The workspace's one plan-vs-reality verdict, shared with the drift bar. */
  drift: PlanDriftModel;
  /** One editor body, hosted by both the canonical window and side panel. */
  renderNodePanel: (node: PlanNodeRow, onDeleted: () => void) => ReactNode;
}

export function PlanNodesTable({
  nodes,
  isLoading,
  isFetching,
  cmsPageById,
  cmsSiteId,
  measureByWebPageId,
  pipelineByNodeId,
  drift,
  renderNodePanel,
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
      ? {
          id: prefs.sort,
          direction: prefs.direction === "desc" ? "desc" : "asc",
        }
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
    const pipelineCounts = countBy(
      nodes,
      (row) => pipelineByNodeId.get(row.id)?.filterValue ?? "",
    );
    const pillarCounts = countBy(nodes, (row) => row.pillar_label ?? "");
    const clusterCounts = countBy(nodes, (row) => row.cluster_label ?? "");
    const pageCounts = countBy(nodes, (row) => {
      const page = cmsPageById?.get(row.id);
      return page ? (page.isPublished ? "Published" : "Draft") : "None";
    });
    const alignmentLabel = (row: PlanNodeRow) => {
      if (!drift.isPaired && !drift.hasCrawlData) return "Not connected";
      const item = drift.byNodeId.get(row.id);
      if (!item) return "Aligned";
      if (item.kind === "conflict") return "Route conflict";
      return item.reason === "not_built"
        ? "Not built"
        : item.reason === "not_published"
          ? "Draft only"
          : "Not crawled";
    };
    const alignmentCounts = countBy(nodes, alignmentLabel);

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
        id: "page",
        header: "Page",
        accessorFn: (row) => {
          const page = cmsPageById?.get(row.id);
          return page ? (page.isPublished ? "Published" : "Draft") : "None";
        },
        filter: "select",
        filterOptions: withCounts(
          [
            { value: "Published", label: "Published" },
            { value: "Draft", label: "Draft" },
            { value: "None", label: "None" },
          ],
          pageCounts,
        ),
        cell: (row) => {
          const page = cmsPageById?.get(row.id);
          if (!page)
            return <span className="text-sm text-muted-foreground">—</span>;
          const badge = (
            <Badge
              variant="secondary"
              className={cn(
                "px-1.5 text-[11px]",
                page.isPublished
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-sky-500/15 text-sky-600 dark:text-sky-400",
                cmsSiteId && "",
              )}
              title={page.route ?? undefined}
            >
              {page.isPublished ? "Published" : "Draft"}
            </Badge>
          );
          // THE AFTER door rides beside the DURING one — same row, same cell:
          // this page's 28d standing, opening the editor's Measure tab. It
          // renders nothing until the page is joined to a measured web.page.
          const measure = (
            <NodeMeasureDoor
              cmsSiteId={cmsSiteId}
              cmsPageId={page.pageId}
              webPageId={page.webPageId}
              performance={
                page.webPageId
                  ? measureByWebPageId?.get(page.webPageId)
                  : undefined
              }
            />
          );
          // THE DOOR LAW: the badge names a CMS page, so it opens it (new tab
          // — the row click still opens the node panel). Unpaired site: text.
          const during = !cmsSiteId ? (
            badge
          ) : (
            <a
              href={cmsPageEditorHref(cmsSiteId, page.pageId)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Open the CMS page${page.route ? ` ${page.route}` : ""} in the editor`}
              onClick={(event) => event.stopPropagation()}
            >
              {badge}
            </a>
          );
          return (
            <span className="inline-flex items-center gap-1">
              {during}
              {measure}
            </span>
          );
        },
        width: 140,
      },
      {
        id: "pipeline",
        header: "Pipeline",
        accessorFn: (row) => pipelineByNodeId.get(row.id)?.filterValue ?? "",
        filter: "select",
        filterOptions: withCounts(PIPELINE_FILTER_OPTIONS, pipelineCounts),
        cell: (row) => {
          const progress = pipelineByNodeId.get(row.id);
          return progress ? (
            <PipelineProgressBadge progress={progress} />
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          );
        },
        width: 150,
      },
      {
        id: "alignment",
        header: "Alignment",
        accessorFn: alignmentLabel,
        filter: "select",
        filterOptions: withCounts(
          [
            "Aligned",
            "Route conflict",
            "Not built",
            "Draft only",
            "Not crawled",
            "Not connected",
          ].map((label) => ({ value: label, label })),
          alignmentCounts,
        ),
        cell: (row) => {
          const label = alignmentLabel(row);
          return (
            <Badge
              variant="secondary"
              className={cn(
                "whitespace-nowrap text-[10px]",
                label === "Aligned"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : label === "Route conflict"
                    ? "bg-destructive/15 text-destructive"
                    : label === "Not connected"
                      ? "text-muted-foreground"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
              )}
            >
              {label}
            </Badge>
          );
        },
        width: 120,
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
  }, [
    nodes,
    statusCategories.categories,
    statusMetaById,
    cmsPageById,
    cmsSiteId,
    measureByWebPageId,
    pipelineByNodeId,
    drift,
  ]);

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
      detail={{
        title: (row) => row.label,
        description: (row) => row.route ?? "No route yet",
        defaultWidth: 620,
        render: (row, controls) => renderNodePanel(row, controls.closeDetail),
      }}
      window={{
        title: (row) => row.label,
        render: (row, controls) => renderNodePanel(row, controls.closeWindow),
        openOnRowClick: true,
        width: 920,
        height: 760,
      }}
      copy={{
        label: "Plan page",
        listLabel: "Plan pages",
        location: webLocation("Content Plan — pages table"),
        rowKind: "plan_node",
        listKind: "plan_node_list",
        rowDescription: "One planned page, as the table renders it.",
        listDescription:
          "The plan's pages in the current table view, with the plan-vs-site verdict each row shows.",
        humanRow: planNodeSummary,
        // The row's drift cell is a rendered verdict, not a column — carry it
        // so a copied row says the same thing the screen does.
        agentRow: (row) => ({
          ...planNodeKeyFields(row),
          plan_vs_site: !drift.isPaired && !drift.hasCrawlData
            ? "not-connected"
            : (drift.byNodeId.get(row.id)?.verdict ?? "matches the live site"),
          pipeline: pipelineByNodeId.get(row.id) ?? null,
          cms_page_id: cmsPageById?.get(row.id)?.pageId ?? null,
          // The AFTER the cell shows, so a copied row carries the same claim:
          // null web_page_id = nothing measures this page yet.
          web_page_id: cmsPageById?.get(row.id)?.webPageId ?? null,
          search_console_28d: (() => {
            const webPageId = cmsPageById?.get(row.id)?.webPageId;
            const performance = webPageId
              ? measureByWebPageId?.get(webPageId)
              : undefined;
            return performance?.in_gsc
              ? {
                  clicks: performance.gsc_clicks_28d,
                  impressions: performance.gsc_impressions_28d,
                  position: performance.gsc_position_28d,
                }
              : null;
          })(),
        }),
        rowAttributes: (row) => ({
          node_id: row.id,
          route: row.route,
          node_type: row.node_type,
        }),
        listAttributes: (visible, all) => ({
          rows: visible.length,
          pages_planned: all.length,
          without_keyword: all.filter((row) => !row.primary_keyword_id).length,
          without_brief: all.filter(
            (row) => !row.brief || row.brief.length === 0,
          ).length,
          drift_total: drift.counts.total,
          drift_ghosts: drift.counts.ghosts,
          drift_conflicts: drift.counts.conflicts,
          drift_orphans: drift.counts.orphans,
        }),
        aiVariants: (visible, all) => [
          keyFieldsAiVariant({
            kind: "plan_node_list",
            location: webLocation("Content Plan — pages table"),
            description:
              "The pages in the current table view, projected to their core planning fields.",
            visible,
            project: planNodeKeyFields,
            query,
            attributes: { pages_planned: all.length },
          }),
          {
            id: "gaps",
            label: "Gaps only",
            hint: "Pages missing a target keyword or a brief",
            build: () => {
              const gaps = all.filter(
                (row) =>
                  !row.primary_keyword_id ||
                  !row.brief ||
                  row.brief.length === 0,
              );
              return {
                kind: "plan_node_gaps",
                location: webLocation("Content Plan — pages table"),
                description:
                  "Every planned page (across the WHOLE plan, not just this view) still missing a target keyword or a brief.",
                data: {
                  gaps: gaps.map((row) => ({
                    ...planNodeKeyFields(row),
                    missing: [
                      row.primary_keyword_id ? null : "target keyword",
                      row.brief && row.brief.length > 0 ? null : "brief",
                    ].filter(Boolean),
                  })),
                },
                attributes: {
                  detail: "gaps",
                  gaps: gaps.length,
                  pages_planned: all.length,
                  drift_total: drift.counts.total,
                },
              };
            },
          },
        ],
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
