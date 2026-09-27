"use client";

// features/spatial/boards/listConfig.tsx — /board/all on the canonical
// entity-list shell.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { boardHref, renameBoard, type BoardListRow } from "../persistence/boardsService";
import { BOARD_COLUMNS } from "./columns";
import { BOARD_LIST_SCOPES, createBoardListService } from "./listService";
import { useBoardRowActions } from "./useBoardRowActions";

export const boardListConfig: EntityListConfig<BoardListRow> = {
  surfaceKey: "spatial-boards-browse",
  registryToken: "spatial_board",
  entityLabel: { singular: "board", plural: "boards" },
  // SourceFeature is a closed registry with no board member yet; the board is
  // the spatial canvas, so it attributes to "canvas".
  sourceFeature: "canvas",
  scopes: [...BOARD_LIST_SCOPES],
  service: createBoardListService(),
  columns: BOARD_COLUMNS,
  prefsVersion: 1,
  prefsDefaults: { sort: "updated_at", direction: "desc" },
  getRowId: (row) => row.id,
  getRowName: (row) => row.title,
  getRowEntity: (row) => ({ type: "spatial_board", id: row.id, title: row.title }),
  door: { hrefFor: boardHref },
  useRowActions: useBoardRowActions,
  edit: {
    save: async (row, edit) => {
      if (typeof edit.title === "string") await renameBoard(row.id, edit.title);
    },
  },
  // The table has no archive columns: a board is live or deleted.
  supportsArchived: false,
  facetSections: [],
  searchPlaceholder: "Search boards by name…",
  copy: {
    label: "Board",
    listLabel: "Boards",
    location: "/board/all",
    rowKind: "board",
    listKind: "board-list",
    humanRow: (row) =>
      `${row.title}${row.is_home ? " (home)" : ""} — ${row.tile_count} tiles, edited ${formatRelativeTime(row.updated_at)}`,
    showRow: false,
    showToolbar: false,
  },
  emptyState: {
    title: "No boards yet",
    description:
      "A board is an open space where you keep chats, notes, files and tasks side by side. Make one and drop things onto it.",
  },
};
