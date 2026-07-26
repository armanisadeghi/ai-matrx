"use client";

// features/agents/browse/columns.tsx
//
// EVERY column the row can show, declared once. The table is deliberately
// un-opinionated: it does not decide what matters to you, it ships a sensible
// default set and lets you turn any of the rest on.
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
      filter: false,
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
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
      sortable: false,
      filter: false,
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
    column: {
      id: "category",
      accessorKey: "category",
      header: "Category",
      filter: false,
      width: 150,
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
    column: {
      id: "tags",
      header: "Tags",
      sortable: false,
      filter: false,
      width: 180,
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
    id: "organization_name",
    label: "Organization",
    scopedToShared: true,
    column: {
      id: "organization_name",
      accessorKey: "organization_name",
      header: "Organization",
      sortable: false,
      filter: false,
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
    column: {
      id: "owner_email",
      accessorKey: "owner_email",
      header: "Owner",
      sortable: false,
      filter: false,
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
    column: {
      id: "access_level",
      accessorKey: "access_level",
      header: "Access",
      sortable: false,
      filter: false,
      width: 100,
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
      filter: false,
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
    column: {
      id: "version",
      accessorKey: "version",
      header: "Ver",
      sortable: false,
      filter: false,
      width: 70,
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
    column: {
      id: "visibility",
      accessorKey: "visibility",
      header: "Visibility",
      sortable: false,
      filter: false,
      width: 110,
      cell: (row) => (
        <Badge variant="outline" className="py-0 text-[10px] capitalize">
          {row.visibility}
        </Badge>
      ),
    },
  },
  {
    id: "favorite",
    label: "Favorite",
    defaultHidden: true,
    column: {
      id: "favorite",
      accessorKey: "is_favorite",
      header: "Fav",
      sortable: false,
      filter: false,
      width: 60,
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
    id: "id",
    label: "Agent ID",
    defaultHidden: true,
    column: {
      id: "id",
      accessorKey: "id",
      header: "ID",
      sortable: false,
      filter: false,
      cellKind: "uuid",
      width: 130,
    },
  },
];

/** Column ids hidden by default — the initial `hiddenColumns` for a new user. */
export const DEFAULT_HIDDEN_COLUMNS = BROWSE_COLUMNS.filter(
  (c) => c.defaultHidden,
).map((c) => c.id);
