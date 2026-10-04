// features/board/boards/listService.ts
//
// The /board/all list over the person's own boards (scope `mine`). A person
// holds a handful of boards, so the whole set is read COMPLETELY
// (`listBoards` → `readAllRows`) and search, sort and paging run over all of
// it (`createMemoryListService`). The corpus is read fresh on every refresh
// — page and counts asked in the same tick share one read — so a rename,
// copy or delete shows the moment the list refreshes.
//
// THE ARCHIVED-ITEMS LAW: the shell's Archived filter (`query.archived`) is
// passed to the read — a deleted board (`deleted_at`) is "archived" — so the
// default hides deleted boards and "Archived" shows them with Restore.

import type { EntityListService } from "@/lib/entity-list/config";
import type { ArchivedFilter } from "@/lib/entity-list/types";
import { createMemoryListService, type MemoryServiceOptions } from "@/lib/entity-list/memoryService";
import { listBoards, type BoardListRow } from "../persistence/boardsService";

export const BOARD_LIST_SCOPES = ["mine"] as const;

const FIELDS: MemoryServiceOptions<BoardListRow>["fields"] = {
  title: { value: (r) => r.title, search: true },
  tile_count: { value: (r) => r.tile_count },
  is_home: { value: (r) => r.is_home },
  updated_at: { value: (r) => r.updated_at },
  last_opened_at: { value: (r) => r.last_opened_at },
  created_at: { value: (r) => r.created_at },
};

export function createBoardListService(
  load: (archived: ArchivedFilter) => Promise<BoardListRow[]> = listBoards,
): EntityListService<BoardListRow> {
  // One read per Archived value per tick (the shell's all-archived probe asks
  // "archived" in the same tick as the page asks "active").
  const inFlight = new Map<ArchivedFilter, Promise<BoardListRow[]>>();
  const shared = (archived: ArchivedFilter) => {
    let read = inFlight.get(archived);
    if (!read) {
      read = load(archived);
      inFlight.set(archived, read);
      // Release after this tick's callers have joined, so the next refresh reads again.
      read.then(
        () => queueMicrotask(() => inFlight.delete(archived)),
        () => inFlight.delete(archived),
      );
    }
    return read;
  };
  const fresh = (archived: ArchivedFilter) =>
    createMemoryListService<BoardListRow>({
      load: () => shared(archived),
      fields: FIELDS,
      scope: "mine",
      defaultSort: "updated_at",
    });
  return {
    fetchPage: (query, sort) => fresh(query.archived).fetchPage(query, sort),
    fetchCounts: (query) => fresh(query.archived).fetchCounts(query),
    fetchFacets: (query) => fresh(query.archived).fetchFacets(query),
  };
}
