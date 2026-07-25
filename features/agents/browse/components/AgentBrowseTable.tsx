"use client";

// features/agents/browse/components/AgentBrowseTable.tsx
//
// The default view. Built on the canonical MatrxDataTable (sticky header,
// zebra, side panel, row window, copy-for-AI) in CONTROLLED mode: the table
// owns none of the querying, so sort and pagination are real server operations
// over the whole result set — not a re-sort of whatever page happened to load.
//
// That distinction is the entire bug in /transcripts' bespoke table: it sorts
// and filters only the rows already paged in, so "sort by Name" shows page 1 of
// each section rather than the true A→Z.
//
// A column whose filter cannot be served by agx_list_scoped is declared
// `filter: false` rather than rendering a control that quietly does nothing.

import Link from "next/link";
import { Star, Archive, MoreHorizontal, Building2 } from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { ItemMenu } from "@/components/official/item/ItemMenu";
import type { ItemMenuConfig } from "@/components/official/item/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  showOrgColumn: boolean;
  showOwnerColumn: boolean;
  hiddenColumns: string[];
  menuFor: (row: AgentBrowseRow) => () => ItemMenuConfig;
  onQueryChange: (next: {
    page: number;
    pageSize: number;
    sort: "updated" | "created" | "name" | "category";
    direction: "asc" | "desc";
  }) => void;
  emptyAction?: React.ReactNode;
}

const SORTABLE_IDS = new Set(["updated", "created", "name", "category"]);

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

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
  showOrgColumn,
  showOwnerColumn,
  hiddenColumns,
  menuFor,
  onQueryChange,
  emptyAction,
}: Props) {
  const dense = density === "compact";

  const columns: MatrxColumnDef<AgentBrowseRow>[] = [
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: false,
      cell: (row) => (
        <div className="flex items-center gap-2 min-w-0">
          {row.is_favorite && (
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
          )}
          <Link
            href={`/agents/${row.id}/run`}
            className="truncate font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.name}
          </Link>
          {row.is_archived && (
            <Badge variant="outline" className="shrink-0 text-[10px] py-0">
              <Archive className="h-2.5 w-2.5 mr-1" />
              Archived
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      sortable: false,
      filter: false,
      hidden: hiddenColumns.includes("description"),
      cell: (row) => (
        <span className="text-muted-foreground line-clamp-1">
          {row.description || "—"}
        </span>
      ),
    },
    {
      id: "category",
      accessorKey: "category",
      header: "Category",
      // The one filter agx_list_scoped serves natively.
      filter: "select",
      width: 150,
      hidden: hiddenColumns.includes("category"),
      cell: (row) =>
        row.category ? (
          <Badge variant="secondary" className="text-[10px] py-0 font-normal">
            {row.category}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "tags",
      header: "Tags",
      sortable: false,
      filter: false,
      width: 180,
      hidden: hiddenColumns.includes("tags"),
      cell: (row) =>
        row.tags?.length ? (
          // nowrap + truncate: wrapping tags made one row three times the
          // height of its neighbours and broke the scan line down the table.
          <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
            {row.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="max-w-[80px] shrink-0 truncate text-[10px] py-0 font-normal"
                title={tag}
              >
                {tag}
              </Badge>
            ))}
            {row.tags.length > 2 && (
              <span
                className="shrink-0 text-[10px] text-muted-foreground"
                title={row.tags.join(", ")}
              >
                +{row.tags.length - 2}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    // Org + owner only appear where they carry information: inside "Mine"
    // every row has the same owner and (almost always) the same org.
    ...(showOrgColumn
      ? ([
          {
            id: "organization_name",
            accessorKey: "organization_name" as const,
            header: "Organization",
            sortable: false,
            filter: false,
            width: 170,
            cell: (row: AgentBrowseRow) =>
              row.organization_name ? (
                <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                  <Building2 className="h-3 w-3 shrink-0" />
                  {row.organization_name}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
          },
        ] satisfies MatrxColumnDef<AgentBrowseRow>[])
      : []),
    ...(showOwnerColumn
      ? ([
          {
            id: "owner_email",
            accessorKey: "owner_email" as const,
            header: "Owner",
            sortable: false,
            filter: false,
            width: 190,
            cell: (row: AgentBrowseRow) => (
              <span className="truncate text-muted-foreground">
                {row.owner_email ?? "—"}
              </span>
            ),
          },
          {
            id: "access_level",
            accessorKey: "access_level" as const,
            header: "Access",
            sortable: false,
            filter: false,
            width: 100,
            cell: (row: AgentBrowseRow) => (
              <Badge variant="outline" className="text-[10px] py-0 capitalize">
                {row.access_level}
              </Badge>
            ),
          },
        ] satisfies MatrxColumnDef<AgentBrowseRow>[])
      : []),
    {
      id: "updated",
      accessorKey: "updated_at",
      header: "Updated",
      filter: false,
      width: 120,
      align: "right",
      cell: (row) => (
        <span
          className="text-muted-foreground tabular-nums"
          title={new Date(row.updated_at).toLocaleString()}
        >
          {relativeTime(row.updated_at)}
        </span>
      ),
    },
  ];

  return (
    <MatrxDataTable<AgentBrowseRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      isLoading={isLoading}
      isFetching={isFetching}
      zebra
      className={cn(dense && "[&_td]:py-1 [&_th]:py-1 text-xs")}
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
            next.sort && SORTABLE_IDS.has(next.sort.id) ? next.sort.id : sort;
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
      detail={{ enabled: false }}
      window={{ enabled: false }}
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
        description:
          "Nothing matches this scope and filter combination.",
        action: emptyAction,
      }}
    />
  );
}
