/**
 * invalidateAgentCache — explicit server-side agent definition cache buster.
 *
 * The automatic `agentCacheBustMiddleware` fires after saves without user
 * feedback. Use this thunk when the builder (or any agent surface) needs a
 * deliberate bust with UI confirmation.
 *
 * Endpoint: `POST /ai/agents/{agent_id}/invalidate-cache`
 * Response: `{ cleared: true, agent_id, is_version }` on success.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  postInvalidateAgentCache,
  resolveAgentCacheBustBackend,
  type InvalidateAgentCacheResponse,
} from "./agent-cache-bust-request";

interface InvalidateAgentCacheArgs {
  agentId: string;
  /** Builder saves mutate the live agent row; version snapshots pass true. */
  isVersion?: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const invalidateAgentCache = createAsyncThunk<
  InvalidateAgentCacheResponse,
  InvalidateAgentCacheArgs,
  ThunkApi
>(
  "agentDefinition/invalidateCache",
  async ({ agentId, isVersion = false }, { getState, rejectWithValue }) => {
    const backend = resolveAgentCacheBustBackend(getState());
    if (!backend) {
      return rejectWithValue({ message: "No backend URL configured." });
    }

    try {
      return await postInvalidateAgentCache(
        backend.baseUrl,
        agentId,
        backend.headers,
        { isVersion },
      );
    } catch (err) {
      return rejectWithValue({
        message:
          err instanceof Error
            ? err.message
            : "Failed to refresh server cache.",
      });
    }
  },
);
