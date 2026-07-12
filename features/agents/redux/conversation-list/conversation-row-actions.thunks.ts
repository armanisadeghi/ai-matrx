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
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";
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
      .schema("chat").from("conversation")
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

    // Canonical store is `platform.user_entity_state` (via the `ues_*` RPC
    // chokepoint), NOT the soon-to-be-dropped `cx_conversation.is_favorite`
    // column. `setFavorite` returns a ScopesRpcResult and never throws.
    const result = await favoritesService.setFavorite(
      "conversation",
      conversationId,
      isFavorite,
    );

    if (isScopesRpcErr(result)) {
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
      return rejectWithValue({ message: result.error.message });
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
      .schema("chat").from("conversation")
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
      .schema("chat").from("conversation")
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

// ── the conversation's sandbox binding (THE source of truth) ──────────────────

export interface ConversationSandboxRef {
  rowId: string;
  /** Empty for a local-PC target — its URL is resolved server-side at send time. */
  proxyUrl: string;
  tier?: "ec2" | "hosted";
  kind?: "ec2" | "hosted" | "local-pc";
  name?: string;
}

interface SetConversationSandboxArgs {
  conversationId: string;
  /** The box this conversation is bound to, or `null` to unbind it. */
  ref: ConversationSandboxRef | null;
}

/**
 * Bind (or unbind) a conversation's compute target — the ONE write path for the
 * ONE source of truth.
 *
 * ── The two columns (and the bug of ignoring the second) ─────────────────────
 * A compute target is one of two DIFFERENT tables, and `cx_conversation` has a
 * dedicated column for each (a CHECK constraint forbids both being set):
 *
 *   sandbox_instances  → `cx_conversation.sandbox_instance_id`   (orchestrator box)
 *   app_instances      → `cx_conversation.app_instance_id`       (user's local PC)
 *
 * aidream's `resolve_and_arm_run` reads BOTH and dispatches on which one is set —
 * that is the discriminator; `kind` is *derived from the column*, not stored.
 *
 * The frontend used to write EVERY binding — local PCs included — into
 * `sandbox_instance_id`, and never touched `app_instance_id`. The server then
 * looked that PC's uuid up in `sandbox_instances`, found nothing, and silently
 * declined to arm anything. Local-PC conversations only worked at all because
 * the client separately shipped the binding in the request body. Routing each
 * kind to its own column is what makes the server's own view of the binding
 * agree with ours.
 *
 * `proxyUrl` / `tier` / `name` mirror into `cx_conversation.metadata` as a pure
 * CACHE (it saves a fetch on reload). They are all re-derivable from the
 * referenced row — `proxy_url` is deliberately not persisted anywhere (see
 * `lib/sandbox/decorate-sandbox-row.ts`) — so nothing may *require* them: a
 * binding written by aidream's own `PUT /ai/conversations/{id}/sandbox` sets the
 * column and no metadata at all, and must still resolve here.
 *
 * Writing the DB is not optional and not "later": every downstream gate, ours
 * and the server's, reads these columns. Unbinding before a send is what lets
 * "send without sandbox" actually send without a sandbox instead of hitting a
 * server that still thinks a box is attached.
 *
 * Returns `persisted: false` when the conversation has no DB row yet
 * (`cacheOnly` — the row is created server-side by the first turn) or is
 * ephemeral. The binding still applies in memory; `ensureSandboxOrDecide`
 * retries the write on the next send, when the row exists.
 */
export const setConversationSandbox = createAsyncThunk<
  { conversationId: string; persisted: boolean },
  SetConversationSandboxArgs,
  ThunkApi
>(
  "conversationRow/setSandbox",
  async ({ conversationId, ref }, { dispatch, getState, rejectWithValue }) => {
    const state = getState();
    const record = state.conversations.byConversationId[conversationId];
    const previous = record?.sandboxBinding ?? null;
    const previousPersisted = record?.sandboxBindingPersisted ?? false;

    // Optimistic — every resolver reads this off the conversation record.
    dispatch(
      patchInstanceConversation({
        conversationId,
        sandboxBinding: ref,
        sandboxBindingPersisted: false,
      }),
    );

    // No DB row to write to: ephemeral (never gets one) or cacheOnly (the first
    // turn creates it server-side). Keep it in memory; the pre-send gate retries.
    const isEphemeral = selectConversationIsEphemeral(conversationId)(state);
    if (isEphemeral || (record?.cacheOnly ?? true)) {
      return { conversationId, persisted: false };
    }

    // Read-modify-write metadata so we never clobber the server-managed
    // observational_memory block that also lives on cx_conversation.metadata.
    const { data: row, error: readError } = await supabase
      .schema("chat").from("conversation")
      .select("metadata")
      .eq("id", conversationId)
      .single();

    if (readError) {
      dispatch(
        patchInstanceConversation({
          conversationId,
          sandboxBinding: previous,
          sandboxBindingPersisted: previousPersisted,
        }),
      );
      return rejectWithValue({ message: readError.message });
    }

    const metadata: Record<string, unknown> =
      typeof row?.metadata === "object" && row.metadata !== null
        ? { ...(row.metadata as Record<string, unknown>) }
        : {};
    // Cache only — never the source of truth. Legacy key names kept so bindings
    // written before this rework still rehydrate. `kind` is NOT written: it is
    // derived from WHICH column holds the id (a stored copy could contradict the
    // column, and did).
    const setOrDelete = (key: string, value: string | undefined) => {
      if (value) metadata[key] = value;
      else delete metadata[key];
    };
    setOrDelete("sandbox_override_proxy_url", ref?.proxyUrl || undefined);
    setOrDelete("sandbox_override_tier", ref?.tier);
    setOrDelete("sandbox_override_name", ref?.name);
    delete metadata["sandbox_override_kind"]; // retired — the column IS the kind

    // Route the id to the column that matches its table. The CHECK constraint on
    // cx_conversation forbids both being set, so the other is always nulled.
    const isLocalPc = ref?.kind === "local-pc";
    const columnPatch = {
      sandbox_instance_id: ref && !isLocalPc ? ref.rowId : null,
      app_instance_id: ref && isLocalPc ? ref.rowId : null,
    };

    const { error } = await supabase
      .schema("chat").from("conversation")
      .update({
        ...columnPatch,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (error) {
      dispatch(
        patchInstanceConversation({
          conversationId,
          sandboxBinding: previous,
          sandboxBindingPersisted: previousPersisted,
        }),
      );
      return rejectWithValue({ message: error.message });
    }

    dispatch(
      patchInstanceConversation({
        conversationId,
        sandboxBindingPersisted: true,
      }),
    );
    return { conversationId, persisted: true };
  },
);
