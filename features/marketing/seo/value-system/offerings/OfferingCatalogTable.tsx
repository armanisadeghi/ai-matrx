"use client";

/**
 * The brand's offerings as ONE canonical table (MatrxDataTable), drawn as the
 * catalog tree (brand-offerings D3) with this site's choices on every row.
 *
 * - "Offered here" is the site's explicit availability (D2): switching it on
 *   offers it immediately (and restores anything a previous stop removed);
 *   switching it off opens the consequence dialog first.
 * - Select any rows, or all of them, to offer or stop offering in bulk.
 * - Worth is this site's own ruling in points (D9); "Worth used" names the
 *   offering a row actually takes its worth from.
 * - Every count is a door: "In branch" opens those keywords.
 */

import type { ReactNode } from "react";
import {
  ChevronRight,
  CircleDollarSign,
  GitBranchPlus,
  MoreVertical,
  PanelTop,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type {
  CellEditsMap,
  MatrxColumnDef,
} from "@ai-matrx/design-system/data-table/types";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import type { BandMeta } from "../lib";
import {
  catalogRows,
  destinationSiblingOrder,
  processCatalogRows,
  type CatalogNode,
  type CatalogRow,
  type CatalogTree,
} from "./catalog-tree";
import {
  LEAD_QUALITY_OPTIONS,
  OFFERING_KIND_META,
  OFFERING_MATCH_OPTIONS,
  formatPoints,
  optionLabel,
} from "./vocabulary";

export const CATALOG_TABLE_ID = "offering-catalog";

export interface CatalogRowActions {
  onToggleOffered: (node: CatalogNode, offered: boolean) => void;
  onSetWorth: (node: CatalogNode) => void;
  onEdit: (node: CatalogNode) => void;
  onAddChild: (node: CatalogNode) => void;
  onViewKeywords: (node: CatalogNode) => void;
  onRemove: (node: CatalogNode) => void;
  onMove: (node: CatalogNode, parentId: string | null, siblingOrder: string[]) => void;
  onBulkAvailability: (ids: string[], offered: boolean) => void;
}

export function OfferingCatalogTable({
  tree,
  metas,
  collapsed,
  selectedId,
  selectedIds,
  busy,
  actions,
  onToggle,
  onSelect,
  onSelectedIdsChange,
  onAdd,
  onSaveEdits,
  wrapTable,
}: {
  tree: CatalogTree;
  metas: BandMeta[];
  collapsed: ReadonlySet<string>;
  selectedId: string | null;
  selectedIds: string[];
  busy: boolean;
  actions: CatalogRowActions;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onSelectedIdsChange: (ids: string[]) => void;
  onAdd: () => void;
  onSaveEdits: (edits: CellEditsMap, rows: CatalogRow[]) => Promise<void>;
  wrapTable?: (table: ReactNode) => ReactNode;
}) {
  const rows = catalogRows(tree);
  const nodeOf = (id: string) => tree.byId.get(id);

  const columns: MatrxColumnDef<CatalogRow>[] = [
    {
      accessorKey: "name",
      header: "Offering",
      width: 380,
      className: "sm:min-w-[380px]",
      headerClassName: "sm:min-w-[380px]",
      editable: "string",
      editTrigger: "pencil",
      cell: (row) => {
        const hasChildren = (nodeOf(row.id)?.children.length ?? 0) > 0;
        return (
          <div
            className="flex min-w-0 items-center gap-0.5"
            style={{ paddingLeft: `${Math.min(row.depth, 10) * 12}px` }}
          >
            <button
              type="button"
              aria-label={collapsed.has(row.id) ? `Expand ${row.name}` : `Collapse ${row.name}`}
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
                className={cn("h-4 w-4 transition-transform", !collapsed.has(row.id) && "rotate-90")}
              />
            </button>
            <span
              className={cn(
                "truncate font-medium",
                row.available ? "text-foreground" : "text-muted-foreground",
              )}
              title={row.description ? `${row.name} — ${row.description}` : row.name}
            >
              {row.name}
            </span>
          </div>
        );
      },
    },
    {
      id: "offeredHere",
      header: "Offered here",
      width: 104,
      filter: "select",
      filterOptions: [
        { value: "yes", label: "Offered here" },
        { value: "no", label: "Not offered here" },
      ],
      accessorFn: (row) => (row.available ? "yes" : "no"),
      cell: (row) => (
        <div className="flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
          <Switch
            checked={row.available}
            disabled={busy}
            aria-label={row.available ? `Stop offering ${row.name} on this site` : `Offer ${row.name} on this site`}
            onCheckedChange={(checked) => {
              const node = nodeOf(row.id);
              if (node) actions.onToggleOffered(node, checked);
            }}
          />
          <span className="hidden text-[11px] text-muted-foreground xl:inline">
            {row.available ? "Yes" : "No"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "kind",
      header: "Kind",
      width: 150,
      filter: "select",
      filterOptions: OFFERING_KIND_META.map(({ value, label }) => ({ value, label })),
      editable: "select",
      editOptions: OFFERING_KIND_META.map(({ value, label }) => ({ value, label })),
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-foreground">
          {OFFERING_KIND_META.find((entry) => entry.value === row.kind)?.label ?? row.kind}
        </span>
      ),
    },
    {
      accessorKey: "worthPoints",
      header: "Worth here",
      width: 96,
      align: "right",
      filter: "number",
      editable: "number",
      cell: (row) => (
        <span
          className={cn(
            "tabular-nums",
            row.worthPoints === null ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {row.worthPoints === null ? "No ruling" : formatPoints(row.worthPoints)}
        </span>
      ),
    },
    {
      accessorKey: "worthSource",
      header: "Worth used",
      width: 190,
      filter: "text",
      cell: (row) => (
        <span
          className={cn("block truncate text-xs", row.negative ? "text-destructive" : "text-muted-foreground")}
          title={row.negative ? `${row.worthSource} — forces Negative` : row.worthSource}
        >
          {row.effectivePoints === null ? row.worthSource : `${formatPoints(row.effectivePoints)} · ${row.worthSource}`}
          {row.negative ? " · Negative" : ""}
        </span>
      ),
    },
    {
      accessorKey: "offeringMatch",
      header: "Do you do this?",
      width: 160,
      filter: "select",
      filterOptions: OFFERING_MATCH_OPTIONS.map(({ value, label }) => ({ value, label })),
      editable: "select",
      editOptions: OFFERING_MATCH_OPTIONS.map(({ value, label }) => ({ value, label })),
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
      filterOptions: LEAD_QUALITY_OPTIONS.map(({ value, label }) => ({ value, label })),
      editable: "select",
      editOptions: LEAD_QUALITY_OPTIONS.map(({ value, label }) => ({ value, label })),
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-foreground">
          {optionLabel(row.leadQuality, LEAD_QUALITY_OPTIONS)}
        </span>
      ),
    },
    {
      accessorKey: "sourceLabel",
      header: "Source",
      width: 170,
      filter: "select",
      filterOptions: [
        { value: "From a suggestion", label: "From a suggestion" },
        { value: "Changed from a suggestion", label: "Changed from a suggestion" },
        { value: "Your own", label: "Your own" },
      ],
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">{row.sourceLabel}</span>
      ),
    },
    {
      accessorKey: "otherSites",
      header: "Other sites",
      width: 92,
      align: "right",
      filter: "number",
      cell: (row) => <span className="tabular-nums text-muted-foreground">{formatCount(row.otherSites)}</span>,
    },
    {
      accessorKey: "keywordsHere",
      header: "Keywords here",
      width: 104,
      align: "right",
      filter: "number",
      cell: (row) => <span className="tabular-nums">{formatCount(row.keywordsHere)}</span>,
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
          disabled={row.keywordsBranch === 0}
          className="min-h-10 rounded px-1.5 font-medium tabular-nums text-foreground hover:bg-muted hover:text-primary disabled:text-muted-foreground disabled:hover:bg-transparent lg:min-h-7"
          title={row.keywordsBranch > 0 ? `Open the ${formatCount(row.keywordsBranch)} keywords in this branch` : undefined}
          onClick={(event) => {
            event.stopPropagation();
            const node = nodeOf(row.id);
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
      cell: (row) => <span className="tabular-nums">{formatCount(row.clicks)}</span>,
    },
    {
      accessorKey: "impressions",
      header: "Impressions",
      width: 102,
      align: "right",
      filter: "number",
      cell: (row) => <span className="tabular-nums">{formatCount(row.impressions)}</span>,
    },
    ...metas.map<MatrxColumnDef<CatalogRow>>((meta) => ({
      id: `level-${meta.value}`,
      header: meta.label,
      width: 82,
      align: "right",
      filter: "number",
      accessorFn: (row) => row.bands[meta.value] ?? 0,
      cell: (row) => (
        <span className={cn("tabular-nums", meta.tone)}>{formatCount(row.bands[meta.value] ?? 0)}</span>
      ),
    })),
  ];

  const table = (
    <MatrxDataTable
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      searchText={(row) => row.description}
      processLocalRows={(allRows, state) => processCatalogRows(allRows, state, columns, collapsed)}
      urlState={{ id: CATALOG_TABLE_ID, selectedRow: false }}
      toolbar={{
        searchPlaceholder: "Search this brand's offerings…",
        searchMatch: {},
        leading: (
          <span className="hidden text-xs text-muted-foreground xl:inline">
            Drag onto a row&apos;s edge to reorder · middle to nest it inside.
          </span>
        ),
        actions: (
          <Button size="sm" className="h-10 text-sm lg:h-7 lg:text-xs" onClick={onAdd}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add offering
          </Button>
        ),
      }}
      selection={{
        selectedIds,
        onSelectedIdsChange,
        noun: "offering",
        actions: (_selected, ids) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-10 text-sm lg:h-7 lg:text-xs"
              disabled={busy || ids.length === 0}
              onClick={() => actions.onBulkAvailability(ids, true)}
            >
              Offer on this site
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-10 text-sm text-destructive hover:text-destructive lg:h-7 lg:text-xs"
              disabled={busy || ids.length === 0}
              onClick={() => actions.onBulkAvailability(ids, false)}
            >
              Stop offering here…
            </Button>
          </div>
        ),
      }}
      edit={{ enabled: true, autoSave: true, onSave: onSaveEdits }}
      hierarchy={{
        getParentId: (row) => row.parentId,
        onMove: (row, move) => {
          const node = nodeOf(row.id);
          if (node) actions.onMove(node, move.parentId, destinationSiblingOrder(rows, row.id, move));
        },
        manualOrder: true,
        canReparent: () => !busy,
        itemLabel: (row) => row.name,
        rootDropLabel: "Place first at the top level",
      }}
      copy={{
        label: "Offering",
        listLabel: "Brand offerings",
        location: webLocation("Offerings"),
        rowKind: "web-offering",
        listKind: "web-offering-list",
        humanRow: (row) =>
          humanLines([
            ["Offering", row.name],
            ["Offered on this site", row.available ? "Yes" : "No"],
            ["Kind", row.kind],
            ["Worth here", row.worthPoints === null ? "No ruling" : formatPoints(row.worthPoints)],
            ["Worth used", row.worthSource],
            ["Keywords here", row.keywordsHere],
            ["Keywords in branch", row.keywordsBranch],
          ]),
        agentRow: (row) => row,
      }}
      selectedId={selectedId}
      onRowOpen={(row) => onSelect(row.id)}
      detail={{ enabled: false }}
      rowActions={(row) => {
        const node = nodeOf(row.id);
        return node ? <RowActions node={node} actions={actions} busy={busy} /> : null;
      }}
      emptyState={{
        title: "No offerings match",
        description: "Clear a filter, or add what this business sells.",
      }}
      pageSize={0}
      zebra
      className="h-[50dvh] min-h-[336px] max-h-[672px] lg:h-[55dvh] lg:min-h-[378px]"
      tableClassName="rounded-t-none"
    />
  );

  return <>{wrapTable ? wrapTable(table) : table}</>;
}

function RowActions({
  node,
  actions,
  busy,
}: {
  node: CatalogNode;
  actions: CatalogRowActions;
  busy: boolean;
}) {
  const o = node.offering;
  const removable = o.available && o.otherSiteCount === 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          className="h-11 w-11 lg:h-5 lg:w-5 [&_svg]:size-3"
          aria-label={`Actions for ${o.name}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem onSelect={() => actions.onToggleOffered(node, !o.available)}>
          {o.available ? "Stop offering on this site…" : "Offer on this site"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onSetWorth(node)} disabled={!o.available}>
          <CircleDollarSign className="h-3.5 w-3.5" />
          {o.available ? "Set what it's worth here…" : "Offer it here to set its worth"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onViewKeywords(node)}>
          <PanelTop className="h-3.5 w-3.5" />
          See keywords in this branch
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.onEdit(node)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit name, kind or place…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => actions.onAddChild(node)}>
          <GitBranchPlus className="h-3.5 w-3.5" />
          Add an offering beneath this…
        </DropdownMenuItem>
        {removable ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => actions.onRemove(node)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove from this brand…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
