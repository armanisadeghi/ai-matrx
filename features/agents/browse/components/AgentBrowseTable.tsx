"use client";

// features/agents/browse/components/AgentBrowseTable.tsx
//
// The default view. Built on the canonical MatrxDataTable (sticky header,
// zebra, inline edit + save pill) in CONTROLLED mode: the table owns none of
// the querying, so sort, filter and pagination are real server operations over
// the WHOLE result set — never a re-sort of the loaded page.
//
// Three behaviours worth stating plainly:
//   * EVERY column sorts and filters (app policy). The controlled
//     `columnFilters` state maps 1:1 onto `agx_list_scoped(p_filters)`, and
//     finite-valued columns get real options with counts from the facets RPC.
//   * The WHOLE ROW opens AgentActionModal (classic Run/Edit/View chooser).
//     Name/description are plain text (not links); edit only via the hover
//     pencil. The kebab still carries the full ItemMenu.
//   * Name / Description / Category / Tags edit in place. Edits stay local
//     until the floating Save pill commits them.

import { MoreVertical, Star } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  ColumnFiltersState,
  MatrxColumnDef,
} from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { cn } from "@/lib/utils";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import { BROWSE_COLUMNS, relativeTime } from "../columns";
import type {
  AgentBrowseRow,
  AgentRowEdit,
  BrowseFacets,
  BrowseFilters,
} from "../types";

interface Props {
  rows: AgentBrowseRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
  filters: BrowseFilters;
  facets: BrowseFacets;
  isLoading: boolean;
  isFetching: boolean;
  density: "compact" | "comfortable";
  showSharedColumns: boolean;
  hiddenColumns: string[];
  menuFor: (row: AgentBrowseRow) => () => ItemMenuConfig;
  onOpenActionModal: (row: AgentBrowseRow) => void;
  onToggleFavorite: (row: AgentBrowseRow) => void;
  onSaveEdits: (edits: Record<string, AgentRowEdit>) => Promise<void>;
  onQueryChange: (next: {
    page: number;
    pageSize: number;
    sort: string;
    direction: "asc" | "desc";
    filters: BrowseFilters;
  }) => void;
  emptyAction?: React.ReactNode;
}

const NONE_LABEL: Record<string, string> = {
  category: "Uncategorized",
  tags: "Untagged",
  organization_name: "No organization",
  owner_email: "No owner",
};

/** Our filter bag → the table's controlled `columnFilters` shape. */
function toTableFilters(filters: BrowseFilters): ColumnFiltersState {
  const out: ColumnFiltersState = {};
  for (const [id, f] of Object.entries(filters)) {
    if (f.kind === "text") out[id] = { kind: "text", value: f.value };
    else if (f.kind === "select")
      out[id] = { kind: "select", value: f.values[0] ?? "", values: f.values };
    else out[id] = { kind: "boolean", value: f.value };
  }
  return out;
}

/** The table's `columnFilters` → our bag. Empty entries drop out entirely. */
function fromTableFilters(state: ColumnFiltersState): BrowseFilters {
  const out: BrowseFilters = {};
  for (const [id, f] of Object.entries(state)) {
    if (!f) continue;
    if (f.kind === "text") {
      if (f.value?.trim()) out[id] = { kind: "text", value: f.value.trim() };
    } else if (f.kind === "select") {
      const values = f.values?.length ? f.values : f.value ? [f.value] : [];
      if (values.length > 0) out[id] = { kind: "select", values };
    } else if (f.kind === "boolean") {
      out[id] = { kind: "boolean", value: f.value };
    }
  }
  return out;
}

