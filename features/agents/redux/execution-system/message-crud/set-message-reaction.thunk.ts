/**
 * setMessageReaction — persist the user's like/dislike on a message.
 *
 * Flow:
 *   1. Optimistic `updateMessageRecord` patch of `metadata.user_reaction`
 *      so the bar toggles instantly.
 *   2. `cx_message_set_reaction(p_message_id, p_reaction)` — a SECURITY
 *      INVOKER RPC that jsonb_sets the key server-side (no client
 *      read-modify-write of the metadata blob), authorized by chat.message
 *      RLS (conversation editor).
 *   3. On success: patch the slice with the authoritative metadata the RPC
 *      returns. On failure: rollback to the previous metadata.
 *
 * `reaction: null` clears the reaction (toggle-off).
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { updateMessageRecord } from "../messages/messages.slice";
import { refetchSingleMessage } from "./refetch-single-message.thunk";

// Latest-wins guard: rapid like→dislike fires two independent RPCs whose
// responses can arrive out of order — without this, the FIRST click's
// "authoritative" response would overwrite the second click's state (and the
// DB serializes the updates in arbitrary order anyway). Only the most recent
// dispatch per message is allowed to patch the slice after its RPC settles.
const latestSeqByMessageId = new Map<string, number>();

export type MessageReaction = "like" | "dislike" | null;

interface SetMessageReactionArgs {
  conversationId: string;
  messageId: string;
  reaction: MessageReaction;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

function isJsonObject(
  value: Json | undefined,
): value is { [key: string]: Json | undefined } {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value)
  );
}

/** Read the persisted reaction off a message record's metadata. */
export function reactionFromMetadata(metadata: Json | undefined): MessageReaction {
  if (!isJsonObject(metadata)) return null;
  const value = metadata.user_reaction;
  return value === "like" || value === "dislike" ? value : null;
}

export const setMessageReaction = createAsyncThunk<
  { conversationId: string; messageId: string; reaction: MessageReaction },
  SetMessageReactionArgs,
  ThunkApi
>(
  "messages/setMessageReaction",
  async (
    { conversationId, messageId, reaction },
    { dispatch, getState, rejectWithValue },
  ) => {
    const prevRecord =
      getState().messages.byConversationId[conversationId]?.byId?.[messageId];
    if (!prevRecord) {
      return rejectWithValue({
        message: `Message ${messageId} not found in conversation ${conversationId}`,
      });
    }
    const previousMetadata = prevRecord.metadata;

    const seq = (latestSeqByMessageId.get(messageId) ?? 0) + 1;
    latestSeqByMessageId.set(messageId, seq);
    const isStale = () => latestSeqByMessageId.get(messageId) !== seq;

    // Optimistic patch.
    const optimisticMeta: { [key: string]: Json | undefined } = isJsonObject(
      previousMetadata,
    )
      ? { ...previousMetadata }
      : {};
    if (reaction == null) {
      delete optimisticMeta.user_reaction;
    } else {
      optimisticMeta.user_reaction = reaction;
    }
    dispatch(
      updateMessageRecord({
        conversationId,
        messageId,
        patch: { metadata: optimisticMeta },
      }),
    );

    // The RPC clears the reaction on '' (codegen types the arg non-nullable).
    const { data, error } = await supabase.rpc("cx_message_set_reaction", {
      p_message_id: messageId,
      p_reaction: reaction ?? "",
    });

    // A newer reaction dispatch superseded this one while the RPC was in
    // flight — that dispatch owns the slice now; touching it here would
    // resurrect stale state.
    if (isStale()) {
      if (error) {
        return rejectWithValue({
          message: error.message || "Failed to save reaction",
        });
      }
      return { conversationId, messageId, reaction };
    }

    if (error) {
      // Rollback to the dispatch-time snapshot, then re-sync from the DB —
      // the snapshot itself may have been optimistic (rapid-click chains),
      // so the refetch restores true authority.
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: { metadata: previousMetadata },
        }),
      );
      void dispatch(refetchSingleMessage({ conversationId, messageId }));
      return rejectWithValue({
        message: error.message || "Failed to save reaction",
      });
    }

    // Authoritative metadata from the RPC (jsonb of the updated row).
    if (isJsonObject(data)) {
      dispatch(
        updateMessageRecord({
          conversationId,
          messageId,
          patch: { metadata: data },
        }),
      );
    }

    return { conversationId, messageId, reaction };
  },
);
