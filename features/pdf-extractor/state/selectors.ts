import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/rootReducer";
import {
  DEFAULT_PER_DOC,
  type ChunksCacheEntry,
  type ChunksFetchStatus,
  type PaneKey,
  type PerDocUi,
  type SidebarView,
} from "./types";

const EMPTY_CHUNKS_ENTRY: ChunksCacheEntry = {
  status: "idle",
  rows: [],
  total: 0,
  error: null,
  fetchedAt: 0,
};

const root = (s: RootState) => s.pdfStudio;

export const selectActiveDocId = (s: RootState) => s.pdfStudio.activeDocId;
export const selectActivePage = (s: RootState) => s.pdfStudio.activePage;
export const selectPendingScrollPage = (s: RootState) =>
  s.pdfStudio.pendingScrollPage;
export const selectScrollSource = (s: RootState) => s.pdfStudio.scrollSource;

const selectPerDocMap = (s: RootState) => s.pdfStudio.perDoc;
const selectDefaultPerDoc = (s: RootState) => s.pdfStudio.defaultPerDoc;

export const selectPerDocForActive = createSelector(
  [selectActiveDocId, selectPerDocMap, selectDefaultPerDoc],
  (docId, map, fallback): PerDocUi =>
    (docId && map[docId]) || fallback || DEFAULT_PER_DOC,
);

export const selectVisiblePanesForActiveDoc = createSelector(
  [selectPerDocForActive],
  (per): PaneKey[] => per.visiblePanes,
);

export const makeSelectIsPaneVisible = (pane: PaneKey) =>
  createSelector(
    [selectVisiblePanesForActiveDoc],
    (panes) => panes.includes(pane),
  );

export const selectSidebarView = createSelector(
  [selectPerDocForActive],
  (per): SidebarView => per.sidebarView,
);

const selectChunksMap = (s: RootState) => s.pdfStudio.chunks;

export const selectChunksForActivePage = createSelector(
  [selectActiveDocId, selectActivePage, selectChunksMap],
  (docId, page, map): ChunksCacheEntry => {
    if (!docId || page == null) return EMPTY_CHUNKS_ENTRY;
    return map[docId]?.[page] ?? EMPTY_CHUNKS_ENTRY;
  },
);

export const selectChunksStatusForActivePage = createSelector(
  [selectChunksForActivePage],
  (entry): ChunksFetchStatus => entry.status,
);

export const selectChunksRowsForActivePage = createSelector(
  [selectChunksForActivePage],
  (entry) => entry.rows,
);

export const selectChunksTotalForActivePage = createSelector(
  [selectChunksForActivePage],
  (entry) => entry.total,
);

export const selectChunksErrorForActivePage = createSelector(
  [selectChunksForActivePage],
  (entry) => entry.error,
);

export const makeSelectChunksForDocPage = (
  docId: string | null,
  pageNumber: number | null,
) =>
  createSelector([selectChunksMap], (map): ChunksCacheEntry => {
    if (!docId || pageNumber == null) return EMPTY_CHUNKS_ENTRY;
    return map[docId]?.[pageNumber] ?? EMPTY_CHUNKS_ENTRY;
  });
