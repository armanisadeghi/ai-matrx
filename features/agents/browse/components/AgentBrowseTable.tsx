"use client";

// features/agents/browse/components/AgentBrowseTable.tsx
//
// The default view. Built on the canonical MatrxDataTable (sticky header,
// zebra) in CONTROLLED mode: the table owns none of the querying, so sort and
// pagination are real server operations over the WHOLE result set — not a
// re-sort of whatever page happened to load. That distinction is the entire
// bug in /transcripts' bespoke table.
//
// Columns come from ../columns.tsx and are user-selectable. Filtering lives in
// the page toolbar (server-backed), so no column renders its own filter
// control — a per-column filter here could only ever filter the current page.

import { MoreHorizontal } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { cn } from "@/lib/utils";
import { LIST_VIEW_PAGE_SIZES } from "@/lib/list-views/defaults";
import { BROWSE_COLUMNS, relativeTime } from "../columns";
import type { AgentBrowseRow } from "../types";

interface Props {
  rows: AgentBrowseRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: "updated" | "created" | "name" | "category";
  direction: "asc" | "desc";
  isLoading: boolean;
  isFetching: boolean;
  density: "compact" | "comfortable";
  showSharedColumns: boolean;
  hiddenColumns: string[];
  menuFor: (row: AgentBrowseRow) => () => ItemMenuConfig;
  onQueryChange: (next: {
    page: number;
    pageSize: number;
    sort: Props["sort"];
    direction: "asc" | "desc";
  }) => void;
  emptyAction?: React.ReactNode;
}

const SERVER_SORTABLE = new Set(["updated", "created", "name", "category"]);

export function AgentBrowseTable({
  rows,
  total,
  page,
  pageSize,
  sort,
  direction,
  isLoading,
  isFetching,
  density,
  showSharedColumns,
  hiddenColumns,
  menuFor,
  onQueryChange,
  emptyAction,
}: Props) {
  const columns: MatrxColumnDef<AgentBrowseRow>[] = BROWSE_COLUMNS.filter(
    (spec) =>
      (showSharedColumns || !spec.scopedToShared) &&
      !hiddenColumns.includes(spec.id),
  ).map((spec) => ({
    ...spec.column,
    // Only the four keys the RPC can order by are clickable-to-sort. A header
    // that sorts one page and calls it "sorted by Name" is worse than a header
    // that does not sort at all.
    sortable: SERVER_SORTABLE.has(spec.id)
      ? spec.column.sortable !== false
      : false,
  }));

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
          columnFilters: {},
          sort: { id: sort, direction },
        },
        onStateChange: (next) => {
          const nextSortId =
            next.sort && SERVER_SORTABLE.has(next.sort.id) ? next.sort.id : sort;
          onQueryChange({
            page: next.page,
            pageSize: next.pageSize,
            sort: nextSortId as Props["sort"],
            direction: next.sort?.direction ?? direction,
          });
        },
      }}
      // The page owns search and every filter; a second search box inside the
      // table would be two affordances fighting over one query.
      toolbar={{ search: false }}
      detail={{ enabled: false }}
      window={{ enabled: false }}
      rowActions={(row) => (
        <ItemMenu config={menuFor(row)} align="end">
          <button
            type="button"
            aria-label={`Actions for ${row.name}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </ItemMenu>
      )}
      copy={{
        label: "Agent",
        listLabel: "Agents",
        location: "/agents/browse",
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
