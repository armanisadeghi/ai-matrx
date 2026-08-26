"use client";

import type { ReactNode } from "react";
import {
  ChevronRight,
  MoreVertical,
  PanelTop,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  CellEditsMap,
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { filterAndSortRows } from "@/components/official/matrx-data-table/filter-engine";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import type { BandMeta } from "../lib";
import {
  LEAD_QUALITY_OPTIONS,
  OFFERING_MATCH_OPTIONS,
  ROOT_TYPE_META,
  rootTypeMeta,
} from "./types";
import { DEFAULT_TOPIC_WEIGHT, type TopicTreeNode } from "./lib";

export interface OfferingTableRow {
  id: string;
  parentId: string | null;
  depth: number;
  name: string;
  description: string;
  type: string;
  typeLabel: string;
  branch: "offering" | "non_revenue";
  branchLabel: string;
  rootName: string;
  worth: number;
  worthSource: string;
  offeringMatch: string | null;
  offeringMatchLabel: string;
  leadQuality: string | null;
  leadQualityLabel: string;
  keywordsHere: number;
  keywordsBranch: number;
  clicks: number;
  impressions: number;
  bands: Record<string, number>;
}

export interface OfferingRowActions {
  onReparent: (node: TopicTreeNode, parentId: string | null) => void;
  onPinParent: (node: TopicTreeNode) => void;
  onSetWorth: (node: TopicTreeNode) => void;
  onEdit: (node: TopicTreeNode) => void;
  onAddChild: (node: TopicTreeNode) => void;
  onMakeRoot: (node: TopicTreeNode) => void;
  onViewKeywords: (node: TopicTreeNode) => void;
  onDelete: (node: TopicTreeNode) => void;
}

function optionLabel(
  value: string | null | undefined,
  options: readonly { value: string; label: string }[],
): string {
  if (!value) return "Not set";
  return options.find((option) => option.value === value)?.label ?? value;
}

export function offeringTableRows(nodes: TopicTreeNode[]): OfferingTableRow[] {
  return nodes.map((node) => {
    const effectiveRuling = node.ownWorth ?? node.inheritedWorth;
    const root = rootTypeMeta(node.rootType);
    return {
      id: node.topic.id,
      parentId: node.topic.parent_id,
      depth: node.depth,
      name: node.topic.name,
      description: node.topic.description ?? "",
      type: node.topic.node_type,
      typeLabel: rootTypeMeta(node.topic.node_type).label,
      branch: root.offering ? "offering" : "non_revenue",
      branchLabel: root.offering ? "Offering" : "Non-revenue",
      rootName: node.rootName,
      worth: node.effectiveWeight,
      worthSource: node.ownWorth
        ? "Set here"
        : node.inheritedFrom
          ? `From ${node.inheritedFrom.name}`
          : `Default ${DEFAULT_TOPIC_WEIGHT}`,
      offeringMatch: effectiveRuling?.offering_match ?? null,
      offeringMatchLabel: optionLabel(
        effectiveRuling?.offering_match,
        OFFERING_MATCH_OPTIONS,
      ),
      leadQuality: effectiveRuling?.lead_quality ?? null,
      leadQualityLabel: optionLabel(
        effectiveRuling?.lead_quality,
        LEAD_QUALITY_OPTIONS,
      ),
      keywordsHere: node.own.keywords,
      keywordsBranch: node.subtree.keywords,
      clicks: node.subtree.clicks,
      impressions: node.subtree.impressions,
      bands: node.subtree.bands,
    };
  });
}

/**
 * MatrxDataTable owns every table behavior; this processor preserves the one
 * thing a flat engine cannot infer: filtering keeps lineage and sorting only
 * reorders siblings, so a child never appears to become a root.
 */
export function processOfferingTreeRows(
  rows: OfferingTableRow[],
  state: MatrxDataTableQueryState,
  columns: MatrxColumnDef<OfferingTableRow>[],
  collapsed: ReadonlySet<string>,
): OfferingTableRow[] {
  const matched = filterAndSortRows(
    rows,
    columns,
    state.columnFilters,
    null,
    state.search,
    state.anyOf
      ? { columnIds: ["name", "type", "rootName"], query: state.anyOf }
      : undefined,
    state.layeredFilters,
    state.searchMatchMode,
    (row) => `${row.description} ${row.rootName}`,
  );
  const filtering =
    state.search.trim().length > 0 ||
    state.anyOf.trim().length > 0 ||
    Object.values(state.columnFilters).some(Boolean) ||
    (state.layeredFilters?.length ?? 0) > 0;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string | null, OfferingTableRow[]>();
  for (const row of rows) {
    const parentId =
      row.parentId && byId.has(row.parentId) ? row.parentId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), row]);
  }

  const keep = new Set(
    filtering ? matched.map((row) => row.id) : rows.map((row) => row.id),
  );
  if (filtering) {
    for (const row of matched) {
      let parentId = row.parentId;
      let guard = 0;
      while (parentId && guard < 64) {
        keep.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
        guard += 1;
      }
    }
    if (state.search.trim()) {
      const includeDescendants = (id: string) => {
        for (const child of children.get(id) ?? []) {
          keep.add(child.id);
          includeDescendants(child.id);
        }
      };
      matched.forEach((row) => includeDescendants(row.id));
    }
  }

  const ordered: OfferingTableRow[] = [];
  const visit = (siblings: OfferingTableRow[]) => {
    const sorted = filterAndSortRows(siblings, columns, {}, state.sort, "");
    for (const row of sorted) {
      if (!keep.has(row.id)) continue;
      ordered.push(row);
      if (!filtering && collapsed.has(row.id)) continue;
      visit(children.get(row.id) ?? []);
    }
  };
  visit(children.get(null) ?? []);
  return ordered;
}

