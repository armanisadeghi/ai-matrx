// lib/redux/slices/markdownSamples/slice.ts
// Redux slice for the admin Markdown Tester sample library.
// Simple normalized state (byId + allIds), four thunks for CRUD.
// Lives here (not next to the component) because doctrine requires
// createSlice calls in lib/redux/** or features/*/redux/**.

"use client";

import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  createSample,
  deleteSample,
  listSamples,
  updateSample,
  type MarkdownSample,
  type SampleCreateInput,
  type SampleUpdateInput,
} from "@/components/admin/markdown-tester/samples-service";

export interface MarkdownSamplesState {
  byId: Record<string, MarkdownSample>;
  allIds: string[];
  listStatus: "idle" | "loading" | "succeeded" | "failed";
  listError: string | null;
  mutatingIds: string[];
}

const initialState: MarkdownSamplesState = {
  byId: {},
  allIds: [],
  listStatus: "idle",
  listError: null,
  mutatingIds: [],
};

export const fetchMarkdownSamples = createAsyncThunk<MarkdownSample[]>(
  "markdownSamples/fetchAll",
  async () => {
    return await listSamples();
  },
);

export const createMarkdownSample = createAsyncThunk<
  MarkdownSample,
  SampleCreateInput
>("markdownSamples/create", async (input) => {
  return await createSample(input);
});

export const updateMarkdownSample = createAsyncThunk<
  MarkdownSample,
  { id: string; patch: SampleUpdateInput }
>("markdownSamples/update", async ({ id, patch }) => {
  return await updateSample(id, patch);
});

export const deleteMarkdownSample = createAsyncThunk<string, string>(
  "markdownSamples/delete",
  async (id) => {
    await deleteSample(id);
    return id;
  },
);

const markdownSamplesSlice = createSlice({
  name: "markdownSamples",
  initialState,
  reducers: {
    resetMarkdownSamples() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMarkdownSamples.pending, (state) => {
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchMarkdownSamples.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        state.byId = {};
        state.allIds = [];
        for (const sample of action.payload) {
          state.byId[sample.id] = sample;
          state.allIds.push(sample.id);
        }
      })
      .addCase(fetchMarkdownSamples.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.error.message ?? "Failed to load samples";
      });

    builder.addCase(
      createMarkdownSample.fulfilled,
      (state, action: PayloadAction<MarkdownSample>) => {
        const sample = action.payload;
        if (!state.byId[sample.id]) {
          state.allIds.unshift(sample.id);
        }
        state.byId[sample.id] = sample;
      },
    );

    builder
      .addCase(updateMarkdownSample.pending, (state, action) => {
        const id = action.meta.arg.id;
        if (!state.mutatingIds.includes(id)) state.mutatingIds.push(id);
      })
      .addCase(updateMarkdownSample.fulfilled, (state, action) => {
        const sample = action.payload;
        state.byId[sample.id] = sample;
        state.mutatingIds = state.mutatingIds.filter((id) => id !== sample.id);
        const currentIndex = state.allIds.indexOf(sample.id);
        if (currentIndex > 0) {
          state.allIds.splice(currentIndex, 1);
          state.allIds.unshift(sample.id);
        }
      })
      .addCase(updateMarkdownSample.rejected, (state, action) => {
        const id = action.meta.arg.id;
        state.mutatingIds = state.mutatingIds.filter((x) => x !== id);
      });

    builder
      .addCase(deleteMarkdownSample.pending, (state, action) => {
        const id = action.meta.arg;
        if (!state.mutatingIds.includes(id)) state.mutatingIds.push(id);
      })
      .addCase(deleteMarkdownSample.fulfilled, (state, action) => {
        const id = action.payload;
        delete state.byId[id];
        state.allIds = state.allIds.filter((x) => x !== id);
        state.mutatingIds = state.mutatingIds.filter((x) => x !== id);
      })
      .addCase(deleteMarkdownSample.rejected, (state, action) => {
        const id = action.meta.arg;
        state.mutatingIds = state.mutatingIds.filter((x) => x !== id);
      });
  },
});

export const { resetMarkdownSamples } = markdownSamplesSlice.actions;
export default markdownSamplesSlice.reducer;
