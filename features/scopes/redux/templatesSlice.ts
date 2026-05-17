// features/scopes/redux/templatesSlice.ts
//
// Read-only catalog of templates. Long TTL, rarely changes. Loaded the
// first time someone opens the templates gallery, then served from cache
// until the user explicitly refreshes.

import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ContextTemplate } from "@/features/scopes/types";

export interface TemplatesState {
  status: "idle" | "loading" | "ready" | "error";
  templates: ContextTemplate[];
  fetchedAt: number | null;
  error: string | null;
}

const initialState: TemplatesState = {
  status: "idle",
  templates: [],
  fetchedAt: null,
  error: null,
};

const templatesSlice = createSlice({
  name: "scopeTemplates",
  initialState,
  reducers: {
    templatesFetchPending(state) {
      state.status = "loading";
      state.error = null;
    },
    templatesFetchFulfilled(state, action: PayloadAction<ContextTemplate[]>) {
      state.status = "ready";
      state.templates = action.payload;
      state.fetchedAt = Date.now();
      state.error = null;
    },
    templatesFetchRejected(state, action: PayloadAction<string>) {
      state.status = "error";
      state.error = action.payload;
    },
    templatesReset: () => initialState,
  },
});

export const templatesActions = templatesSlice.actions;
export default templatesSlice.reducer;
