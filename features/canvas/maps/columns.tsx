"use client";

// features/canvas/maps/columns.tsx
//
// Column registry for /maps. Plain words only — "Boxes" and "Arrows", never
// "nodes" and "edges": the person reading this list is an expert in their own
// field, not in diagram tooling.

import { Badge } from "@/components/ui/badge";
import { Muted, timeCell, type EntityColumnSpec } from "@/lib/entity-list/columns";
import { mapHref, type MapListRow } from "./types";

export const MAP_COLUMNS: EntityColumnSpec<MapListRow>[] = [
  {
    id: "title",
    label: "Name",
    locked: true,
    column: {
      id: "title",
      accessorKey: "title",
      header: "Name",
      filter: "text",
      // THE DOOR LAW — the name is a real link, so the row is reachable by
      // keyboard and openable in a new tab without losing this list.
      href: mapHref,
      editable: "string",
      editTrigger: "pencil",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.title}</span>
          {row.is_public && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
              Shared
            </Badge>
          )}
        </div>
      ),
    },
  },
  {
    id: "description",
    label: "Description",
    defaultHidden: true,
    column: {
      id: "description",
      accessorKey: "description",
      header: "Description",
      filter: "text",
      cell: (row) =>
        row.description ? (
          <span className="line-clamp-1">{row.description}</span>
        ) : (
          <Muted>—</Muted>
        ),
    },
  },
  {
    id: "box_count",
    label: "Boxes",
    column: {
      id: "box_count",
      accessorKey: "box_count",
      header: "Boxes",
      filter: false,
      cell: (row) => <span className="tabular-nums">{row.box_count}</span>,
    },
  },
  {
    id: "arrow_count",
    label: "Arrows",
    column: {
      id: "arrow_count",
      accessorKey: "arrow_count",
      header: "Arrows",
      filter: false,
      cell: (row) => <span className="tabular-nums">{row.arrow_count}</span>,
    },
  },
  {
    id: "updated_at",
    label: "Last edited",
    column: {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Last edited",
      filter: false,
      cell: (row) => timeCell(row.updated_at),
    },
  },
  {
    id: "created_at",
    label: "Created",
    defaultHidden: true,
    column: {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: false,
      cell: (row) => timeCell(row.created_at),
    },
  },
];
