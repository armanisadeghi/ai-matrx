import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Database, Json } from "@/types/database.types";
import { supabase } from "@/utils/supabase/client";
import { mergeJsonColumn } from "@/lib/supabase/mergeJsonColumn";
import { waitForConversationPersisted } from "../conversations/conversation-persistence";
import {
  markInputCapabilitiesPersisted,
  markInputCapabilitiesPersistenceError,
} from "./instance-input-capabilities.slice";
import {
  UI_GATE_KEYS,
  parseUiGates,
  type UiGates,
} from "@/lib/redux/slices/agent-settings/ui-gates";

type ConversationMetadataRow = Pick<
  Database["chat"]["Tables"]["conversation"]["Row"],
  "id" | "version" | "metadata"
>;

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

export interface PersistedInputCapabilities {
  overrides: UiGates;
}

function serializableUiGates(
  source: Partial<UiGates>,
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const key of UI_GATE_KEYS) {
    const value = source[key];
    if (typeof value === "boolean") result[key] = value;
  }
  return result;
}

export function parsePersistedInputCapabilities(
  metadata: unknown,
): PersistedInputCapabilities {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { overrides: {} };
  }
  const block = Reflect.get(metadata, "input_capabilities");
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    return { overrides: {} };
  }
  return { overrides: parseUiGates(Reflect.get(block, "overrides")) };
}

/** Persist conversation-only UI deltas without replacing other metadata keys. */
export const persistInputCapabilities = createAsyncThunk<
  void,
  { conversationId: string },
  ThunkApi
>(
  "instanceInputCapabilities/persist",
  async ({ conversationId }, { dispatch, getState }) => {
    const persisted = await waitForConversationPersisted(conversationId);
    if (!persisted) {
      const error = "Conversation is not available for capability persistence";
      console.error(`[input-capabilities] ${error}: ${conversationId}`);
      dispatch(
        markInputCapabilitiesPersistenceError({ conversationId, error }),
      );
      return;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const entry =
        getState().instanceInputCapabilities.byConversationId[conversationId];
      if (!entry) return;
      const overrides = serializableUiGates(entry.overrides);
      const serialized = JSON.stringify(overrides);

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
          input_capabilities: { overrides } satisfies Json,
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
        const error =
          result.status === "error"
            ? String(result.error)
            : `metadata write ${result.status}`;
        console.error(
          `[input-capabilities] Failed to persist ${conversationId}: ${error}`,
        );
        dispatch(
          markInputCapabilitiesPersistenceError({ conversationId, error }),
        );
        return;
      }

      const latest =
        getState().instanceInputCapabilities.byConversationId[conversationId];
      if (
        latest &&
        JSON.stringify(serializableUiGates(latest.overrides)) === serialized
      ) {
        dispatch(markInputCapabilitiesPersisted(conversationId));
        return;
      }
    }

    const error = "Input capabilities changed faster than they could persist";
    console.error(`[input-capabilities] ${error}: ${conversationId}`);
    dispatch(markInputCapabilitiesPersistenceError({ conversationId, error }));
  },
);
