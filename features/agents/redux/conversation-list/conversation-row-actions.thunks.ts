/**
 * Conversation-row action thunks — the shared CRUD surface for every
 * conversation list in the app (sidebars, builder panels, floating windows,
 * agent-app overlays).
 *
 * Each thunk follows the same optimistic pattern:
 *   1. Snapshot the current value from the canonical entity store.
 *   2. Patch every slice that mirrors the row (list, history scopes, the
 *      active `conversations`/`messages` instance if it's loaded).
 *   3. Hit Supabase directly — RLS scopes the update to the owner.
 *   4. On failure, revert to the snapshot in the same slices.
 *
 * No new reducers are needed: the existing generic `patchConversation` and
 * `patchConversationInScopes` actions handle arbitrary partials, and the
 * messages / conversations slices already expose `setConversationLabel`.
 *
 * `duplicateConversation` is a thin wrapper around the existing
 * `forkConversationServer` thunk — it intentionally reuses the server path
 * because copying a full conversation can be expensive and the server
 * already handles cascading message / observability copies.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  patchConversation,
  renameConversation as renameConversationListItem,
  revertRename,
} from "./conversation-list.slice";
import { patchConversationInScopes } from "../conversation-history/slice";
import { setConversationLabel as setMessagesConversationLabel } from "../execution-system/messages/messages.slice";
import {
  setConversationLabel as setInstancesConversationLabel,
  patchConversation as patchInstanceConversation,
} from "../execution-system/conversations/conversations.slice";
import { selectConversationIsEphemeral } from "../execution-system/conversations/conversations.selectors";
import { forkConversationServer } from "../execution-system/message-crud/server/fork-conversation-server.thunk";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
  rejectValue: { message: string };
}

// ── rename ───────────────────────────────────────────────────────────────────

interface RenameConversationArgs {
  conversationId: string;
  /** New title. Empty string is allowed (the column is nullable, so we coerce
   * empties to `null`). */
  title: string;
}

interface RenameConversationResult {
  conversationId: string;
  title: string | null;
}

export const renameConversation = createAsyncThunk<
  RenameConversationResult,
  RenameConversationArgs,
  ThunkApi
