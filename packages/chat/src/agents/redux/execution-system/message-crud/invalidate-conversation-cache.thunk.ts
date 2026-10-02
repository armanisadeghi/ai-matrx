/**
 * invalidateConversationCache — standalone server-side cache buster.
 *
 * Most cache invalidation rides piggyback on the next outbound AI request
 * via `cache_bypass` (see `cache-bypass.slice.ts`). Use THIS thunk when the
 * next call might not come soon (e.g. user edits then navigates away) and
 * you need to guarantee the server rebuilds from the DB immediately.
 *
 * Endpoint: `POST /cx/conversations/{conversation_id}/invalidate-cache`.
 * No body needed. The server wipes `AgentCache` + every `Cx*` model in the
 * ORM `StateManager` for that conversation.
 *
 * Also clears the pending cache-bypass flag for the same conversation since
 * the server-side invalidation supersedes it.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { resolveBackendForConversation } from "../thunks/resolve-base-url";
import { clearCacheBypass } from "./cache-bypass.slice";

interface InvalidateArgs {
  conversationId: string;
}

interface InvalidateResult {
  conversationId: string;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const invalidateConversationCache = createAsyncThunk<
  InvalidateResult,
  InvalidateArgs,
  ThunkApi
>(
  "conversations/invalidateCache",
  async ({ conversationId }, { dispatch, getState, rejectWithValue }) => {
    const state = getState();
    const backend = resolveBackendForConversation(state, conversationId);
    if (!backend) {
      return rejectWithValue({ message: "No backend URL configured" });
    }
    const baseUrl = backend.baseUrl;
    const headers = backend.headers;

    try {
      const res = await fetch(
        `${baseUrl}/cx/conversations/${conversationId}/invalidate-cache`,
        { method: "POST", headers },
      );
      if (!res.ok) {
        return rejectWithValue({
          message: `Invalidate cache failed: ${res.status} ${res.statusText}`,
        });
      }
    } catch (err) {
      return rejectWithValue({
        message:
          err instanceof Error
            ? err.message
            : `Invalidate cache failed: unknown error`,
      });
    }

    // The standalone call covers whatever bust flags were pending; drop them.
    dispatch(clearCacheBypass(conversationId));

    return { conversationId };
  },
);
