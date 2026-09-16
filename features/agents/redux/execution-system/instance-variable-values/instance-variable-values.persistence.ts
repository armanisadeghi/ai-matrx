/**
 * VARIABLE AUTHORSHIP, PERSISTED WITH THE CONVERSATION.
 *
 * 🚨 THE DEFECT THIS CLOSES (cold walk, jobs-bar-2026-09-16 — the limit
 * `09d06177f0` wrote into the selector rather than hiding).
 *
 * A purpose-built conversation hands its agent the whole job as named launch
 * variables: the Conductor sends `rulebook_id`, `attachments` and the entire
 * rendered `rulebook_document`; the Scout interview sends the mode, the probes,
 * the closing switch and the Expert's goal. `09d06177f0` recorded that
 * authorship IN MEMORY (`hostValueNames`) so the first user bubble stopped
 * reciting the host's vocabulary back at her. But `chat.conversation.variables`
 * stores only the MERGED payload — it carries no authorship — so the moment the
 * conversation was reopened from the database, every host value came back as a
 * value the person had supposedly typed, and the bubble said
 * "Expert Goal: …" / "Rulebook: …" all over again.
 *
 * Authorship therefore lives BESIDE the values it describes, in
 * `chat.conversation.host_value_names` (migration
 * `migrations/cx_conversation_variable_authorship.sql`), written here once the
 * conversation row exists and read back by `loadConversation`.
 *
 * WHY THE CLIENT WRITES IT. The browser is the only place that KNOWS it — the
 * launcher wired those values, and the request ships one merged `variables`
 * dict in which a host value and a typed one are indistinguishable by
 * construction. This is the same second-writer shape (and the same waiting
 * primitive) that `instance-input-capabilities.persistence.ts` already uses for
 * the conversation-owned UI deltas.
 *
 * AUTHORSHIP IS NOT DELIVERY. Nothing here touches `variables`, the three-tier
 * merge, or the outbound request. A host value still wins over scope and
 * default and still ships; this column only decides whose words they are.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { supabase } from "@/utils/supabase/client";
import { waitForConversationPersisted } from "../conversations/conversation-persistence";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

/**
 * The authorship a conversation row carries, read defensively: a row written
 * before this column existed, or by a writer that did not set it, means "we
 * were never told" — which renders exactly as it did before, never as a claim.
 */
export function parsePersistedHostValueNames(
  row: { host_value_names?: unknown } | null | undefined,
): string[] {
  const raw = row?.host_value_names;
  if (!Array.isArray(raw)) return [];
  return raw.filter((name): name is string => typeof name === "string");
}

/**
 * Persist which of this conversation's launch variables the HOST wired.
 *
 * Called once the first turn has committed — the conversation row is created
 * server-side on that turn, so there is nothing to write to before it. Writes
 * only when there is authorship to record: an empty list is already the
 * column's default and a conversation whose every value the person typed has
 * nothing to say.
 */
export const persistVariableAuthorship = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkApi
>(
  "instanceVariableValues/persistAuthorship",
  async ({ conversationId }, { getState }) => {
    const names =
      getState().instanceVariableValues.byConversationId[conversationId]
        ?.hostValueNames ?? [];
    if (names.length === 0) return;

    const persisted = await waitForConversationPersisted(conversationId);
    if (!persisted) {
      console.error(
        `[variable-authorship] Conversation ${conversationId} never materialised — ` +
          "the values its surface wired will read back as the person's own words " +
          "when it is reopened. Retry by sending another turn.",
      );
      return;
    }

    const { error } = await supabase
      .schema("chat")
      .from("conversation")
      .update({ host_value_names: names })
      .eq("id", conversationId);

    if (error) {
      console.error(
        `[variable-authorship] Failed to record authorship for ${conversationId}: ` +
          `${error.message}. On reload this conversation will show the host's ` +
          "launch values inside the person's own message bubble.",
      );
    }
  },
);
