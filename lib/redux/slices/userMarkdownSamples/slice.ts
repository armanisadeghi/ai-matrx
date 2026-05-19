// lib/redux/slices/userMarkdownSamples/slice.ts
// Redux slice for the per-user Markdown Studio samples.

"use client";

import {
  createSlice,
  createAsyncThunk,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  createUserSample,
  deleteUserSample,
  listUserSamples,
  updateUserSample,
  type UserMarkdownSample,
  type UserSampleCreateInput,
  type UserSampleUpdateInput,
} from "@/components/markdown-studio/user-samples-service";

export interface UserMarkdownSamplesState {
  byId: Record<string, UserMarkdownSample>;
  allIds: string[];
  listStatus: "idle" | "loading" | "succeeded" | "failed";
  listError: string | null;
  mutatingIds: string[];
}

const initialState: UserMarkdownSamplesState = {
  byId: {},
  allIds: [],
  listStatus: "idle",
  listError: null,
  mutatingIds: [],
};

export const fetchUserMarkdownSamples = createAsyncThunk<UserMarkdownSample[]>(
  "userMarkdownSamples/fetchAll",
  async () => {
    return await listUserSamples();
  },
);

export const createUserMarkdownSample = createAsyncThunk<
  UserMarkdownSample,
  UserSampleCreateInput
>("userMarkdownSamples/create", async (input) => {
  return await createUserSample(input);
});

export const updateUserMarkdownSample = createAsyncThunk<
  UserMarkdownSample,
  { id: string; patch: UserSampleUpdateInput }
>("userMarkdownSamples/update", async ({ id, patch }) => {
  return await updateUserSample(id, patch);
});

export const deleteUserMarkdownSample = createAsyncThunk<string, string>(
  "userMarkdownSamples/delete",
  async (id) => {
    await deleteUserSample(id);
    return id;
  },
);

const userMarkdownSamplesSlice = createSlice({
  name: "userMarkdownSamples",
  initialState,
  reducers: {
    resetUserMarkdownSamples() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserMarkdownSamples.pending, (state) => {
        state.listStatus = "loading";
        state.listError = null;
      })
      .addCase(fetchUserMarkdownSamples.fulfilled, (state, action) => {
        state.listStatus = "succeeded";
        state.byId = {};
        state.allIds = [];
        for (const sample of action.payload) {
          state.byId[sample.id] = sample;
          state.allIds.push(sample.id);
        }
      })
      .addCase(fetchUserMarkdownSamples.rejected, (state, action) => {
        state.listStatus = "failed";
        state.listError = action.error.message ?? "Failed to load samples";
      });

    builder.addCase(
      createUserMarkdownSample.fulfilled,
      (state, action: PayloadAction<UserMarkdownSample>) => {
        const sample = action.payload;
        if (!state.byId[sample.id]) state.allIds.unshift(sample.id);
        state.byId[sample.id] = sample;
      },
    );

    builder
      .addCase(updateUserMarkdownSample.pending, (state, action) => {
        const id = action.meta.arg.id;
        if (!state.mutatingIds.includes(id)) state.mutatingIds.push(id);
      })
      .addCase(updateUserMarkdownSample.fulfilled, (state, action) => {
        const sample = action.payload;
        state.byId[sample.id] = sample;
        state.mutatingIds = state.mutatingIds.filter((x) => x !== sample.id);
        const currentIndex = state.allIds.indexOf(sample.id);
        if (currentIndex > 0) {
          state.allIds.splice(currentIndex, 1);
          state.allIds.unshift(sample.id);
        }
      })
      .addCase(updateUserMarkdownSample.rejected, (state, action) => {
        const id = action.meta.arg.id;
        state.mutatingIds = state.mutatingIds.filter((x) => x !== id);
      });

    builder
      .addCase(deleteUserMarkdownSample.pending, (state, action) => {
        const id = action.meta.arg;
        if (!state.mutatingIds.includes(id)) state.mutatingIds.push(id);
      })
      .addCase(deleteUserMarkdownSample.fulfilled, (state, action) => {
        const id = action.payload;
        delete state.byId[id];
        state.allIds = state.allIds.filter((x) => x !== id);
        state.mutatingIds = state.mutatingIds.filter((x) => x !== id);
      })
      .addCase(deleteUserMarkdownSample.rejected, (state, action) => {
        const id = action.meta.arg;
        state.mutatingIds = state.mutatingIds.filter((x) => x !== id);
      });
  },
});

export const { resetUserMarkdownSamples } = userMarkdownSamplesSlice.actions;
export default userMarkdownSamplesSlice.reducer;
