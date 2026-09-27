// features/spatial/boards/listService.ts
//
// The /board/all list over the person's own boards (scope `mine`). A person
// holds a handful of boards, so the whole set is read COMPLETELY
// (`listBoards` → `readAllRows`) and search, sort and paging run over all of
// it (`createMemoryListService`). The corpus is read fresh on every refresh
// — page and counts asked in the same tick share one read — so a rename,
// copy or delete shows the moment the list refreshes.

import type { EntityListService } from "@/lib/entity-list/config";
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
  load: () => Promise<BoardListRow[]> = listBoards,
): EntityListService<BoardListRow> {
  let inFlight: Promise<BoardListRow[]> | null = null;
  const shared = () => {
    if (!inFlight) {
      const read = load();
      inFlight = read;
      // Release after this tick's callers have joined, so the next refresh reads again.
      read.then(
        () => queueMicrotask(() => (inFlight = null)),
        () => (inFlight = null),
      );
    }
    return inFlight;
  };
  const fresh = () =>
    createMemoryListService<BoardListRow>({ load: shared, fields: FIELDS, scope: "mine", defaultSort: "updated_at" });
  return {
    fetchPage: (query, sort) => fresh().fetchPage(query, sort),
    fetchCounts: (query) => fresh().fetchCounts(query),
    fetchFacets: (query) => fresh().fetchFacets(query),
  };
}
