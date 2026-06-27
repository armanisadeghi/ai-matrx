// lib/redux/thunks/promptCrudThunks.ts
//
// CRUD thunks for the `prompts` table.
//
// Design:
// - All DB access goes through the supabase browser client (RLS is always enforced)
// - Every mutation updates BOTH the per-ID execution cache (promptCacheSlice.prompts)
//   AND the flat list (promptCacheSlice.allPrompts), so the runner and the CRUD UI
//   always share the same data without an extra round-trip
// - All thunks return the resulting PromptData so callers can await + unwrap()
//   and get the value back directly, just like a plain async function would

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import type { AppDispatch, RootState } from "../store";
import type { DbRpcRow } from "@/types/supabase-rpc";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import {
  cachePrompt,
  removePrompt,
  markPromptStale,
  setPromptList,
  setListStatus,
  upsertPromptInList,
  removePromptFromList,
  setSharedPromptList,
  setSharedListStatus,
  upsertSharedPromptInList,
  removeSharedPromptFromList,
  CachedPrompt,
  SharedPromptRecord,
} from "../slices/promptCacheSlice";
import type { PromptData, PromptDb } from "@/features/prompts/types/core";
import {
  toFrontend,
  toDbInsert,
  toDbUpdate,
} from "@/features/prompts/utils/dbTransforms";
import { satisfiesPermissionLevel } from "@/utils/permissions/types";

// ---------------------------------------------------------------------------
// DB row types
// ---------------------------------------------------------------------------

interface SharedPromptDbRow {
  created_at: string;
  description: string;
  id: string;
  messages: unknown;
  name: string;
  owner_email: string;
  permission_level: string;
  settings: unknown;
  updated_at: string;
  user_id: string;
  variable_defaults: unknown;
}
type _CheckSharedPromptDbRow =
  SharedPromptDbRow extends DbRpcRow<"get_prompts_shared_with_me">
    ? true
    : false;
declare const _sharedPromptDbRow: _CheckSharedPromptDbRow;
true satisfies typeof _sharedPromptDbRow;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a frontend record to what promptCacheSlice.CachedPrompt expects. */
function toCachedPrompt(data: PromptData): CachedPrompt {
  return {
    id: data.id!,
    name: data.name ?? "",
    description: data.description,
    messages: data.messages ?? [],
    variableDefaults: data.variableDefaults ?? [],
    settings: data.settings ?? {},
    userId: data.userId ?? "",
    source: "prompts",
    fetchedAt: Date.now(),
    status: "cached",
    tags: data.tags,
    category: data.category,
    isArchived: data.isArchived,
    isFavorite: data.isFavorite,
    modelId: data.modelId,
    outputFormat: data.outputFormat,
    outputSchema: data.outputSchema,
    tools: data.tools,
  };
}

/** Push a freshly mutated record into both caches in one call. */
function syncBothCaches(dispatch: AppDispatch, data: PromptData) {
  dispatch(cachePrompt(toCachedPrompt(data))); // execution pipeline cache
  dispatch(upsertPromptInList(data)); // CRUD / management list
}

// ---------------------------------------------------------------------------
// Thunks
// ---------------------------------------------------------------------------

// ── FETCH ALL ────────────────────────────────────────────────────────────────
/**
 * Fetch all prompts owned by (or visible to) the current user.
 * Populates the flat list AND pre-warms the per-ID execution cache
 * so that running any listed prompt has zero extra latency.
 *
 * @example
 * dispatch(fetchAllUserPrompts()).unwrap();
 */
export const fetchAllUserPrompts = createAsyncThunk<
  PromptData[],
  void,
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/fetchAll", async (_, { dispatch, getState }) => {
  dispatch(setListStatus({ status: "loading" }));

  const userId = (getState() as RootState).userAuth.id;
  if (!userId) {
    dispatch(setListStatus({ status: "error", error: "Not authenticated" }));
    throw new Error("Not authenticated");
  }

  const { data: rows, error } = await graveyardDb(supabase)
    .from("prompts")
    .select<"*", PromptDb>("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    dispatch(setListStatus({ status: "error", error: error.message }));
    throw new Error(error.message ?? JSON.stringify(error));
  }

  const prompts = (rows ?? []).map(toFrontend);

  // Populate list state
  dispatch(setPromptList(prompts));

  // Pre-warm per-ID execution cache (skips any that are already fresh)
  prompts.forEach((p) => dispatch(cachePrompt(toCachedPrompt(p))));

  return prompts;
});

// ── FETCH ONE ────────────────────────────────────────────────────────────────
/**
 * Fetch a single prompt by ID.
 * Syncs into both caches on success.
 *
 * @example
 * const prompt = await dispatch(fetchUserPrompt(id)).unwrap();
 */
