/**
 * Fetch Memory Cost Thunk
 *
 * Admin-only — fetches the authoritative cost rollup for a conversation's
 * Observational Memory events and writes the result into the
 * observational-memory slice.
 *
 * The live stream-event counters in the slice are fast but approximate
 * (purely local aggregation). This endpoint is the source of truth —
 * aggregated server-side from `cx_observational_memory_event`.
 *
 * Non-admin callers receive 403 Forbidden from the backend; this thunk
 * captures that as a typed error on the slice and never throws.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import {
  callConversationMemoryCost,
  type MemoryCostSummary,
} from "@/lib/api/call-api";
import {
  setCostFetchStatus,
  setCostSummary,
} from "./observational-memory.slice";

interface FetchMemoryCostArgs {
  conversationId: string;
  signal?: AbortSignal;
}

interface FetchMemoryCostResult {
  conversationId: string;
  summary: MemoryCostSummary;
}

export const fetchMemoryCost = createAsyncThunk<
  FetchMemoryCostResult,
  FetchMemoryCostArgs,
  { state: RootState }
>(
  "observationalMemory/fetchCost",
  async ({ conversationId, signal }, { dispatch, rejectWithValue }) => {
    dispatch(setCostFetchStatus({ conversationId, status: "loading" }));

    const result = await dispatch(
      callConversationMemoryCost(conversationId, { signal }),
    );

    if (result.error || !result.data) {
      const message = result.error?.message ?? "Failed to fetch memory cost.";
      dispatch(
        setCostFetchStatus({
          conversationId,
          status: "error",
          error: message,
        }),
      );
      return rejectWithValue(message);
    }

    dispatch(setCostSummary({ conversationId, summary: result.data }));
    return { conversationId, summary: result.data };
  },
);
