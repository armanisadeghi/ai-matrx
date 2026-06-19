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
import type { Database } from "@/types/database.types";
import { updateMessageRecord } from "../messages/messages.slice";
import { messageRowToRecord } from "../thunks/conversation-bundle";

type CxMessageRow = Database["public"]["Tables"]["cx_message"]["Row"];

interface RefetchSingleMessageArgs {
  conversationId: string;
  messageId: string;
}

interface RefetchSingleMessageResult {
  conversationId: string;
  messageId: string;
  /** false when the row was missing/deleted (caller can decide to drop it). */
  found: boolean;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const refetchSingleMessage = createAsyncThunk<
  RefetchSingleMessageResult,
  RefetchSingleMessageArgs,
  ThunkApi
>(
  "messages/refetchSingleMessage",
  async ({ conversationId, messageId }, { dispatch, rejectWithValue }) => {
    const { data, error } = await supabase
      .from("cx_message")
      .select("*")
      .eq("id", messageId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        "[refetchSingleMessage] fetch failed:",
        JSON.stringify({ conversationId, messageId, message: error.message }),
      );
      return rejectWithValue({
        message: error.message ?? "refetchSingleMessage fetch failed",
      });
    }

    if (!data) {
      // Row gone (deleted/hidden) — not an error; report so callers can react.
      return { conversationId, messageId, found: false };
    }

    const record = messageRowToRecord(data as CxMessageRow);
    dispatch(
      updateMessageRecord({
        conversationId,
        messageId,
        patch: record,
      }),
    );

    return { conversationId, messageId, found: true };
  },
);
