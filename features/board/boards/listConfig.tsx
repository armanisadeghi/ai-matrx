"use client";

// features/board/boards/listConfig.tsx — /board on the canonical
// entity-list shell.

import type { EntityListConfig } from "@/lib/entity-list/config";
import { formatRelativeTime } from "@ai-matrx/kit/format";
import { BoardError, boardRowHref, renameBoard, type BoardListRow } from "../persistence/boardsService";
import { BOARD_COLUMNS } from "./columns";
import { BOARD_LIST_SCOPES, createBoardListService } from "./listService";
import { useBoardRowActions } from "./useBoardRowActions";

export const boardListConfig: EntityListConfig<BoardListRow> = {
  surfaceKey: "boards-browse",
  registryToken: "board",
  entityLabel: { singular: "board", plural: "boards" },
  // SourceFeature is a closed registry with no board member yet; the board is
  // the Board, so it attributes to "canvas".
  sourceFeature: "canvas",
  scopes: [...BOARD_LIST_SCOPES],
  service: createBoardListService(),
  columns: BOARD_COLUMNS,
  prefsVersion: 2,
  prefsDefaults: { sort: "last_opened_at", direction: "desc" },
  getRowId: (row) => row.id,
  getRowName: (row) => row.title,
  getRowEntity: (row) => ({ type: "board", id: row.id, title: row.title }),
  door: { hrefFor: boardRowHref },
  useRowActions: useBoardRowActions,
  edit: {
    save: async (row, edit) => {
      if (row.archived) {
        throw new BoardError("not_found", "This board is deleted.", "Restore it to rename it.");
      }
      if (typeof edit.title === "string") await renameBoard(row.id, edit.title);
    },
  },
  // THE ARCHIVED-ITEMS LAW: the table has no archive columns, so the Archived
  // filter is `deleted_at` (listService passes `query.archived` to the read);
  // a deleted board's row menu offers Restore.
  supportsArchived: true,
  facetSections: [],
  searchPlaceholder: "Search boards by name…",
  copy: {
    label: "Board",
    listLabel: "Boards",
    location: "/board",
    rowKind: "board",
    listKind: "board-list",
    humanRow: (row) =>
      `${row.title}${row.archived ? " (deleted)" : ""} — ${row.tile_count} tiles, edited ${formatRelativeTime(row.updated_at)}`,
  },
  emptyState: {
    title: "No boards yet",
    description:
      "A board is an open space where you keep chats, notes, files and tasks side by side. Make one and drop things onto it.",
  },
};
