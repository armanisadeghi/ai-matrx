/**
 * Agent Apps — Redux Thunks
 *
 * Backed by `aga_apps` (the live agent-apps table). RLS scopes reads to:
 *   - the user's own apps,
 *   - org/project apps the user has access to,
 *   - public published apps,
 *   - everything for platform admins.
 *
 * Mirrors `agent-shortcuts/thunks.ts` in shape: each thunk reads/writes
 * Supabase, then dispatches the matching reducer to keep the slice in sync.
 *
 * Composition (embedded shortcuts) is Phase 10 / applets — those two thunks
 * remain stubbed below until the composition table lands.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@/utils/supabase/pg-error";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { fieldFlagsKeys } from "@/features/agents/redux/shared/field-flags";
import type { AgentApp } from "./types";
import { agentAppActions } from "./slice";

interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// supabase types are not yet generated for `aga_apps`; cast at the call site
// rather than scattering `as any` through every thunk body.
function db(): any {
  return supabase as unknown as any;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch every app the caller can see, ordered by most-recently-updated.
 * RLS handles scope filtering. Used by the user-facing list page.
 */
export const fetchAppsInitial = createAsyncThunk<void, void, ThunkApi>(
  "agentApp/fetchInitial",
  async (_, { dispatch }) => {
    dispatch(agentAppActions.setAppsStatus("loading"));
    dispatch(agentAppActions.setAppsError(null));

    const { data, error } = await db()
      .schema("app").from("definition")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      dispatch(agentAppActions.setAppsStatus("failed"));
      dispatch(agentAppActions.setAppsError(error.message));
      throw pgErrorToError(error);
    }

    for (const row of (data ?? []) as AgentApp[]) {
      dispatch(agentAppActions.upsertApp(row));
    }
    dispatch(agentAppActions.setAppsInitialLoaded(true));
    dispatch(agentAppActions.setAppsStatus("succeeded"));
  },
);

/**
 * Fetch one app by id. Used by the edit page; falls through RLS so a non-owner
 * fetching a private app gets a clean "not found" error.
 */
export const fetchAppById = createAsyncThunk<void, string, ThunkApi>(
  "agentApp/fetchById",
  async (appId, { dispatch }) => {
    dispatch(agentAppActions.setAppLoading({ id: appId, loading: true }));
    dispatch(agentAppActions.setAppError({ id: appId, error: null }));

    const { data, error } = await db()
      .schema("app").from("definition")
      .select("*")
      .eq("id", appId)
      .single();

    if (error || !data) {
      dispatch(
        agentAppActions.setAppError({
          id: appId,
          error: error?.message ?? "App not found",
        }),
      );
      dispatch(agentAppActions.setAppLoading({ id: appId, loading: false }));
      throw error ? pgErrorToError(error) : new Error("App not found");
    }

    dispatch(agentAppActions.upsertApp(data as AgentApp));
    dispatch(agentAppActions.setAppLoading({ id: appId, loading: false }));
  },
);

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Persist every dirty field on an app in a single PATCH.
 * Reads the dirty-field flags off the slice record and only sends those.
 */
export const saveApp = createAsyncThunk<void, string, ThunkApi>(
  "agentApp/save",
  async (appId, { dispatch, getState }) => {
    const record = getState().agentApp.apps[appId];
    if (!record) throw new Error(`App ${appId} not in slice`);
    if (!record._dirty) return;

    const dirtyKeys = fieldFlagsKeys(record._dirtyFields);
    if (dirtyKeys.length === 0) return;

    const patch: Partial<AgentApp> = {};
    for (const k of dirtyKeys) {
      // record extends AgentApp, so all keys are valid; explicit any avoids
      // the keyof-mapped-write headache.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (patch as any)[k] = (record as any)[k];
    }

    dispatch(agentAppActions.setAppLoading({ id: appId, loading: true }));
    dispatch(agentAppActions.setAppError({ id: appId, error: null }));

    const { error } = await db()
      .schema("app").from("definition")
      .update(patch)
      .eq("id", appId);

    if (error) {
      dispatch(
        agentAppActions.setAppError({ id: appId, error: error.message }),
      );
      dispatch(agentAppActions.setAppLoading({ id: appId, loading: false }));
      throw pgErrorToError(error);
    }

    dispatch(agentAppActions.markAppSaved({ id: appId }));
    dispatch(agentAppActions.setAppLoading({ id: appId, loading: false }));
  },
);