export function OfferingTreeTable({
  nodes,
  byId,
  metas,
  collapsed,
  selectedId,
  busy,
  actions,
  onToggle,
  onSelect,
  onCreate,
  onSaveEdits,
  wrapTable,
}: {
  nodes: TopicTreeNode[];
  byId: Map<string, TopicTreeNode>;
  metas: BandMeta[];
  collapsed: ReadonlySet<string>;
  selectedId: string | null;
  busy: boolean;
  actions: OfferingRowActions;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onSaveEdits: (edits: CellEditsMap, rows: OfferingTableRow[]) => Promise<void>;
  wrapTable?: (table: ReactNode) => ReactNode;
}) {
  const rows = offeringTableRows(nodes);
  const columns: MatrxColumnDef<OfferingTableRow>[] = [
    {
      accessorKey: "name",
      header: "Offering",
      width: 450,
      className: "sm:min-w-[450px]",
      headerClassName: "sm:min-w-[450px]",
      editable: "string",
      editTrigger: "pencil",
      cell: (row) => {
        const node = byId.get(row.id);
        const hasChildren = (node?.children.length ?? 0) > 0;
        return (
          <div
            className="flex min-w-0 items-center"
            style={{ paddingLeft: `${Math.min(row.depth, 10) * 12}px` }}
          >
            <button
              type="button"
              aria-label={
                collapsed.has(row.id)
                  ? `Expand ${row.name}`
                  : `Collapse ${row.name}`
              }
              disabled={!hasChildren}
              className={cn(
                "flex h-10 w-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted lg:h-7",
                !hasChildren && "invisible",
              )}
              onClick={(event) => {
                event.stopPropagation();
                onToggle(row.id);
              }}
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 transition-transform",
                  !collapsed.has(row.id) && "rotate-90",
                )}
              />
            </button>
            <span
              className="truncate font-medium text-foreground"
              title={row.name}
            >
              {row.name}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "type",
      header: "Type",
      width: 210,
      filter: "select",
      filterOptions: ROOT_TYPE_META.map(({ value, label }) => ({
        value,
        label,
      })),
      editable: "select",
      editOptions: ROOT_TYPE_META.map(({ value, label }) => ({ value, label })),
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-foreground">
          {rootTypeMeta(row.type).label}
        </span>
      ),
    },
    {
      accessorKey: "branch",
      header: "Branch",
      width: 108,
      filter: "select",
      filterOptions: [
        { value: "offering", label: "Offering" },
        { value: "non_revenue", label: "Non-revenue" },
      ],
      cell: (row) => (
        <span
          className={cn(
            "whitespace-nowrap text-xs font-medium",
            row.branch === "offering" ? "text-success" : "text-info",
          )}
        >
          {row.branchLabel}
        </span>
      ),
    },
    {
      accessorKey: "worth",
      header: "Worth",
      width: 78,
      align: "right",
      filter: "number",
      editable: "number",
      cell: (row) => (
        <span className="font-medium tabular-nums text-foreground">
          {row.worth}
        </span>
      ),
    },
    {
      accessorKey: "worthSource",
      header: "Worth source",
      width: 165,
      filter: "text",
      cell: (row) => (
        <span
          className="block truncate text-xs text-muted-foreground"
          title={row.worthSource}
        >
          {row.worthSource}
        </span>
      ),
    },
    {
      accessorKey: "offeringMatch",
      header: "Offering match",
      width: 165,
      filter: "select",
      filterOptions: OFFERING_MATCH_OPTIONS.map(({ value, label }) => ({
        value,
        label,
      })),
      editable: "select",
      editOptions: OFFERING_MATCH_OPTIONS.map(({ value, label }) => ({
        value,
        label,
      })),
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-foreground">
          {optionLabel(row.offeringMatch, OFFERING_MATCH_OPTIONS)}
        </span>
      ),
    },
    {
      accessorKey: "leadQuality",
      header: "Lead quality",
      width: 160,
      filter: "select",
      filterOptions: LEAD_QUALITY_OPTIONS.map(({ value, label }) => ({
        value,
        label,
      })),
      editable: "select",
      editOptions: LEAD_QUALITY_OPTIONS.map(({ value, label }) => ({
        value,
        label,
      })),
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-foreground">
          {optionLabel(row.leadQuality, LEAD_QUALITY_OPTIONS)}
        </span>
      ),
    },
    {
      accessorKey: "keywordsHere",
      header: "Keywords here",
      width: 104,
      align: "right",
      filter: "number",
      cell: (row) => (
        <span className="tabular-nums">{formatCount(row.keywordsHere)}</span>
      ),
    },
    {
      accessorKey: "keywordsBranch",
      header: "In branch",
      width: 92,
      align: "right",
      filter: "number",
      cell: (row) => (
        <button
          type="button"
          className="min-h-10 rounded px-1.5 font-medium tabular-nums text-foreground hover:bg-muted hover:text-primary lg:min-h-7"
          onClick={(event) => {
            event.stopPropagation();
            const node = byId.get(row.id);
            if (node) actions.onViewKeywords(node);
          }}
        >
          {formatCount(row.keywordsBranch)}
        </button>
      ),
    },
    {
      accessorKey: "clicks",
      header: "Clicks",
      width: 80,
      align: "right",
      filter: "number",
      cell: (row) => (
        <span className="tabular-nums">{formatCount(row.clicks)}</span>
      ),
    },
    {
      accessorKey: "impressions",
      header: "Impressions",
      width: 102,
      align: "right",
      filter: "number",
      cell: (row) => (
        <span className="tabular-nums">{formatCount(row.impressions)}</span>
      ),
    },
    ...metas.map<MatrxColumnDef<OfferingTableRow>>((meta) => ({
      id: `level-${meta.value}`,
      header: meta.label,
      width: 82,
      align: "right",
      filter: "number",
      accessorFn: (row) => row.bands[meta.value] ?? 0,
      cell: (row) => (
        <span className={cn("tabular-nums", meta.tone)}>
          {formatCount(row.bands[meta.value] ?? 0)}
        </span>
      ),
    })),
  ];

  const table = (
    <MatrxDataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      searchText={(row) => `${row.description} ${row.rootName}`}
      processLocalRows={(allRows, state) =>
        processOfferingTreeRows(allRows, state, columns, collapsed)
      }
      urlState={{
        id: "offering-tree",
        defaultSort: { id: "keywordsBranch", direction: "desc" },
        selectedRow: false,
      }}
      toolbar={{
        searchPlaceholder: "Search offerings…",
        searchMatch: {},
        leading: (
          <span className="hidden text-xs text-muted-foreground xl:inline">
            Sorting reorders siblings and keeps every branch intact.
          </span>
        ),
        actions: (
          <Button
            size="sm"
            variant="outline"
            className="h-10 text-sm lg:h-7 lg:text-xs"
            onClick={onCreate}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            New offering
          </Button>
        ),
      }}
      edit={{ enabled: true, autoSave: true, onSave: onSaveEdits }}
      hierarchy={{
        getParentId: (row) => row.parentId,
        onMove: (row, move) => {
          const node = byId.get(row.id);
          if (node) actions.onReparent(node, move.parentId);
        },
        canReparent: () => !busy,
        itemLabel: (row) => row.name,
        rootDropLabel: "Drop here to make this a root offering",
      }}
      copy={{
        label: "Offering",
        listLabel: "Offering tree",
        location: webLocation("Offering tree"),
        rowKind: "web-offering",
        listKind: "web-offering-list",
        humanRow: (row) =>
          humanLines([
            ["Offering", row.name],
            ["Type", row.typeLabel],
            ["Worth", row.worth],
            ["Worth source", row.worthSource],
            ["Keywords here", row.keywordsHere],
            ["Keywords in branch", row.keywordsBranch],
          ]),
        agentRow: (row) => row,
      }}
      selectedId={selectedId}
      onRowOpen={(row) => onSelect(row.id)}
      detail={{ enabled: false }}
      rowActions={(row) => {
        const node = byId.get(row.id);
        return node ? (
          <OfferingActions node={node} actions={actions} busy={busy} />
        ) : null;
      }}
      emptyState={{
        title: "No offerings match",
        description:
          "Clear a filter or create the first offering for this catalog.",
      }}
      pageSize={0}
      zebra
      className="h-[50dvh] min-h-[336px] max-h-[672px] lg:h-[55dvh] lg:min-h-[378px]"
      tableClassName="rounded-t-none"
    />
  );

  return <>{wrapTable ? wrapTable(table) : table}</>;
}

function OfferingActions({
  node,
  actions,
  busy,
}: {
  node: TopicTreeNode;
  actions: OfferingRowActions;
  busy: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          className="h-11 w-11 lg:h-5 lg:w-5 [&_svg]:size-3"
          aria-label={`Actions for ${node.topic.name}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem onSelect={() => actions.onPinParent(node)}>
          Choose parent offering…
        </DropdownMenuItem>
        {node.topic.parent_id ? (
          <DropdownMenuItem onSelect={() => actions.onMakeRoot(node)}>
            Make this a root
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={() => actions.onAddChild(node)}>
          Add an offering beneath this…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.onViewKeywords(node)}>
          <PanelTop className="h-3.5 w-3.5" />
          See keywords in this branch
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onSetWorth(node)}>
          Edit full worth ruling…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onEdit(node)}>
          Edit description…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onSelect={() => actions.onDelete(node)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete offering…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