>(
  "conversationRow/rename",
  async (
    { conversationId, title },
    { dispatch, getState, rejectWithValue },
  ) => {
    const trimmed = title.trim();
    const nextTitle: string | null = trimmed.length > 0 ? trimmed : null;

    const previousTitle =
      getState().conversationList.byConversationId[conversationId]?.title ??
      null;

    // Optimistic — every consumer reads from one of these three sources.
    dispatch(
      renameConversationListItem({ conversationId, title: nextTitle ?? "" }),
    );
    dispatch(
      patchConversationInScopes({
        conversationId,
        patch: { title: nextTitle },
      }),
    );
    // If the conversation is currently open, keep the active panels in sync.
    dispatch(
      setMessagesConversationLabel({
        conversationId,
        title: nextTitle ?? "",
        description:
          getState().messages.byConversationId[conversationId]?.description ??
          null,
        keywords:
          getState().messages.byConversationId[conversationId]?.keywords ??
          null,
      }),
    );
    dispatch(
      setInstancesConversationLabel({
        conversationId,
        title: nextTitle,
      }),
    );

    const { error } = await supabase
      .from("cx_conversation")
      .update({ title: nextTitle, updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) {
      // Revert every mirror.
      dispatch(revertRename({ conversationId, previousTitle }));
      dispatch(
        patchConversationInScopes({
          conversationId,
          patch: { title: previousTitle },
        }),
      );
      dispatch(
        setInstancesConversationLabel({
          conversationId,
          title: previousTitle,
        }),
      );
      return rejectWithValue({ message: error.message });
    }

    return { conversationId, title: nextTitle };
  },
);

// ── favorite (pin) ───────────────────────────────────────────────────────────

interface SetFavoriteArgs {
  conversationId: string;
  isFavorite: boolean;
}

interface SetFavoriteResult {
  conversationId: string;
  isFavorite: boolean;
}

export const setConversationFavorite = createAsyncThunk<
  SetFavoriteResult,
  SetFavoriteArgs,
  ThunkApi
>(
  "conversationRow/setFavorite",
  async (
    { conversationId, isFavorite },
    { dispatch, getState, rejectWithValue },
  ) => {
    const previous =
      getState().conversationList.byConversationId[conversationId]
        ?.isFavorite ?? false;

    // Optimistic patches in both slices.
    dispatch(patchConversation({ conversationId, patch: { isFavorite } }));
    dispatch(
      patchConversationInScopes({ conversationId, patch: { isFavorite } }),
    );

    const { error } = await supabase
      .from("cx_conversation")
      .update({ is_favorite: isFavorite })
      .eq("id", conversationId);

    if (error) {
      dispatch(
        patchConversation({
          conversationId,
          patch: { isFavorite: previous },
        }),
      );
      dispatch(
        patchConversationInScopes({
          conversationId,
          patch: { isFavorite: previous },
        }),
      );
      return rejectWithValue({ message: error.message });
    }

    return { conversationId, isFavorite };
  },
);

// ── archive / unarchive ──────────────────────────────────────────────────────
//
// We treat archive as a single toggling thunk so callers can `dispatch(
// setConversationArchived({ id, archived: !isArchived }))` rather than juggle
// two action names.

interface SetArchivedArgs {
  conversationId: string;
  archived: boolean;
}

interface SetArchivedResult {
  conversationId: string;
  status: "active" | "archived";
}

export const setConversationArchived = createAsyncThunk<
  SetArchivedResult,
  SetArchivedArgs,
  ThunkApi
>(
  "conversationRow/setArchived",
  async (
    { conversationId, archived },
    { dispatch, getState, rejectWithValue },
  ) => {
    const previousStatus =
      getState().conversationList.byConversationId[conversationId]?.status ??
      "active";

    const nextStatus: "active" | "archived" = archived ? "archived" : "active";

    dispatch(
      patchConversation({ conversationId, patch: { status: nextStatus } }),
    );
    dispatch(
      patchConversationInScopes({
        conversationId,
        patch: { status: nextStatus },
      }),
    );

    const { error } = await supabase
      .from("cx_conversation")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) {
      dispatch(
        patchConversation({
          conversationId,
          patch: { status: previousStatus },
        }),
      );
      dispatch(
        patchConversationInScopes({
          conversationId,
          patch: { status: previousStatus },
        }),
      );
      return rejectWithValue({ message: error.message });
    }

    return { conversationId, status: nextStatus };
  },
);

// ── exclude / include from knowledge graph ───────────────────────────────────
//
// Per-conversation opt-out for the auto-ingest pipeline that feeds the
// knowledge graph + scope-association suggestions (Step 3.2 of the KG
// activation plan). When true, the downstream auto-ingest worker skips
// this conversation entirely — both for new messages and any future
// backfill. Mirrors `setConversationFavorite` exactly — direct supabase
// update on `cx_conversation.exclude_from_kg`, optimistic + rollback.

interface SetExcludeFromKgArgs {
  conversationId: string;
  excludeFromKg: boolean;
}

interface SetExcludeFromKgResult {
  conversationId: string;
  excludeFromKg: boolean;
}

export const setConversationExcludeFromKg = createAsyncThunk<
  SetExcludeFromKgResult,
  SetExcludeFromKgArgs,
  ThunkApi
