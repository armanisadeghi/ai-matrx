/**
 * SURFACE-OWNED OUTPUT, PERSISTED WITH THE CONVERSATION.
 *
 * A conversation launched with `surfaceOwnsOutput: true` has its result saved
 * by the launching surface itself (a flashcard deck, one merged artifact of a
 * segmented converter run), so no materializer may turn its assistant turns
 * into canvas items / feature records — doing so minted one twin deck per
 * section (live 2026-09-28, /education/flashcards/new).
 *
 * The flag rides the conversation record in Redux from launch (before the
 * first stream commits). This thunk writes it beside the row's other
 * browser-owned metadata as `metadata.surface_owns_output` once the row
 * exists, and `loadConversation` restores it, so a reload or a resumed run
 * keeps it — the old module-level Set was lost on every reload.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Database } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { hasBrowserSession } from "@/lib/supabase/hasBrowserSession";
import { mergeJsonColumn } from "@ai-matrx/data/db";
import { waitForConversationPersisted } from "./conversation-persistence";

export const SURFACE_OWNS_OUTPUT_METADATA_KEY = "surface_owns_output";

type ConversationMetadataRow = Pick<
  Database["chat"]["Tables"]["conversation"]["Row"],
  "id" | "version" | "metadata"
>;

/** Read the persisted flag off a `chat.conversation.metadata` value. */
export function parsePersistedSurfaceOwnsOutput(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return Reflect.get(metadata, SURFACE_OWNS_OUTPUT_METADATA_KEY) === true;
}

export const persistSurfaceOwnsOutput = createAsyncThunk<
  void,
  { conversationId: string },
  { dispatch: AppDispatch; state: RootState }
>("conversations/persistSurfaceOwnsOutput", async ({ conversationId }) => {
  if (!(await hasBrowserSession())) return;
  const persisted = await waitForConversationPersisted(conversationId);
  if (!persisted) {
    console.error(
      `[surface-owns-output] Conversation ${conversationId} never materialised — ` +
        "its surface-owned flag could not be saved, so reopening it may " +
        "materialize a duplicate record from its reply.",
    );
    return;
  }

  const result = await mergeJsonColumn<ConversationMetadataRow>({
    fetchCurrent: () =>
      supabase
        .schema("chat")
        .from("conversation")
        .select("id, version, metadata")
        .eq("id", conversationId)
        .is("deleted_at", null)
        .maybeSingle(),
    readColumn: (row) => row.metadata,
    merge: (current) => ({
      ...current,
      [SURFACE_OWNS_OUTPUT_METADATA_KEY]: true,
    }),
    applyUpdate: ({ value, expectedVersion, nextVersion }) =>
      supabase
        .schema("chat")
        .from("conversation")
        .update({ metadata: value, version: nextVersion })
        .eq("id", conversationId)
        .eq("version", expectedVersion)
        .select("id, version, metadata")
        .maybeSingle(),
  });

  if (result.status !== "saved") {
    console.error(
      `[surface-owns-output] Failed to persist ${conversationId}: ` +
        (result.status === "error"
          ? String(result.error)
          : `metadata write ${result.status}`) +
        ". Reopening this conversation may materialize a duplicate record.",
    );
  }
});