/**
 * Persist a single field. Used by inline editors that want to commit per-edit
 * instead of batching with `saveApp`.
 */
export const saveAppField = createAsyncThunk<
  void,
  { appId: string; field: keyof AgentApp; value: AgentApp[keyof AgentApp] },
  ThunkApi
>("agentApp/saveField", async ({ appId, field, value }, { dispatch }) => {
  const { error } = await db()
    .schema("app").from("definition")
    .update({ [field]: value })
    .eq("id", appId);

  if (error) {
    dispatch(agentAppActions.setAppError({ id: appId, error: error.message }));
    throw pgErrorToError(error);
  }

  dispatch(
    agentAppActions.mergePartialApp({
      id: appId,
      [field]: value,
    } as Partial<AgentApp> & { id: string }),
  );
});

/**
 * Insert a new app. Returns the new id so callers can route to the edit page.
 * Most fields fall back to DB defaults; the caller must supply at least
 * `name`, `slug`, `agent_id`, `component_code`.
 */
export const createApp = createAsyncThunk<
  string,
  Partial<AgentApp> & { name: string; slug: string; agent_id: string; component_code: string },
  ThunkApi
>("agentApp/create", async (payload, { dispatch }) => {
  const insert = {
    id: payload.id ?? uuidv4(),
    component_language: payload.component_language ?? "tsx",
    allowed_imports: payload.allowed_imports ?? [],
    variable_schema: payload.variable_schema ?? [],
    layout_config: payload.layout_config ?? {},
    styling_config: payload.styling_config ?? {},
    use_latest: payload.use_latest ?? true,
    status: payload.status ?? "draft",
    ...payload,
  };

  const { data, error } = await db()
    .schema("app").from("definition")
    .insert(insert)
    .select()
    .single();

  if (error || !data) {
    dispatch(agentAppActions.setAppsError(error?.message ?? "Insert failed"));
    throw error ? pgErrorToError(error) : new Error("Insert failed");
  }

  const row = data as AgentApp;
  dispatch(agentAppActions.upsertApp(row));
  return row.id;
});

/**
 * Delete an app. Mirrors the API route's belt-and-suspenders ownership check:
 * RLS already filters, but `.eq("user_id", ...)` makes accidental admin
 * deletes from the wrong session impossible.
 */
export const deleteApp = createAsyncThunk<void, string, ThunkApi>(
  "agentApp/delete",
  async (appId, { dispatch }) => {
    const { data: userData } = await db().auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    const { error } = await db()
      .schema("app").from("definition")
      .delete()
      .eq("id", appId)
      .eq("user_id", userId);

    if (error) {
      dispatch(agentAppActions.setAppError({ id: appId, error: error.message }));
      throw pgErrorToError(error);
    }

    dispatch(agentAppActions.removeApp({ id: appId }));
  },
);

// ---------------------------------------------------------------------------
// Composition — shortcuts embedded within an app
// Stubbed until the composition table lands (Phase 10 / applets).
// ---------------------------------------------------------------------------

const COMPOSITION_NOT_IMPLEMENTED =
  "Embedded-shortcut composition lands in Phase 10 (applets); the shared_context_slots column on aga_apps is the persistence target but no UI/RPC exists yet.";

export const addEmbeddedShortcut = createAsyncThunk<
  void,
  { appId: string; shortcutId: string },
  ThunkApi
>("agentApp/addEmbeddedShortcut", async () => {
  throw new Error(COMPOSITION_NOT_IMPLEMENTED);
});

export const removeEmbeddedShortcut = createAsyncThunk<
  void,
  { appId: string; shortcutId: string },
  ThunkApi
>("agentApp/removeEmbeddedShortcut", async () => {
  throw new Error(COMPOSITION_NOT_IMPLEMENTED);
});