>(
  "conversationRow/setExcludeFromKg",
  async (
    { conversationId, excludeFromKg },
    { dispatch, getState, rejectWithValue },
  ) => {
    const previous =
      getState().conversationList.byConversationId[conversationId]
        ?.excludeFromKg ?? false;

    // Optimistic patches in both slices.
    dispatch(patchConversation({ conversationId, patch: { excludeFromKg } }));
    dispatch(
      patchConversationInScopes({
        conversationId,
        patch: { excludeFromKg },
      }),
    );

    const { error } = await supabase
      .from("cx_conversation")
      .update({
        exclude_from_kg: excludeFromKg,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (error) {
      dispatch(
        patchConversation({
          conversationId,
          patch: { excludeFromKg: previous },
        }),
      );
      dispatch(
        patchConversationInScopes({
          conversationId,
          patch: { excludeFromKg: previous },
        }),
      );
      return rejectWithValue({ message: error.message });
    }

    return { conversationId, excludeFromKg };
  },
);

// ── duplicate ────────────────────────────────────────────────────────────────
//
// Reuses the server fork endpoint with NO selector — that's exactly the
// "copy this entire conversation" semantic the backend already implements,
// including cascading message / observability / variable copies.

interface DuplicateConversationArgs {
  conversationId: string;
  /** Custom title for the copy. Defaults to `"Copy of <original title>"`. */
  title?: string;
  /** Optional surface key — when supplied, the focus jumps to the new copy. */
  surfaceKey?: string;
}

interface DuplicateConversationResult {
  conversationId: string;
  newConversationId: string;
}

export const duplicateConversation = createAsyncThunk<
  DuplicateConversationResult,
  DuplicateConversationArgs,
  ThunkApi
>(
  "conversationRow/duplicate",
  async (
    { conversationId, title, surfaceKey },
    { dispatch, getState, rejectWithValue },
  ) => {
    const sourceTitle =
      getState().conversationList.byConversationId[conversationId]?.title ??
      null;

    const defaultTitle = sourceTitle
      ? `Copy of ${sourceTitle}`
      : "Copy of conversation";

    const result = await dispatch(
      forkConversationServer({
        conversationId,
        title: title ?? defaultTitle,
        surfaceKey,
      }),
    );

    if (forkConversationServer.rejected.match(result)) {
      const message =
        result.payload?.message ?? result.error.message ?? "Duplicate failed";
      return rejectWithValue({ message });
    }

    return {
      conversationId,
      newConversationId: result.payload.conversationId,
    };
  },
);

// ── sandbox override (power-user "use a different box just here") ──────────────

interface SetConversationSandboxOverrideArgs {
  conversationId: string;
  /** The box to pin to this conversation, or `null` to clear the override. */
  ref: { rowId: string; proxyUrl: string; tier?: "ec2" | "hosted" } | null;
}

/**
 * Pin (or clear) a per-conversation sandbox override. The rowId persists on
 * `cx_conversation.sandbox_instance_id`; the proxyUrl mirrors into
 * `cx_conversation.metadata.sandbox_override_proxy_url` so the binding
 * resolves on reload with no extra fetch. Ephemeral conversations (no cx_*
 * row) keep the override in-memory only — lost on reload, by design.
 *
 * The shared user-active sandbox is unaffected; this only changes which box
 * THIS conversation routes its agent's fs/shell/git tools into.
 */
export const setConversationSandboxOverride = createAsyncThunk<
  { conversationId: string },
  SetConversationSandboxOverrideArgs,
  ThunkApi
>(
  "conversationRow/setSandboxOverride",
  async ({ conversationId, ref }, { dispatch, getState, rejectWithValue }) => {
    const state = getState();
    const previous =
      state.conversations.byConversationId[conversationId]?.sandboxOverride ??
      null;

    // Optimistic — the resolver reads this off the conversation record.
    dispatch(patchInstanceConversation({ conversationId, sandboxOverride: ref }));

    // Ephemeral conversations have no DB row; in-memory only.
    if (selectConversationIsEphemeral(conversationId)(state)) {
      return { conversationId };
    }

    // Read-modify-write metadata so we never clobber the server-managed
    // observational_memory block that also lives on cx_conversation.metadata.
    const { data: row, error: readError } = await supabase
      .from("cx_conversation")
      .select("metadata")
      .eq("id", conversationId)
      .single();

    if (readError) {
      dispatch(
        patchInstanceConversation({
          conversationId,
          sandboxOverride: previous,
        }),
      );
      return rejectWithValue({ message: readError.message });
    }

    const metadata: Record<string, unknown> =
      typeof row?.metadata === "object" && row.metadata !== null
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    if (ref) {
      metadata["sandbox_override_proxy_url"] = ref.proxyUrl;
      if (ref.tier) metadata["sandbox_override_tier"] = ref.tier;
      else delete metadata["sandbox_override_tier"];
    } else {
      delete metadata["sandbox_override_proxy_url"];
      delete metadata["sandbox_override_tier"];
    }

    const { error } = await supabase
      .from("cx_conversation")
      .update({
        sandbox_instance_id: ref?.rowId ?? null,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (error) {
      dispatch(
        patchInstanceConversation({
          conversationId,
          sandboxOverride: previous,
        }),
      );
      return rejectWithValue({ message: error.message });
    }

    return { conversationId };
  },
);
