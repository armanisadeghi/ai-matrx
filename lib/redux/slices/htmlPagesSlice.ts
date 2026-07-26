// lib/redux/slices/htmlPagesSlice.ts
//
// HTML editor session state and page catalog.
//
// Responsibilities:
//   - Maintains the list of a user's published HTML pages fetched from /api/html-pages
//   - Tracks the currently active page ID (open in the editor overlay)
//   - Per-page operation status for optimistic UI feedback
//
// NOT responsible for:
//   - Artifact tracking (that's artifactsSlice)
//   - Editor local state (that stays in useHtmlPreviewState hook)

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { HtmlPageRecord } from "@/features/artifacts/types";

// ── State shape ───────────────────────────────────────────────────────────────

export type HtmlPageOpStatus = "loading" | "succeeded" | "failed";
export type HtmlPageListStatus = "idle" | "loading" | "succeeded" | "failed";

export interface HtmlPagesState {
  // Page catalog: keyed by page id
  pages: Record<string, HtmlPageRecord>;
  // Sorted page IDs (by updatedAt / createdAt desc)
  pageOrder: string[];
  // List fetch status
  listStatus: HtmlPageListStatus;
  listError: string | null;
  // Currently active page in the editor (null when no overlay open)
  activePageId: string | null;
  // Per-page operation status (create/update/delete)
  operationStatus: Record<string, HtmlPageOpStatus>;
}

const initialState: HtmlPagesState = {
  pages: {},
  pageOrder: [],
  listStatus: "idle",
  listError: null,
  activePageId: null,
  operationStatus: {},
};

// ── Slice ─────────────────────────────────────────────────────────────────────

const htmlPagesSlice = createSlice({
  name: "htmlPages",
  initialState,
  reducers: {
    /**
     * Insert or update a single page record.
     * Moves it to the front of pageOrder (most recently touched).
     */
    upsertPage(state, action: PayloadAction<HtmlPageRecord>) {
      const page = action.payload;
      state.pages[page.id] = page;
      state.pageOrder = [
        page.id,
        ...state.pageOrder.filter((id) => id !== page.id),
      ];
    },

    /**
     * Replace the full page list (called after fetchUserPages resolves).
     */
    setPages(state, action: PayloadAction<HtmlPageRecord[]>) {
      state.pages = {};
      state.pageOrder = [];
      for (const page of action.payload) {
        state.pages[page.id] = page;
        state.pageOrder.push(page.id);
      }
    },

    /**
     * Remove a page record (called after delete succeeds).
     */
    removePage(state, action: PayloadAction<string>) {
      const id = action.payload;
      delete state.pages[id];
      state.pageOrder = state.pageOrder.filter((i) => i !== id);
      delete state.operationStatus[id];
      if (state.activePageId === id) {
        state.activePageId = null;
      }
    },

    setListStatus(
      state,
      action: PayloadAction<{ status: HtmlPageListStatus; error?: string }>,
    ) {
      state.listStatus = action.payload.status;
      state.listError = action.payload.error ?? null;
    },

    /**
     * Set the currently active page ID.
     * Called when the HTML editor overlay opens for a known page.
     */
    setActivePageId(state, action: PayloadAction<string | null>) {
      state.activePageId = action.payload;
    },

    setPageOperationStatus(
      state,
      action: PayloadAction<{ id: string; status: HtmlPageOpStatus }>,
    ) {
      state.operationStatus[action.payload.id] = action.payload.status;
    },

    clearPageOperationStatus(state, action: PayloadAction<string>) {
      delete state.operationStatus[action.payload];
    },

    /** Reset — for sign-out. */
    clearHtmlPages() {
      return initialState;
    },
  },
});

export const {
  upsertPage,
  setPages,
  removePage,
  setListStatus,
  setActivePageId,
  setPageOperationStatus,
  clearPageOperationStatus,
  clearHtmlPages,
} = htmlPagesSlice.actions;

export default htmlPagesSlice.reducer;

// ── Base selectors ────────────────────────────────────────────────────────────

type WithHtmlPages = { htmlPages: HtmlPagesState };

export const selectHtmlPagesState = (state: WithHtmlPages): HtmlPagesState =>
  state.htmlPages;

export const selectHtmlPagesById = (
  state: WithHtmlPages,
): Record<string, HtmlPageRecord> => state.htmlPages.pages;

export const selectHtmlPageOrder = (state: WithHtmlPages): string[] =>
  state.htmlPages.pageOrder;

export const selectHtmlPageListStatus = (
  state: WithHtmlPages,
): HtmlPageListStatus => state.htmlPages.listStatus;

export const selectHtmlPageListError = (state: WithHtmlPages): string | null =>
  state.htmlPages.listError;

export const selectActivePageId = (state: WithHtmlPages): string | null =>
  state.htmlPages.activePageId;

export const selectHtmlPageOpStatus = (
  state: WithHtmlPages,
  id: string,
): HtmlPageOpStatus | undefined => state.htmlPages.operationStatus[id];

// Re-export for convenience
export type { HtmlPageRecord };
