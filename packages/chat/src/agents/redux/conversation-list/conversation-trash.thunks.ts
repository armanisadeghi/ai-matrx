/**
 * THE TRASH — reading soft-deleted conversations back, and restoring one.
 *
 * DD-179. Deleting a conversation was a one-way door: `cx_soft_delete_conversation`
 * stamps `deleted_at` and every reader filters `deleted_at IS NULL`, so the row
 * existed and nothing in the product could ever show it again. A restorable trash
 * is the other half of a soft delete — without it the "soft" is invisible to the
 * only person who cares.
 *
 * Why a direct read works: `chat.conversation`'s `std_select` policy does NOT
 * filter `deleted_at` for the owner (it filters only on the public arm), so a user
 * can still see their own trashed rows. Every LIVE list adds `.is("deleted_at",
 * null)` itself; this reader is the one that asks for the opposite, explicitly.
 *
 * Restore goes through the ONE RPC (`cx_restore_conversation`) — the exact inverse
 * of the delete, un-stamping precisely the child rows the delete stamped.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { getUserId } from "@/utils/auth/getUserId";
import { operationFailed } from "@/utils/errors";
import { ensureEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { ConversationListItem } from "./conversation-list.types";
import {
  setTrashLoading,
  setTrashSuccess,
  setTrashError,
  removeFromTrash,
  prependConversation,
} from "./conversation-list.slice";
import { upsertConversationIntoScopes } from "../conversation-history/slice";

/**
 * How many trashed rows the disclosure shows at once — the ORGANIZATION'S
 * choice (or the person's), not this file's. Law 6: how much of their own
 * history one page carries is a data-volume opinion, so it is a registered knob
 * read through the one cached register fetch, never a constant frozen here.
 */
const CONVERSATION_TRASH_PAGE_SIZE_KNOB = {
  feature: "agents.conversations",
  key: "trash_page_size",
};

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

// ── read the trash ───────────────────────────────────────────────────────────

export const fetchTrashedConversations = createAsyncThunk<
  { items: ConversationListItem[] },
  { limit?: number } | void,
  ThunkApi
>(
  "conversationList/fetchTrashed",
  async (rawArgs, { dispatch, getState, rejectWithValue }) => {
    dispatch(setTrashLoading());

    // VIEW LAW: the trash is MINE, declared — never "everything I can reach".
    const viewerId = getUserId();

    // THE PAGE SIZE IS A SETTING, AWAITED BEFORE THE READ. A caller may still
    // ask for a specific number (a compact disclosure), but nothing here
    // invents one: an unseeded or unreadable row raises by name and the trash
    // says it could not open, with the remedy, instead of quietly showing a
    // page size nobody chose (law 4).
    let limit = (rawArgs as { limit?: number } | undefined)?.limit;
    if (limit === undefined) {
      const organizationId = selectActiveOrganizationId(getState());
      try {
        if (!organizationId) {
          throw new Error(
            "no organization is active yet, so its page size cannot be resolved",
          );
        }
        const raw = await ensureEffectiveKnob(
          organizationId,
          viewerId ?? null,
          CONVERSATION_TRASH_PAGE_SIZE_KNOB,
        );
        const resolved = typeof raw === "number" ? raw : Number(raw);
        if (!Number.isFinite(resolved) || resolved <= 0) {
          throw new Error(
            `it resolves to ${JSON.stringify(raw)}, which is not a number of conversations`,
          );
        }
        limit = resolved;
      } catch (error) {
        const message =
          "The trash could not be opened: the setting that decides how many deleted " +
          `conversations one page shows ("${CONVERSATION_TRASH_PAGE_SIZE_KNOB.feature}.` +
          `${CONVERSATION_TRASH_PAGE_SIZE_KNOB.key}") could not be read — ` +
          `${error instanceof Error ? error.message : String(error)}.`;
        dispatch(setTrashError(message));
        return rejectWithValue({ message });
      }
    }
    let query = supabase
      .schema("chat")
      .from("conversation")
      .select(
        "id, title, description, status, message_count, initial_agent_id, last_model_id, source_app, source_feature, created_at, updated_at, deleted_at, exclude_from_kg",
      )
      .not("deleted_at", "is", null)
      .eq("is_ephemeral", false)
      .order("deleted_at", { ascending: false })
      .limit(limit);
    if (viewerId) query = query.eq("created_by", viewerId);

    const { data, error } = await query;

    if (error) {
      const message = operationFailed("open the trash", error).message;
      dispatch(setTrashError(message));
      return rejectWithValue({ message });
    }

    const items: ConversationListItem[] = (data ?? []).map((row) => ({
      conversationId: row.id as string,
      title: (row.title ?? null) as string | null,
      description: (row.description ?? null) as string | null,
      updatedAt: (row.deleted_at ?? row.updated_at) as string,
      createdAt: row.created_at as string,
      status: row.status as string,
      messageCount: (row.message_count ?? 0) as number,
      // Pins and knowledge-graph state are irrelevant in the trash and are not
      // read here; a restored row picks its real values up on the next list load.
      isFavorite: false,
      excludeFromKg: (row.exclude_from_kg ?? false) as boolean,
      agentId: (row.initial_agent_id ?? null) as string | null,
      lastModelId: (row.last_model_id ?? null) as string | null,
      sourceApp: (row.source_app ?? undefined) as string | undefined,
      sourceFeature: (row.source_feature ?? undefined) as string | undefined,
    }));

    dispatch(setTrashSuccess({ items }));
    return { items };
  },
);

// ── restore ──────────────────────────────────────────────────────────────────

interface RestoreArgs {
  conversationId: string;
}

interface RestoreResult {
  conversationId: string;
  restored: boolean;
}

/**
 * Undo a soft delete. ONE door: `public.cx_restore_conversation`, the exact
 * inverse of `cx_soft_delete_conversation`.
 *
 * `false` back from the RPC means the row is absent, was never deleted, or is
 * not this caller's to restore — all of which are a refusal, not a success, so
 * the thunk rejects with a sentence instead of quietly leaving the row in the
 * trash.
 */
export const restoreConversation = createAsyncThunk<
  RestoreResult,
  RestoreArgs,
  ThunkApi
>(
  "conversationList/restore",
  async ({ conversationId }, { dispatch, getState, rejectWithValue }) => {
    const { data, error } = await supabase.rpc("cx_restore_conversation", {
      p_conversation_id: conversationId,
    });

    if (error) {
      return rejectWithValue({
        message: operationFailed("restore this conversation", error).message,
      });
    }

    if (data !== true) {
      return rejectWithValue({
        message: operationFailed("restore this conversation").message,
      });
    }

    const item = getState().conversationList.trashByConversationId[
      conversationId
    ];
    dispatch(removeFromTrash(conversationId));
    // Put it straight back at the top of the live lists so the restore is
    // visible where the user is standing, not only after a refresh. BOTH
    // stores, because the delete purged both: `conversationList` feeds the
    // global list and the per-agent caches, `conversationHistory` feeds every
    // mounted sidebar scope (/chat, /code, builder panels, floating windows).
    // Restoring into only one of them is how a restore reads as a no-op on the
    // very sidebar the user clicked Restore in.
    if (item) {
      dispatch(prependConversation(item));
      dispatch(
        upsertConversationIntoScopes({
          row: item,
          agentId: item.agentId ?? "",
        }),
      );
    }

    return { conversationId, restored: true };
  },
);
