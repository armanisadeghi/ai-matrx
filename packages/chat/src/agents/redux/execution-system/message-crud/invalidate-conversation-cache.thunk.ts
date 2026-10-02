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
import type { ChatDispatch, ChatRootState } from "../../../../store/root-state";
import { resolveBackendForConversation } from "../thunks/resolve-base-url";
import { clearCacheBypass } from "./cache-bypass.slice";
import {
  buildMatrxRequestUrl,
  executeMatrxCall,
  normalizeMatrxError,
} from "@ai-matrx/agents/matrx";

interface InvalidateArgs {
  conversationId: string;
}

interface InvalidateResult {
  conversationId: string;
}

interface ThunkApi {
  dispatch: ChatDispatch;
  state: ChatRootState;
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
    // THE shared request pipeline (`@ai-matrx/agents/matrx`): the URL, the
    // execution and the one error classifier; this thunk supplies only the
    // conversation's resolved backend.
    try {
      const result = await executeMatrxCall({
        url: buildMatrxRequestUrl(
          backend.baseUrl,
          "/cx/conversations/{conversation_id}/invalidate-cache",
          { conversation_id: conversationId },
        ),
        method: "POST",
        headers: backend.headers,
        body: undefined,
      });
      if (result.error) {
        return rejectWithValue({ message: result.error.message });
      }
    } catch (err) {
      return rejectWithValue({ message: normalizeMatrxError(err).message });
    }

    // The standalone call covers whatever bust flags were pending; drop them.
    dispatch(clearCacheBypass(conversationId));

    return { conversationId };
  },
);