export const fetchUserPrompt = createAsyncThunk<
  PromptData,
  string, // promptId
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/fetchOne", async (promptId, { dispatch }) => {
  const { data: row, error } = await graveyardDb(supabase)
    .from("prompts")
    .select("*")
    .eq("id", promptId)
    .single<PromptDb>();

  if (error) throw new Error(error.message ?? JSON.stringify(error));

  const prompt = toFrontend(row!);
  syncBothCaches(dispatch, prompt);
  return prompt;
});

// ── CREATE ────────────────────────────────────────────────────────────────────
/**
 * Insert a new prompt row.
 * DB assigns `id`, `created_at`, `updated_at`, and `user_id` automatically.
 * The new record is immediately available in both the list and the runner cache.
 *
 * @example
 * const newPrompt = await dispatch(createUserPrompt({ name: 'My Prompt', messages: [...] })).unwrap();
 */
export const createUserPrompt = createAsyncThunk<
  PromptData,
  Omit<PromptData, "id" | "createdAt" | "updatedAt" | "userId">,
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/create", async (data, { dispatch, getState }) => {
  const userId = (getState() as RootState).userAuth.id;
  if (!userId) throw new Error("Not authenticated");

  const { data: row, error } = await graveyardDb(supabase)
    .from("prompts")
    .insert({ ...toDbInsert(data), user_id: userId })
    .select()
    .single<PromptDb>();

  if (error) throw new Error(error.message ?? JSON.stringify(error));

  const prompt = toFrontend(row!);
  syncBothCaches(dispatch, prompt);
  return prompt;
});

// ── UPDATE ────────────────────────────────────────────────────────────────────
/**
 * Patch an existing prompt. Only supply the fields you want to change.
 * `id`, `created_at`, `updated_at`, and `user_id` are never sent.
 * Both caches are updated with the DB's response so timestamps stay accurate.
 *
 * @example
 * const updated = await dispatch(updateUserPrompt({ id, data: { name: 'New name' } })).unwrap();
 */
export const updateUserPrompt = createAsyncThunk<
  PromptData,
  {
    id: string;
    data: Partial<
      Omit<PromptData, "id" | "createdAt" | "updatedAt" | "userId">
    >;
  },
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/update", async ({ id, data }, { dispatch }) => {
  const patch = toDbUpdate(data);

  if (Object.keys(patch).length === 0) {
    // Nothing to send — fetch current state and return it instead
    return dispatch(fetchUserPrompt(id)).unwrap();
  }

  // Mark stale immediately so the runner re-fetches if it opens this
  // prompt before the update resolves (race condition guard)
  dispatch(markPromptStale(id));

  const { data: row, error } = await graveyardDb(supabase)
    .from("prompts")
    .update(patch)
    .eq("id", id)
    .select()
    .single<PromptDb>();

  if (error) throw new Error(error.message ?? JSON.stringify(error));

  const prompt = toFrontend(row!);
  syncBothCaches(dispatch, prompt); // overwrites the stale entry
  return prompt;
});

// ── UPSERT ────────────────────────────────────────────────────────────────────
/**
 * Insert or update a prompt.
 * When `data.id` is present the row is updated; otherwise a new row is inserted.
 *
 * @example
 * const result = await dispatch(upsertUserPrompt(promptData)).unwrap();
 */
export const upsertUserPrompt = createAsyncThunk<
  PromptData,
  PromptData,
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/upsert", async (data, { dispatch, getState }) => {
  const userId = (getState() as RootState).userAuth.id;
  if (!userId) throw new Error("Not authenticated");

  const payload: Partial<PromptDb> = {
    ...(data.id ? { id: data.id } : {}),
    ...toDbInsert(data),
    user_id: userId,
  };

  if (data.id) dispatch(markPromptStale(data.id));

  const { data: row, error } = await graveyardDb(supabase)
    .from("prompts")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single<PromptDb>();

  if (error) throw new Error(error.message ?? JSON.stringify(error));

  const prompt = toFrontend(row!);
  syncBothCaches(dispatch, prompt);
  return prompt;
});

// ── DELETE ────────────────────────────────────────────────────────────────────
/**
 * Permanently delete a prompt by ID.
 * Evicts the record from both the execution cache and the list.
 *
 * @example
 * await dispatch(deleteUserPrompt(id)).unwrap();
 */