export function AgentBrowseTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  filters,
  facets,
  isLoading,
  isFetching,
  density,
  showSharedColumns,
  hiddenColumns,
  menuFor,
  onOpenActionModal,
  onToggleFavorite,
  onSaveEdits,
  onQueryChange,
  emptyAction,
}: Props) {
  const columns: MatrxColumnDef<AgentBrowseRow>[] = BROWSE_COLUMNS.filter(
    (spec) =>
      (showSharedColumns || !spec.scopedToShared) &&
      !hiddenColumns.includes(spec.id),
  ).map((spec) => {
    const facetOptions = spec.facet ? facets.byKind[spec.facet] : undefined;
    return {
      ...spec.column,
      cell:
        spec.id === "favorite"
          ? (row: AgentBrowseRow) => favoriteCell(row)
          : spec.column.cell,
      // Every column sorts — the RPC's ORDER BY whitelist covers all of them.
      sortable: true,
      // Finite value sets get real options WITH counts, so the user picks from
      // what exists instead of guessing at a text box. Columns that declare
      // their own fixed options (the date buckets) keep them.
      filterOptions:
        spec.column.filterOptions ??
        facetOptions?.map((v) => ({
          value: v.value,
          label:
            v.value === "__none__"
              ? (NONE_LABEL[spec.id] ?? "None")
              : `${v.value} (${v.count})`,
        })),
      editOptions:
        spec.column.editable === "select" || spec.column.editable === "tags"
          ? facetOptions
              ?.filter((v) => v.value !== "__none__")
              .map((v) => ({ value: v.value, label: v.value }))
          : undefined,
    };
  });

  // ONE star: clickable, sortable, filterable. A separate read-only "Fav"
  // column beside an interactive star would show the same bit twice.
  const favoriteCell = (row: AgentBrowseRow) => (
    <button
      type="button"
      aria-label={
        row.is_favorite ? "Remove from favorites" : "Add to favorites"
      }
      disabled={!row.is_owner}
      onClick={(e) => {
        e.stopPropagation();
        onToggleFavorite(row);
      }}
      className="rounded p-0.5 text-muted-foreground/40 hover:text-amber-500 disabled:hover:text-muted-foreground/40"
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          row.is_favorite && "fill-amber-400 text-amber-500",
        )}
      />
    </button>
  );

  return (
    <MatrxDataTable<AgentBrowseRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      isFetching={isFetching}
      zebra
      pageSizeOptions={[...LIST_VIEW_PAGE_SIZES]}
      className={cn(density === "compact" && "text-xs [&_td]:py-1 [&_th]:py-1")}
      query={{
        mode: "controlled",
        totalItems: total,
        state: {
          page,
          pageSize,
          search: "",
          anyOf: "",
          columnFilters: toTableFilters(filters),
          sort: { id: sort, direction },
        },
        onStateChange: (next) => {
          onQueryChange({
            page: next.page,
            pageSize: next.pageSize,
            sort: next.sort?.id ?? sort,
            direction: next.sort?.direction ?? direction,
            filters: fromTableFilters(next.columnFilters),
          });
        },
      }}
      // The page owns the search box; a second one inside the table would be
      // two affordances fighting over one query.
      toolbar={{ search: false }}
      // Row click opens AgentActionModal. Side panel / row-window stay off —
      // the kebab menu already carries Quick look and every other record action.
      detail={{ enabled: false }}
      window={{ enabled: false }}
      onRowOpen={onOpenActionModal}
      edit={{
        enabled: true,
        onSave: async (edits) => {
          await onSaveEdits(edits as Record<string, AgentRowEdit>);
        },
      }}
      rowActions={(row) => (
        <ItemMenu config={menuFor(row)} align="end">
          <button
            type="button"
            aria-label={`Actions for ${row.name}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </ItemMenu>
      )}
      copy={{
        label: "Agent",
        listLabel: "Agents",
        location: "/agents",
        rowKind: "agent",
        listKind: "agent-list",
        humanRow: (row) =>
          `${row.name}${row.category ? ` (${row.category})` : ""} — updated ${relativeTime(row.updated_at)}`,
        // Row copy lives in the "…" menu; the toolbar strip would be a lone
        // pair of unlabeled icons floating above the header.
        showRow: false,
        showToolbar: false,
      }}
      emptyState={{
        title: "No agents here",
        description: "Nothing matches this scope and filter combination.",
        action: emptyAction,
      }}
    />
  );
}
