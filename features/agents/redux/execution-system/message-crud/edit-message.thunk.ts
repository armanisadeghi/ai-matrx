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
import type { Database, Json } from "@/types/database.types";
import { updateMessageRecord } from "../messages/messages.slice";
import { extractFlatText } from "../messages/messages.selectors";
import {
  clearRequestEditedText,
  setRequestEditedText,
} from "../active-requests/active-requests.slice";
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
        "[editMessage] prevRecord not found", // access-errors: ok — dev console log for a browser-local Redux lookup; absence verified in the loaded slice
        JSON.stringify({ conversationId, messageId }),
      );
      return rejectWithValue({
        // access-errors: ok — browser-local Redux lookup; the message is absent from the loaded conversation slice, no record read involved
        message: `Message ${messageId} not found in conversation ${conversationId}`,
      });
    }
    const previousContent = prevRecord.content;
    const previousContentHistory = prevRecord.contentHistory;
    const previousStatus = prevRecord.status;
    const requestId = prevRecord._streamRequestId;
    const previousEditedText = requestId
      ? getState().activeRequests.byRequestId[requestId]?.editedText
      : null;
    const optimisticEditedText = extractFlatText({
      ...prevRecord,
      content: newContent,
    });

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
    // A turn streamed during this mounted session keeps rendering from its
    // retained active-request entry, even after completion. Mirror the edit
    // into that render source too; patching messages.byId alone persists the
    // right value while leaving the old streamed text visible until reload.
    if (requestId) {
      dispatch(
        setRequestEditedText({ requestId, text: optimisticEditedText }),
      );
    }

    // ── 2. Fire the DB RPC ──────────────────────────────────────────────
    const { data, error } = await supabase
      .rpc("cx_message_edit", {
        p_message_id: messageId,
        p_new_content: newContent,
      })
      .returns<Database["chat"]["Tables"]["message"]["Row"]>();

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
      if (requestId) {
        dispatch(
          previousEditedText === null || previousEditedText === undefined
            ? clearRequestEditedText({ requestId })
            : setRequestEditedText({
                requestId,
                text: previousEditedText,
              }),
        );
      }
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
    // The RPC returns the full chat.message row after the edit (including the
    // updated `content_history` with the prior content archived). The generated
    // Returns for cx_message_edit mis-resolves to `graveyard.message`: the
    // Supabase type generator can't disambiguate the bare `message` composite
    // return between the live chat.message and the retired graveyard.message and
    // picks the wrong one. The RPC genuinely returns chat.message, so the
    // `.returns<chat.message Row>()` on the call above pins the correct type and
    // `data` is the real row here — no cast needed.
    if (data) {
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: {
            content: data.content,
            contentHistory: data.content_history,
            status: data.status,
            agentId: data.agent_id,
            metadata: data.metadata,
            isVisibleToModel: data.is_visible_to_model,
            isVisibleToUser: data.is_visible_to_user,
            _clientStatus: "complete",
          },
        }),
      );
      if (requestId) {
        dispatch(
          setRequestEditedText({
            requestId,
            text: extractFlatText({ ...prevRecord, content: data.content }),
          }),
        );
      }
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

    // ── 5. Corrected-output capture ─────────────────────────────────────
    //
    // A user rewriting an assistant message in-app is the single most
    // valuable signal this platform produces: the model's output AND the
    // human's correction of it, as a pair. It is the reference point the
    // replay harness ranks candidate outputs against. Capture it on the ONE
    // destination (`platform.output_feedback`); fire-and-forget, because a
    // capture failure must never fail the edit the user asked for.
    //
    // Assistant messages only — editing your own prompt is not a correction.
    if (prevRecord.role === "assistant") {
      void (async () => {
        try {
          const [{ saveOutputFeedback }, { extractFlatText }] = await Promise.all([
            import("@/lib/output-feedback/service"),
            import("../messages/messages.selectors"),
          ]);
          const originalText = extractFlatText(prevRecord);
          const correctedText = extractFlatText({
            ...prevRecord,
            content: newContent,
          });
          if (!correctedText || correctedText === originalText) return;
          await saveOutputFeedback({
            subjectType: "message",
            subjectId: messageId,
            requestId: prevRecord._streamRequestId ?? null,
            surfaceName: "chat",
            originalContent: originalText || null,
            correctedContent: correctedText,
            correctedRefType: "message",
            correctedRefId: messageId,
          });
        } catch (error) {
          // Loud: a silent miss here is a permanently lost training pair.
          // eslint-disable-next-line no-console
          console.error(
            "[editMessage] corrected-output capture failed",
            error,
          );
        }
      })();
    }

    return { conversationId, messageId };
  },
);