export const deleteUserPrompt = createAsyncThunk<
  string, // returns the deleted id
  string, // promptId
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/delete", async (id, { dispatch }) => {
  const { error } = await graveyardDb(supabase).from("prompts").delete().eq("id", id);

  if (error) throw new Error(error.message ?? JSON.stringify(error));

  dispatch(removePrompt(id)); // evict from execution cache
  dispatch(removePromptFromList(id)); // evict from list
  return id;
});

// ── DUPLICATE ─────────────────────────────────────────────────────────────────
/**
 * Clone an existing prompt with " (copy)" appended to the name.
 * Fetches source, strips identity fields, creates a new row.
 *
 * @example
 * const copy = await dispatch(duplicateUserPrompt(id)).unwrap();
 */
export const duplicateUserPrompt = createAsyncThunk<
  PromptData,
  string, // source promptId
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/duplicate", async (sourceId, { dispatch }) => {
  const source = await dispatch(fetchUserPrompt(sourceId)).unwrap();

  return dispatch(
    createUserPrompt({
      name: source.name ? `${source.name} (copy)` : "Untitled (copy)",
      description: source.description,
      messages: source.messages,
      variableDefaults: source.variableDefaults,
      settings: source.settings,
      tags: source.tags,
      category: source.category,
      isArchived: false,
      isFavorite: false,
      modelId: source.modelId,
      outputFormat: source.outputFormat,
      outputSchema: source.outputSchema,
      tools: source.tools,
    }),
  ).unwrap();
});

// ── SHARED: FETCH ─────────────────────────────────────────────────────────────
/**
 * Fetch all prompts shared with the current user via the
 * `get_prompts_shared_with_me` RPC.
 *
 * The RPC returns lightweight rows (id, name, description, permission_level,
 * owner_email) — we derive `canEdit` and `canDelete` from the permission level
 * once here so components never have to re-compute them.
 *
 * Also pre-warms the execution cache for every entry the user can at least
 * view, so opening a shared prompt in the runner has zero extra latency.
 *
 * @example
 * await dispatch(fetchSharedPrompts()).unwrap();
 */
export const fetchSharedPrompts = createAsyncThunk<
  SharedPromptRecord[],
  void,
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/fetchShared", async (_, { dispatch }) => {
  dispatch(setSharedListStatus({ status: "loading" }));

  const { data, error } = await supabase.rpc("get_prompts_shared_with_me");

  if (error) {
    dispatch(setSharedListStatus({ status: "error", error: error.message }));
    throw error;
  }

  const records: SharedPromptRecord[] = (
    (data ?? []) as unknown as SharedPromptDbRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    permissionLevel:
      row.permission_level as SharedPromptRecord["permissionLevel"],
    ownerEmail: row.owner_email,
    canEdit: satisfiesPermissionLevel(
      row.permission_level as SharedPromptRecord["permissionLevel"],
      "editor",
    ),
    canDelete: row.permission_level === "admin",
  }));

  dispatch(setSharedPromptList(records));
  return records;
});

// ── SHARED: UPDATE ────────────────────────────────────────────────────────────
/**
 * Update a shared prompt that the current user has at least `editor` access to.
 * Redux enforces the permission check BEFORE touching the DB.
 *
 * @example
 * const updated = await dispatch(updateSharedPrompt({ id, data: { name: 'New name' } })).unwrap();
 */
export const updateSharedPrompt = createAsyncThunk<
  SharedPromptRecord,
  {
    id: string;
    data: Partial<
      Omit<PromptData, "id" | "createdAt" | "updatedAt" | "userId">
    >;
  },
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/updateShared", async ({ id, data }, { dispatch, getState }) => {
  // ── Permission guard ──────────────────────────────────────────────────
  const state = getState();
  const record = state.promptCache?.sharedPrompts.find((p) => p.id === id);

  if (!record) {
    throw new Error(`Shared prompt ${id} not found in state. Fetch it first.`);
  }
  if (!record.canEdit) {
    throw new Error(
      `Permission denied: you need editor access to update prompt ${id}. ` +
        `Current level: ${record.permissionLevel}.`,
    );
  }

  // ── DB update ────────────────────────────────────────────────────────
  const patch = toDbUpdate(data);
  if (Object.keys(patch).length === 0) {
    return record; // nothing to do
  }

  dispatch(markPromptStale(id));

  const { data: row, error } = await graveyardDb(supabase)
    .from("prompts")
    .update(patch)
    .eq("id", id)
    .select()
    .single<PromptDb>();

  if (error) throw new Error(error.message ?? JSON.stringify(error));

  // ── Sync caches ───────────────────────────────────────────────────────
  const updatedPrompt = toFrontend(row!);
  // Also pre-warm the execution cache with fresh data
  dispatch(cachePrompt(toCachedPrompt(updatedPrompt)));

  // Build updated shared record, preserving permission fields from Redux
  const updatedRecord: SharedPromptRecord = {
    ...record,
    name: updatedPrompt.name ?? record.name,
    description: updatedPrompt.description ?? record.description,
  };
  dispatch(upsertSharedPromptInList(updatedRecord));
  return updatedRecord;
});

