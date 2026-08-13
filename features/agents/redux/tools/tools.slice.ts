import { createSlice } from "@reduxjs/toolkit";
import { fetchAvailableTools, fetchToolById } from "./tools.thunks";
import type { DatabaseTool } from "@/utils/supabase/tools-service";

interface ToolsSliceState {
  tools: DatabaseTool[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  /** Historical/inactive records never leak into the active picker list. */
  identityById: Record<string, DatabaseTool>;
  /** Per-record audit lookup status; independent of the active picker list. */
  lookupStatusById: Record<string, "idle" | "loading" | "succeeded" | "failed">;
}

const initialState: ToolsSliceState = {
  tools: [],
  status: "idle",
  error: null,
  identityById: {},
  lookupStatusById: {},
};

const toolsSlice = createSlice({
  name: "tools",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAvailableTools.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchAvailableTools.fulfilled, (state, action) => {
        state.tools = action.payload;
        state.status = "succeeded";
      })
      .addCase(fetchAvailableTools.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to fetch tools";
      })
      .addCase(fetchToolById.pending, (state, action) => {
        state.lookupStatusById[action.meta.arg] = "loading";
      })
      .addCase(fetchToolById.fulfilled, (state, action) => {
        state.identityById[action.payload.id] = action.payload;
        state.lookupStatusById[action.payload.id] = "succeeded";
      })
      .addCase(fetchToolById.rejected, (state, action) => {
        state.lookupStatusById[action.meta.arg] = "failed";
      });
  },
});

export default toolsSlice.reducer;
