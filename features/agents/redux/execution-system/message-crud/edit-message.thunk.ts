/**
 * editMessage — edit a message's content with optimistic update + rollback.
 *
 * Flow:
 *   1. Capture current content for rollback.
 *   2. Optimistic `updateMessageRecord` → UI reflects the edit instantly.
 *   3. Call `cx_message_edit(p_message_id, p_new_content)` — the RPC
 *      auto-archives the previous content into `content_history` on the row,
 *      so no client-side history management is needed.
 *   4. On success: patch the slice with the authoritative row fields
 *      returned by the RPC (status, contentHistory), then mark the
 *      conversation for a cache-bust so the next outbound AI call rebuilds
 *      the agent cache from the updated DB.
 *   5. On failure: rollback content + surface the error.
 *
 * Re-render safety: the patches touch `content` (and on success
 * `contentHistory` + `status` + `_clientStatus`). Per the re-render
 * contract, only the subscribers of THOSE fields re-run — other messages'
 * bodies stay mounted without a re-render.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { updateMessageRecord } from "../messages/messages.slice";
import { markCacheBypass } from "./cache-bypass.slice";
import { invalidateConversationCache } from "./invalidate-conversation-cache.thunk";

interface EditMessageArgs {
  conversationId: string;
  messageId: string;
  /** The replacement content — must be a CxContentBlock[] JSON array. */
  newContent: Json;
}

interface EditMessageResult {
  conversationId: string;
  messageId: string;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const editMessage = createAsyncThunk<
  EditMessageResult,
  EditMessageArgs,
  ThunkApi
>(
  "messages/editMessage",
  async (
    { conversationId, messageId, newContent },
    { dispatch, getState, rejectWithValue },
  ) => {
    // Capture previous content for rollback on failure. Read the slice
    // directly — this is the DB-faithful store.
    const prevRecord =
      getState().messages.byConversationId[conversationId]?.byId?.[messageId];
    if (!prevRecord) {
      // eslint-disable-next-line no-console
      console.error(
        "[editMessage] prevRecord not found",
        JSON.stringify({ conversationId, messageId }),
      );
      return rejectWithValue({
        message: `Message ${messageId} not found in conversation ${conversationId}`,
      });
    }
    const previousContent = prevRecord.content;
    const previousContentHistory = prevRecord.contentHistory;
    const previousStatus = prevRecord.status;

    // eslint-disable-next-line no-console
    console.log(
      "[editMessage] START cid=%s mid=%s role=%s status=%s contentType=%s",
      conversationId,
      messageId,
      prevRecord.role,
      prevRecord.status,
      Array.isArray(newContent) ? "array" : typeof newContent,
    );

    // ── 1. Optimistic update — UI reflects the edit immediately ─────────
    dispatch(
      updateMessageRecord({
        conversationId,
        messageId,
        patch: {
          content: newContent,
          status: "edited",
          _clientStatus: "pending",
        },
      }),
    );

    // ── 2. Fire the DB RPC ──────────────────────────────────────────────
    const { data, error } = await supabase.rpc("cx_message_edit", {
      p_message_id: messageId,
      p_new_content: newContent,
    });

    if (error) {
      // Rollback the optimistic patch.
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: {
            content: previousContent,
            contentHistory: previousContentHistory,
            status: previousStatus,
            _clientStatus: "error",
          },
        }),
      );
      // Supabase `PostgrestError` doesn't own enumerable props so default
      // serialization gives `{}`. Manually extract every field we've seen
      // come back from the RPC layer so the failure is visible in logs.
      const err = error as {
        code?: string;
        message?: string;
        details?: string;
        hint?: string;
        status?: number;
        name?: string;
      };
      const serializedError = {
        code: err.code ?? null,
        message: err.message ?? null,
        details: err.details ?? null,
        hint: err.hint ?? null,
        status: err.status ?? null,
        name: err.name ?? null,
      };
      // eslint-disable-next-line no-console
      console.error(
        "[editMessage] cx_message_edit RPC failed:",
        JSON.stringify(serializedError, null, 2),
      );
      return rejectWithValue({
        message:
          serializedError.message ??
          serializedError.details ??
          serializedError.hint ??
          "cx_message_edit RPC returned an error with no message",
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      "[editMessage] RPC success, received row fields:",
      data && typeof data === "object"
        ? Object.keys(data as Record<string, unknown>).join(", ")
        : typeof data,
    );

    // ── 3. Patch with authoritative row from the RPC return ─────────────
    // The RPC returns the full cx_message row after the edit (including the
    // updated `content_history` with the prior content archived).
    // MATRX-EXCEPTION: the generated Returns type for cx_message_edit resolves
    // to `Database["graveyard"]["Tables"]["message"]["Row"]` — a stale/wrong
    // reference from the schema reorg (that table has no content_history,
    // agent_id, is_visible_to_model, etc.). The actual RPC returns the current
    // chat.message row; a DbRpcRow guard can't be used here since it would
    // check against the wrong generated shape. See ESCALATION brief.
    if (data) {
      const row = data as unknown as {
        content: Json;
        content_history: Json | null;
        status: string;
        agent_id: string | null;
        metadata: Json;
        is_visible_to_model: boolean;
        is_visible_to_user: boolean;
      };
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: {
            content: row.content,
            contentHistory: row.content_history,
            status: row.status,
            agentId: row.agent_id,
            metadata: row.metadata,
            isVisibleToModel: row.is_visible_to_model,
            isVisibleToUser: row.is_visible_to_user,
            _clientStatus: "complete",
          },
        }),
      );
    }

    // ── 4. Invalidate server-side cache
    //
    // Two layers:
    //   (a) `markCacheBypass` sets a one-shot flag the NEXT outbound AI
    //       request will ship as `cache_bypass`. This is the cheap
    //       piggyback path — the server rebuilds whenever the next turn
    //       fires.
    //   (b) `invalidateConversationCache` fires the standalone
    //       `POST /cx/conversations/{id}/invalidate-cache` endpoint
    //       immediately, so even if the user never sends another turn
    //       (navigate away, switch agents, close the page) the server
    //       still drops its stale snapshot. This is fire-and-forget —
    //       a failure here doesn't fail the edit.
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    void dispatch(invalidateConversationCache({ conversationId }));

    return { conversationId, messageId };
  },
);
