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
 *
 * `metadata.engineered_inputs` rides the same path: a conversation launched
 * with a shortcut, binding or per-launch mapping keeps receiving only what it
 * mapped after a reload (`ExecutionInstance.engineeredInputs`, W-31) — the
 * in-memory stamp alone let a reopened shortcut chat re-send the whole note.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@host/lib/redux/store";
import type { Database } from "@host/types/database.types";
import { supabase } from "@host/utils/supabase/client";
import { hasBrowserSession } from "@host/lib/supabase/hasBrowserSession";
import { mergeJsonColumn } from "@ai-matrx/data/db";
import { waitForConversationPersisted } from "./conversation-persistence";

export const SURFACE_OWNS_OUTPUT_METADATA_KEY = "surface_owns_output";
export const ENGINEERED_INPUTS_METADATA_KEY = "engineered_inputs";

type PersistedConversationFlag =
  | typeof SURFACE_OWNS_OUTPUT_METADATA_KEY
  | typeof ENGINEERED_INPUTS_METADATA_KEY;

type ConversationMetadataRow = Pick<
  Database["chat"]["Tables"]["conversation"]["Row"],
  "id" | "version" | "metadata"
>;

function parsePersistedFlag(metadata: unknown, key: PersistedConversationFlag): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return Reflect.get(metadata, key) === true;
}

/** Read the persisted flag off a `chat.conversation.metadata` value. */
export function parsePersistedSurfaceOwnsOutput(metadata: unknown): boolean {
  return parsePersistedFlag(metadata, SURFACE_OWNS_OUTPUT_METADATA_KEY);
}

export function parsePersistedEngineeredInputs(metadata: unknown): boolean {
  return parsePersistedFlag(metadata, ENGINEERED_INPUTS_METADATA_KEY);
}

/** Write one browser-owned `true` flag into the conversation's metadata. */
export const persistConversationFlag = createAsyncThunk<
  void,
  { conversationId: string; flag: PersistedConversationFlag },
  { dispatch: AppDispatch; state: RootState }
>("conversations/persistConversationFlag", async ({ conversationId, flag }) => {
  if (!(await hasBrowserSession())) return;
  const persisted = await waitForConversationPersisted(conversationId);
  if (!persisted) {
    console.error(
      `[conversation-flag] Conversation ${conversationId} never materialised — ` +
        `its ${flag} flag could not be saved and will be lost on reopen.`,
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
      [flag]: true,
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
      `[conversation-flag] Failed to persist ${flag} on ${conversationId}: ` +
        (result.status === "error"
          ? String(result.error)
          : `metadata write ${result.status}`) +
        ". It will be lost on reopen.",
    );
  }
});
