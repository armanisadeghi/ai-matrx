import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  DEFAULT_PER_DOC,
  type ApiChunkRow,
  type EditMode,
  type PaneKey,
  type PdfStudioState,
  type PerDocUi,
  type SidebarView,
} from "./types";

const initialState: PdfStudioState = {
  activeDocId: null,
  activePage: null,
  pendingScrollPage: null,
  scrollSource: null,

  perDoc: {},
  defaultPerDoc: DEFAULT_PER_DOC,

  chunks: {},
};

function ensureDocEntry(state: PdfStudioState, docId: string): PerDocUi {
  if (!state.perDoc[docId]) {
    state.perDoc[docId] = { ...state.defaultPerDoc };
  }
  return state.perDoc[docId];
}

const pdfStudioSlice = createSlice({
  name: "pdfStudio",
  initialState,
  reducers: {
    setActiveDocId(state, action: PayloadAction<string | null>) {
      state.activeDocId = action.payload;
      state.activePage = null;
      state.pendingScrollPage = null;
      state.scrollSource = null;
      if (action.payload) ensureDocEntry(state, action.payload);
    },
    clearActiveDoc(state) {
      state.activeDocId = null;
      state.activePage = null;
      state.pendingScrollPage = null;
      state.scrollSource = null;
    },
    setActivePage(state, action: PayloadAction<number | null>) {
      state.activePage = action.payload;
    },
    setPendingScrollPage(state, action: PayloadAction<number | null>) {
      state.pendingScrollPage = action.payload;
    },
    clearPendingScroll(state) {
      state.pendingScrollPage = null;
    },
    setScrollSource(state, action: PayloadAction<PaneKey | null>) {
      state.scrollSource = action.payload;
    },

    togglePane(state, action: PayloadAction<PaneKey>) {
      const docId = state.activeDocId;
      if (!docId) return;
      const entry = ensureDocEntry(state, docId);
      const idx = entry.visiblePanes.indexOf(action.payload);
      if (idx === -1) {
        entry.visiblePanes.push(action.payload);
      } else {
        if (entry.visiblePanes.length <= 1) return;
        entry.visiblePanes.splice(idx, 1);
      }
    },
    setVisiblePanes(state, action: PayloadAction<PaneKey[]>) {
      const docId = state.activeDocId;
      if (!docId) return;
      const entry = ensureDocEntry(state, docId);
      entry.visiblePanes = action.payload.length > 0
        ? action.payload
        : ["pdf"];
    },
    setSidebarView(state, action: PayloadAction<SidebarView>) {
      const docId = state.activeDocId;
      if (!docId) return;
      ensureDocEntry(state, docId).sidebarView = action.payload;
    },

    hydratePerDocFromStorage(
      state,
      action: PayloadAction<{ docId: string; entry: PerDocUi }>,
    ) {
      state.perDoc[action.payload.docId] = action.payload.entry;
    },

    chunksFetchStart(
      state,
      action: PayloadAction<{ docId: string; pageNumber: number }>,
    ) {
      const { docId, pageNumber } = action.payload;
      if (!state.chunks[docId]) state.chunks[docId] = {};
      const existing = state.chunks[docId][pageNumber];
      state.chunks[docId][pageNumber] = {
        status: "loading",
        rows: existing?.rows ?? [],
        total: existing?.total ?? 0,
        error: null,
        fetchedAt: existing?.fetchedAt ?? 0,
      };
    },
    chunksFetchSuccess(
      state,
      action: PayloadAction<{
        docId: string;
        pageNumber: number;
        rows: ApiChunkRow[];
        total: number;
      }>,
    ) {
      const { docId, pageNumber, rows, total } = action.payload;
      if (!state.chunks[docId]) state.chunks[docId] = {};
      state.chunks[docId][pageNumber] = {
        status: "ready",
        rows,
        total,
        error: null,
        fetchedAt: Date.now(),
      };
    },
    chunksFetchError(
      state,
      action: PayloadAction<{
        docId: string;
        pageNumber: number;
        error: string;
      }>,
    ) {
      const { docId, pageNumber, error } = action.payload;
      if (!state.chunks[docId]) state.chunks[docId] = {};
      state.chunks[docId][pageNumber] = {
        status: "error",
        rows: [],
        total: 0,
        error,
        fetchedAt: Date.now(),
      };
    },
    chunksInvalidateDoc(state, action: PayloadAction<string>) {
      delete state.chunks[action.payload];
    },
  },
});

export const {
  setActiveDocId,
  clearActiveDoc,
  setActivePage,
  setPendingScrollPage,
  clearPendingScroll,
  setScrollSource,
  togglePane,
  setVisiblePanes,
  setSidebarView,
  hydratePerDocFromStorage,
  chunksFetchStart,
  chunksFetchSuccess,
  chunksFetchError,
  chunksInvalidateDoc,
} = pdfStudioSlice.actions;

export const pdfStudioReducer = pdfStudioSlice.reducer;
export default pdfStudioSlice.reducer;