// ── SHARED: DELETE ────────────────────────────────────────────────────────────
/**
 * Delete a shared prompt that the current user has `admin` access to.
 * Redux enforces the permission check BEFORE touching the DB.
 *
 * @example
 * await dispatch(deleteSharedPrompt(id)).unwrap();
 */
export const deleteSharedPrompt = createAsyncThunk<
  string, // returns the deleted id
  string, // promptId
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/deleteShared", async (id, { dispatch, getState }) => {
  // ── Permission guard ──────────────────────────────────────────────────
  const state = getState();
  const record = state.promptCache?.sharedPrompts.find((p) => p.id === id);

  if (!record) {
    throw new Error(`Shared prompt ${id} not found in state. Fetch it first.`);
  }
  if (!record.canDelete) {
    throw new Error(
      `Permission denied: you need admin access to delete prompt ${id}. ` +
        `Current level: ${record.permissionLevel}.`,
    );
  }

  // ── DB delete ────────────────────────────────────────────────────────
  const { error } = await graveyardDb(supabase).from("prompts").delete().eq("id", id);

  if (error) throw new Error(error.message ?? JSON.stringify(error));

  // removeSharedPromptFromList also evicts from the execution cache
  dispatch(removeSharedPromptFromList(id));
  return id;
});

// ── INITIALIZE (idempotent bootstrap) ─────────────────────────────────────────

const PROMPT_LIST_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Returns true when the owned-prompt list is fresh enough to skip re-fetching.
 * "Fresh" means status is success/loading AND the last fetch was within the TTL.
 */
function isOwnedListFresh(state: RootState): boolean {
  const status = state.promptCache?.listStatus ?? "idle";
  const lastFetchedAt = state.promptCache?.lastFetchedAt ?? null;
  if (status === "loading") return true; // already in-flight
  if (status !== "success") return false;
  if (lastFetchedAt === null) return false;
  return Date.now() - lastFetchedAt < PROMPT_LIST_TTL_MS;
}

/**
 * Fetch owned prompts AND shared prompts in parallel — but only if they haven't
 * been loaded recently (TTL: 15 minutes for owned, session-long for shared).
 *
 * Rules:
 *   - Owned list: fresh if status is success/loading AND last fetch < 15 min ago
 *   - Shared list: fresh if status is success or loading (session-long)
 *   - Both fetches run in parallel for speed
 *
 * Safe to call from any component on mount without worrying about duplicate
 * fetches — idempotent by design.
 *
 * @example
 * useEffect(() => { dispatch(initializeUserPrompts()); }, [dispatch]);
 */
export const initializeUserPrompts = createAsyncThunk<
  void,
  void,
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/initialize", async (_, { dispatch, getState }) => {
  const state = getState();
  const sharedStatus = state.promptCache?.sharedListStatus ?? "idle";

  const ownedDone = isOwnedListFresh(state);
  const sharedDone = sharedStatus === "success" || sharedStatus === "loading";

  if (ownedDone && sharedDone) return;

  const tasks: Promise<unknown>[] = [];
  if (!ownedDone) tasks.push(dispatch(fetchAllUserPrompts()).unwrap());
  if (!sharedDone) tasks.push(dispatch(fetchSharedPrompts()).unwrap());

  await Promise.all(tasks);
});

/**
 * Force a full refetch of owned and shared prompts, bypassing the TTL.
 * Use for explicit "Refresh" actions triggered by the user.
 *
 * @example
 * dispatch(refreshUserPrompts());
 */
export const refreshUserPrompts = createAsyncThunk<
  void,
  void,
  { dispatch: AppDispatch; state: RootState }
>("promptCrud/refresh", async (_, { dispatch }) => {
  await Promise.all([
    dispatch(fetchAllUserPrompts()).unwrap(),
    dispatch(fetchSharedPrompts()).unwrap(),
  ]);
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export default {
  // Bootstrap
  initializeUserPrompts,
  refreshUserPrompts,
  // Owned prompts
  fetchAllUserPrompts,
  fetchUserPrompt,
  createUserPrompt,
  updateUserPrompt,
  upsertUserPrompt,
  deleteUserPrompt,
  duplicateUserPrompt,
  // Shared prompts
  fetchSharedPrompts,
  updateSharedPrompt,
  deleteSharedPrompt,
};
