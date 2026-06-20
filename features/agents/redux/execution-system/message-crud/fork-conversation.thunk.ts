/**
 * forkConversation — "Submit from Here" / general conversation fork.
 *
 * Semantics (from the `cx_fork_conversation` RPC):
 *   • Server duplicates the conversation + all messages with position ≤
 *     `p_at_position`, plus their tool_calls, artifacts, and media.
 *   • Remaps all ids and FK references.
 *   • Sets `forked_from_id` / `forked_at_position` on the new conversation.
 *   • Does NOT copy user_requests / requests (telemetry) or agent_memory
 *     (independent scope).
 *   • Returns the full bundle (same shape as `get_cx_conversation_bundle`)
 *     so the client can hydrate immediately without a second round trip.
 *
 * This thunk:
 *   1. Calls the RPC.
 *   2. Hydrates the new conversation + its messages into the slices.
 *   3. Optionally updates focus so the UI jumps to the fork.
 *   4. Returns the new conversationId for the caller to navigate.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Json } from "@/types/database.types";
import { hydrateConversation } from "../conversations/conversations.slice";
import { hydrateMessages } from "../messages/messages.slice";
import { setFocus } from "../conversation-focus/conversation-focus.slice";
import { markCacheBypass } from "./cache-bypass.slice";
import { invalidateConversationCache } from "./invalidate-conversation-cache.thunk";
// Canonical bundle row mapper + row type. Mirrors refetch-single-message.thunk —
// using the SSOT here is load-bearing: the local copy this replaced did NOT map
// the four per-turn columns (tools_on_call / model_context / error / voice), so
// forked conversations silently lost tools/context/error/voice on every message.
import {
  messageRowToRecord,
  type CxMessageRow,
} from "../thunks/conversation-bundle";

// Minimal fork-bundle shape — only the fields we hydrate from here. The
// full RPC payload mirrors `get_cx_conversation_bundle`; extra fields are
// ignored safely.
interface ForkBundle {
  conversation: {
    id: string;
    user_id: string;
    title: string | null;
    description: string | null;
    keywords: string[] | null;
    status: string;
    message_count: number;
    metadata: Json;
    variables: Json;
    overrides: Json;
    last_model_id: string | null;
    initial_agent_id: string | null;
    initial_agent_version_id: string | null;
    parent_conversation_id: string | null;
    forked_from_id: string | null;
    forked_at_position: number | null;
    organization_id: string | null;
    project_id: string | null;
    task_id: string | null;
    is_public: boolean;
    is_ephemeral: boolean;
    source_app: string;
    source_feature: string;
    created_at: string;
    updated_at: string;
  };
  messages: CxMessageRow[];
  // tool_calls / artifacts / media also returned; not hydrated here for
  // brevity — observability hydration can be added when the Runner
  // migrates to reading from that slice for the fork path.
}

interface ForkConversationArgs {
  conversationId: string;
  /** Fork at this message position — all messages with position ≤ this are duplicated. */
  atPosition: number;
  /** Optional surface key — if set, focus jumps to the new conversation. */
  surfaceKey?: string;
}

interface ForkConversationResult {
  /** The new conversation id returned by the RPC. */
  conversationId: string;
  messageCount: number;
}

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

export const forkConversation = createAsyncThunk<
  ForkConversationResult,
  ForkConversationArgs,
  ThunkApi
>(
  "conversations/fork",
  async (
    { conversationId, atPosition, surfaceKey },
    { dispatch, rejectWithValue },
  ) => {
    const { data, error } = await supabase.rpc("cx_fork_conversation", {
      p_conversation_id: conversationId,
      p_at_position: atPosition,
    });

    if (error) {
      return rejectWithValue({ message: error.message });
    }
    if (!data) {
      return rejectWithValue({
        message: `Fork RPC returned empty payload for conversation ${conversationId}`,
      });
    }

    const bundle = data as unknown as ForkBundle;
    const newConversationId = bundle.conversation.id;
    const conv = bundle.conversation;

    // Hydrate the conversation record.
    dispatch(
      hydrateConversation({
        conversationId: newConversationId,
        agentId: conv.initial_agent_id ?? "",
        agentType: "user",
        origin: "manual",
        shortcutId: null,
        status: "ready",
        sourceApp: conv.source_app,
        sourceFeature: conv.source_feature as never,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
        userId: conv.user_id,
        initialAgentId: conv.initial_agent_id,
        initialAgentVersionId: conv.initial_agent_version_id,
        lastModelId: conv.last_model_id,
        parentConversationId: conv.parent_conversation_id,
        forkedFromId: conv.forked_from_id,
        forkedAtPosition: conv.forked_at_position,
        organizationId: conv.organization_id,
        projectId: conv.project_id,
        taskId: conv.task_id,
        isEphemeral: conv.is_ephemeral,
        isPublic: conv.is_public,
        title: conv.title,
        description: conv.description,
        keywords: conv.keywords,
        persistedStatus:
          conv.status === "archived" ? "archived" : "active",
        messageCount: conv.message_count,
        metadata:
          typeof conv.metadata === "object" && conv.metadata !== null
            ? (conv.metadata as Record<string, unknown>)
            : undefined,
      }),
    );

    // Hydrate the forked messages.
    const messageRecords = bundle.messages.map(messageRowToRecord);
    dispatch(
      hydrateMessages({
        conversationId: newConversationId,
        messages: messageRecords,
      }),
    );

    // Optionally point the caller's UI surface at the new conversation.
    if (surfaceKey) {
      dispatch(setFocus({ surfaceKey, conversationId: newConversationId }));
    }

    // Invalidate server-side cache for BOTH conversations:
    //   • source: the server's agent cache may have a snapshot that
    //     doesn't include the new `forked_from_id` backref / child
    //     relationship. Bust it.
    //   • new:    no prior cache exists, but flipping the bypass flag
    //     guarantees the very first outbound call on the fork rebuilds
    //     from the DB rather than trusting anything lazily cached from
    //     the source's messages.
    // Standalone endpoint fires fire-and-forget so a cache-invalidate
    // failure never fails the fork.
    dispatch(markCacheBypass({ conversationId, conversation: true }));
    dispatch(
      markCacheBypass({
        conversationId: newConversationId,
        conversation: true,
      }),
    );
    void dispatch(invalidateConversationCache({ conversationId }));
    void dispatch(
      invalidateConversationCache({ conversationId: newConversationId }),
    );

    return {
      conversationId: newConversationId,
      messageCount: messageRecords.length,
    };
  },
);
