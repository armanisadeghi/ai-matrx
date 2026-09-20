/**
 * refetchSingleMessage — re-pull ONE `cx_message` row from the DB and replace
 * just that message in the slice, without reloading the whole conversation.
 *
 * Why this exists:
 *   The materialization rewrite (`cx_message_set_content`) and other
 *   server-authored changes mutate `cx_message.content` in the DB but
 *   deliberately do NOT mirror into the Redux slice in-session (mirroring would
 *   remount a live artifact and wipe its interaction state). After such a
 *   rewrite the in-memory message is stale until a full `loadConversation`.
 *   This is the lightweight single-row analog: refetch one row → patch one
 *   `byId` entry. Used by inline-artifact edits (the non-linked markdown table
 *   path) so the agent sees the updated content next turn, and reusable by the
 *   ~9 CRUD thunks that currently call the whole `loadConversation` after a
 *   localized change.
 *
 * Re-render contract: patching `content` re-runs only `selectMessageContent`
 * subscribers; sibling messages stay mounted.
 *
 * Lifetime-rule caveat: a message still rendering from `activeRequests` (a live
 * stream) reads `activeRequests`, not `byId.content` — so a refetch into
 * `byId.content` won't visibly change it until reload. This primitive targets
 * DB-hydrated (non-live) messages, where the `byId.content` patch renders
 * immediately. For live messages, patch `activeRequests.editedText` instead
 * (see `commitInlineContentEdit`).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { updateMessageRecord } from "../messages/messages.slice";
import { messageRowToRecord } from "../thunks/conversation-bundle";

interface RefetchSingleMessageArgs {
  conversationId: string;
  messageId: string;
  /** Server conversation id when a manual execution uses a local Redux id. */
  persistedConversationId?: string;
  /** Wait for a terminal stream row to become readable with its committed body. */
  waitForReadable?: boolean;
}

interface RefetchSingleMessageResult {
  conversationId: string;
  messageId: string;
  /** false when the row was missing/deleted (caller can decide to drop it). */
  found: boolean;
  /** False when a stale empty row must not replace a populated live record. */
  refreshed: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export function hasDisplayableMessageContent(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((part) => {
    if (!part || typeof part !== "object") return false;
    const block = part as { type?: unknown; text?: unknown };
    return block.type === "text"
      ? typeof block.text === "string" && block.text.trim().length > 0
      : typeof block.type === "string";
  });
}

function isHostAuthored(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as { authored_by?: unknown }).authored_by === "host"
  );
}

export const refetchSingleMessage = createAsyncThunk<
  RefetchSingleMessageResult,
  RefetchSingleMessageArgs,
  ThunkApi
>(
  "messages/refetchSingleMessage",
  async (
    {
      conversationId,
      messageId,
      persistedConversationId,
      waitForReadable = false,
    },
    { dispatch, getState, rejectWithValue },
  ) => {
    const read = () => {
      const byId = supabase
        .schema("chat").from("message")
        .select("*")
        .eq("id", messageId);
      const scoped = persistedConversationId
        ? byId.eq("conversation_id", persistedConversationId)
        : byId;
      return scoped
        .is("deleted_at", null)
        .eq("is_visible_to_user", true)
        .maybeSingle();
    };
    let result = await read();
    // Align the retry cadence with waitForConversationPersisted: begin at
    // 250ms, back off by 1.4, cap at 1.5s. A terminal stream signal can lead
    // the committed row's visibility; an empty active row is equally stale for
    // this live-hydration caller. Ordinary CRUD refetches remain one-shot and
    // may intentionally replace content with an empty value.
    let delay = 250;
    for (let attempt = 0; waitForReadable && attempt < 7; attempt++) {
      const hasBody = hasDisplayableMessageContent(
        result.data?.user_content ?? result.data?.content,
      );
      if (hasBody || isHostAuthored(result.data?.metadata)) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(Math.round(delay * 1.4), 1500);
      result = await read();
    }

    if (result.error) {
      console.error(
        "[refetchSingleMessage] fetch failed:",
        JSON.stringify({ conversationId, messageId, message: result.error.message }),
      );
      return rejectWithValue({
        message: result.error.message ?? "refetchSingleMessage fetch failed",
      });
    }

    if (!result.data) {
      // Row gone (deleted/hidden) — not an error; report so callers can react.
      if (waitForReadable) {
          console.warn(
          `[refetchSingleMessage] terminal row was not readable after bounded durable read: ${messageId}`,
        );
      }
      return { conversationId, messageId, found: false, refreshed: false };
    }

    const record = messageRowToRecord(result.data);
    const fetchedHasContent = hasDisplayableMessageContent(
      record.userContent ?? record.content,
    );
    if (
      waitForReadable &&
      !fetchedHasContent &&
      !isHostAuthored(record.metadata)
    ) {
      console.warn(
        `[refetchSingleMessage] terminal row remained empty after bounded durable read: ${messageId}`,
      );
      return { conversationId, messageId, found: true, refreshed: false };
    }

    // A stream refetch exists to fill a user row the client never had a
    // body for (the server assembled the template). It must NOT rewrite
    // history the person already saw: the optimistic bubble is the frozen
    // send. Replacing it with `content` (agent template + resolved machine
    // context) or a later `user_content` projection is the "sent message
    // changed when the reply arrived" defect. Bookkeeping still updates.
    const existing =
      getState().messages.byConversationId[conversationId]?.byId[messageId];
    const existingHasDisplay = hasDisplayableMessageContent(
      existing?.userContent ?? existing?.content,
    );
    if (waitForReadable && existing && existingHasDisplay) {
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: {
            status: record.status,
            source: record.source,
            modelContext: record.modelContext ?? existing.modelContext,
            toolsOnCall: record.toolsOnCall ?? existing.toolsOnCall,
            isVisibleToModel: record.isVisibleToModel,
            isVisibleToUser: record.isVisibleToUser,
            metadata: {
              ...(typeof record.metadata === "object" && record.metadata
                ? record.metadata
                : {}),
              ...(typeof existing.metadata === "object" && existing.metadata
                ? existing.metadata
                : {}),
            },
          },
        }),
      );
      return { conversationId, messageId, found: true, refreshed: true };
    }

    dispatch(
      updateMessageRecord({
        conversationId,
        messageId,
        patch: record,
      }),
    );

    return { conversationId, messageId, found: true, refreshed: true };
  },
);
