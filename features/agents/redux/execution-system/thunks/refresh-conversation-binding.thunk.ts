/**
 * refreshConversationSandboxBinding — re-read THE column and align the record.
 *
 * A conversation's box can be bound by someone other than this tab: aidream's
 * `persist_conversation_binding` writes `chat.conversation.sandbox_instance_id`
 * for any run that actually used a box (an MCP `agent_run`, the extension, the
 * desktop app, a second tab). Without this, such a conversation only looked
 * bound after a full page reload — the client's copy of the row silently aged.
 *
 * This is NOT a second source of truth: it re-reads the SAME two columns the
 * bundle read, through the SAME derivation, and writes the SAME record field.
 * It runs when a turn reaches a terminal state (the moment the server may have
 * bound a box for this conversation) and when the tab regains focus.
 *
 * A binding the user set here but that has NOT been written to the DB yet
 * (`sandboxBindingPersisted === false`) is never overwritten — that write is
 * still owed and the pre-send gate retries it; clobbering it with a stale row
 * would lose the user's choice.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";

import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { conversationSandboxBindingFromRow } from "@/lib/sandbox/conversation-binding-row";
import { clearSandboxBindingCache } from "@/lib/sandbox/active-binding";
import { patchConversation } from "../conversations/conversations.slice";
import {
  selectConversationSandboxBinding,
  selectConversationSandboxPersisted,
} from "../conversations/conversations.selectors";

const LOG = "[sandbox-binding]";

export const refreshConversationSandboxBinding = createAsyncThunk<
  { changed: boolean },
  { conversationId: string },
  { state: RootState; dispatch: AppDispatch }
>(
  "conversations/refreshSandboxBinding",
  async ({ conversationId }, { getState, dispatch }) => {
    const state = getState();
    const record = state.conversations?.byConversationId?.[conversationId];
    // Nothing to align: the conversation isn't in memory, or it is ephemeral
    // (no row exists to read).
    if (!record || record.isEphemeral) return { changed: false };

    // An unpersisted local binding is the user's newest intent — it outranks
    // whatever the row still says until the gate finishes writing it.
    const current = selectConversationSandboxBinding(conversationId)(state);
    if (current && !selectConversationSandboxPersisted(conversationId)(state)) {
      return { changed: false };
    }

    const { data, error } = await supabase
      .schema("chat")
      .from("conversation")
      .select("sandbox_instance_id, app_instance_id, metadata")
      .eq("id", conversationId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      // Loud but harmless: the record keeps whatever it already had.
      console.warn(
        `${LOG} could not re-read the compute binding for conversation ${conversationId} — the panel keeps showing the binding it already has.`,
        error,
      );
      return { changed: false };
    }
    if (!data) return { changed: false };

    const next = conversationSandboxBindingFromRow(data);
    if ((next?.rowId ?? null) === (current?.rowId ?? null)) {
      return { changed: false };
    }

    // A box that has just been (re)bound must not be suppressed by a tombstone
    // left over from an earlier failure.
    if (next?.rowId) clearSandboxBindingCache(next.rowId);

    console.warn(
      `${LOG} conversation ${conversationId} is bound to ${next?.rowId ?? "(no box)"} on the server — aligning the UI without a reload (was ${current?.rowId ?? "(no box)"}).`,
    );
    dispatch(
      patchConversation({
        conversationId,
        sandboxBinding: next,
        sandboxBindingPersisted: !!next,
      }),
    );
    return { changed: true };
  },
);
