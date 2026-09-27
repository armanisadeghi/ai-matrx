"use client";

// features/spatial/boards/columns.tsx — the /board/all column registry.
// Plain words: "Tiles", never "nodes".

import { Badge } from "@/components/ui/badge";
import { DATE_SORT_WORDS, timeCell, Muted, type EntityColumnSpec } from "@/lib/entity-list/columns";
import { boardHref, type BoardListRow } from "../persistence/boardsService";

export const BOARD_COLUMNS: EntityColumnSpec<BoardListRow>[] = [
  {
    id: "title",
    label: "Name",
    locked: true,
    column: {
      id: "title",
      accessorKey: "title",
      header: "Name",
      filter: "text",
      // THE DOOR LAW: the name is a real link (keyboard, new tab).
      href: boardHref,
      editable: "string",
      editTrigger: "pencil",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.title}</span>
          {row.is_home && (
            <Badge variant="outline" className="shrink-0 py-0 text-[10px]">
              Home
            </Badge>
          )}
        </div>
      ),
    },
  },
  {
    id: "tile_count",
    label: "Tiles",
    sortWords: { asc: "fewest first", desc: "most first" },
    column: {
      id: "tile_count",
      accessorKey: "tile_count",
      header: "Tiles",
      filter: false,
      cell: (row) => <span className="tabular-nums">{row.tile_count}</span>,
    },
  },
  {
    id: "updated_at",
    label: "Last edited",
    sortWords: DATE_SORT_WORDS,
    column: {
      id: "updated_at",
      accessorKey: "updated_at",
      header: "Last edited",
      filter: false,
      cell: (row) => timeCell(row.updated_at),
    },
  },
  {
    id: "last_opened_at",
    label: "Last opened",
    sortWords: DATE_SORT_WORDS,
    column: {
      id: "last_opened_at",
      accessorKey: "last_opened_at",
      header: "Last opened",
      filter: false,
      cell: (row) => (row.last_opened_at ? timeCell(row.last_opened_at) : <Muted>Never</Muted>),
    },
  },
  {
    id: "created_at",
    label: "Created",
    defaultHidden: true,
    sortWords: DATE_SORT_WORDS,
    column: {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created",
      filter: false,
      cell: (row) => timeCell(row.created_at),
    },
  },
];
