"use client";

// features/agents/browse/columns.tsx
//
// EVERY column the row can show, declared once.
//
// APP POLICY: every column sorts AND filters. No exceptions. Both are served by
// agx_list_scoped, so they apply to the whole result set, never to the loaded
// page. Where a column has a finite value set (category, visibility, access,
// version, org, owner, favorite, archived) the filter offers real OPTIONS with
// counts from `agx_list_facets` — not a bare text box.
//
// Sorting is on the DATABASE column, never on the rendered cell. That is why a
// favorite star inside the Name cell cannot disturb alphabetical order, and why
// Favorite is its own sortable column rather than a decoration on Name.
//
// `defaultHidden` is a starting point, never a restriction — anything here is
// one click away in the column picker, and the choice is persisted per user.

import Link from "next/link";
import { Star, Archive, Building2 } from "lucide-react";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import type { AgentBrowseRow } from "./types";

export interface BrowseColumnSpec {
  id: string;
  label: string;
  /** Off until the user turns it on. */
  defaultHidden?: boolean;
  /** Only meaningful outside the "mine" scope (owner/org/access). */
  scopedToShared?: boolean;
  /** Never hideable — the row needs something to identify it by. */
  locked?: boolean;
  /** Facet kind that supplies this column's filter options, when finite. */
  facet?: string;
  column: MatrxColumnDef<AgentBrowseRow>;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function timeCell(iso: string | null) {
  if (!iso) return <Muted>—</Muted>;
  return (
    <span
      className="tabular-nums text-muted-foreground"
      title={new Date(iso).toLocaleString()}
    >
      {relativeTime(iso)}
    </span>
  );
}

export const BROWSE_COLUMNS: BrowseColumnSpec[] = [
  {
    id: "name",
    label: "Name",
    locked: true,
    column: {
      id: "name",
      accessorKey: "name",
      header: "Name",
      filter: "text",
      editable: "string",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.is_archived && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
              <Archive className="mr-1 h-2.5 w-2.5" />
              Archived
            </Badge>
          )}
        </div>
      ),
    },
  },
  {
    id: "description",
    label: "Description",
    column: {
      id: "description",
      accessorKey: "description",
      header: "Description",
      filter: "text",
      editable: "string",
      cell: (row) => (
        <span className="line-clamp-1 text-muted-foreground">
          {row.description || "—"}
        </span>
      ),
    },
  },
  {
    id: "category",
    label: "Category",
    facet: "category",
    column: {
      id: "category",
      accessorKey: "category",
      header: "Category",
      filter: "select",
      editable: "select",
      width: 160,
      cell: (row) =>
        row.category ? (
          <Badge variant="secondary" className="py-0 text-[10px] font-normal">
            {row.category}
          </Badge>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "tags",
    label: "Tags",
    facet: "tag",
    column: {
      id: "tags",
      accessorKey: "tags",
      header: "Tags",
      filter: "select",
      editable: "tags",
      width: 190,
      cell: (row) =>
        row.tags?.length ? (
          // nowrap: wrapping tags made one row three times the height of its
          // neighbours and broke the scan line down the table.
          <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
            {row.tags.slice(0, 2).map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="max-w-[84px] shrink-0 truncate py-0 text-[10px] font-normal"
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
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "favorite",
    label: "Favorite",
    facet: "favorite",
    defaultHidden: true,
    column: {
      id: "favorite",
      accessorKey: "is_favorite",
      header: "Fav",
      filter: "boolean",
      width: 64,
      align: "center",
      cell: (row) =>
        row.is_favorite ? (
          <Star className="mx-auto h-3.5 w-3.5 fill-amber-400 text-amber-500" />
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "organization_name",
    label: "Organization",
    scopedToShared: true,
    facet: "organization_name",
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      filter: "text",
      width: 170,
      cell: (row) =>
        row.organization_name ? (
          <span className="flex items-center gap-1.5 truncate text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            {row.organization_name}
          </span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "owner_email",
    label: "Owner",
    scopedToShared: true,
    facet: "owner_email",
    column: {
      id: "owner_email",
      accessorKey: "owner_email",
      header: "Owner",
      filter: "text",
      width: 190,
      cell: (row) => (
        <span className="truncate text-muted-foreground">
          {row.owner_email ?? "—"}
        </span>
      ),
    },
  },
  {
    id: "access_level",
    label: "Access",
    scopedToShared: true,
    facet: "access_level",
    column: {
      id: "access_level",
      accessorKey: "access_level",
      header: "Access",
      filter: "select",
      width: 110,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10px] capitalize">
          {row.access_level}
        </Badge>
      ),
    },
  },
  {
    id: "updated",
    label: "Updated",
    column: {
      id: "updated",
      accessorKey: "updated_at",
      header: "Updated",
      filter: false, // dates filter by range in the panel, not by value list
      width: 120,
      align: "right",
      cell: (row) => timeCell(row.updated_at),
    },
  },
  // ── Off by default. Present, one click away, never a code change. ────────
  {
    id: "created",
    label: "Created",
    defaultHidden: true,
    column: {
      id: "created",
      accessorKey: "created_at",
      header: "Created",
      filter: false,
      width: 120,
      align: "right",
      cell: (row) => timeCell(row.created_at),
    },
  },
  {
    id: "version",
    label: "Version",
    defaultHidden: true,
    facet: "version",
    column: {
      id: "version",
      accessorKey: "version",
      header: "Ver",
      filter: "select",
      width: 80,
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          v{row.version ?? 1}
        </span>
      ),
    },
  },
  {
    id: "visibility",
    label: "Visibility",
    defaultHidden: true,
    facet: "visibility",
    column: {
      id: "visibility",
      accessorKey: "visibility",
      header: "Visibility",
      filter: "select",
      width: 120,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10px] capitalize">
          {row.visibility}
        </Badge>
      ),
    },
  },
  {
    id: "archived",
    label: "Archived",
    defaultHidden: true,
    facet: "archived",
    column: {
      id: "archived",
      accessorKey: "is_archived",
      header: "Archived",
      filter: "boolean",
      width: 90,
      align: "center",
      cell: (row) =>
        row.is_archived ? (
          <Archive className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
];

/** Column ids hidden by default — the initial `hiddenColumns` for a new user. */
export const DEFAULT_HIDDEN_COLUMNS = BROWSE_COLUMNS.filter(
  (c) => c.defaultHidden,
).map((c) => c.id);

/** Columns the user can edit inline. Used to build the save payload. */
export const EDITABLE_COLUMN_IDS = BROWSE_COLUMNS.filter(
  (c) => c.column.editable,
).map((c) => c.id);
