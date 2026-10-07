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
 * Composition (embedded shortcuts) is Phase 10 — those two thunks remain
 * stubbed below until the composition table lands.
 */

import { createAsyncThunk } from "@reduxjs/toolkit";
import { supabase } from "@/utils/supabase/client";
import { pgErrorToError } from "@ai-matrx/data";
import { guardedUpdate } from "@ai-matrx/data/db";
import type { Json } from "@/types/database.types";
import { recordUnavailable } from "@/lib/records/recordUnavailable";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  assignField,
  fieldFlagsKeys,
} from "@ai-matrx/agents/field-flags";
import type { AgentApp } from "./types";
import { agentAppActions } from "./slice";
import { agentAppPublicationPatch } from "@/features/agent-apps/lib/publication";

import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { tryWriteOne } from "@/utils/supabase/writeOne";
interface ThunkApi {
  dispatch: AppDispatch;
  state: RootState;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Fetch every app the caller can see, ordered by most-recently-updated.
 *
 * VIEW LAW: this is a DELIBERATE blended view (mine + org/project-shared +
 * public + admin-sees-all), not a bare RLS-relies-on-it list — RLS is
 * still the ceiling, but the union it produces here is the intended
 * "everything I can see" surface for the apps home page, not an accidental
 * cross-org leak. Do not mine-scope this without splitting the app list
 * page into explicit Mine/Org/Public tabs first (a real UX change, not a
 * bug fix).
 */
export const fetchAppsInitial = createAsyncThunk<void, void, ThunkApi>(
  "agentApp/fetchInitial",
  async (_, { dispatch }) => {
    dispatch(agentAppActions.setAppsStatus("loading"));
    dispatch(agentAppActions.setAppsError(null));

    // VIEW LAW: deliberate blended "everything I can see" view — see docblock above
    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .select("*")
      .is("deleted_at", null)
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

    const { data, error } = await supabase
      .schema("app")
      .from("definition")
      .select("*")
      .eq("id", appId)
      .single();

    if (error || !data) {
      const unavailable = recordUnavailable({
        entity: "app",
        reason: "unknown",
        recordId: appId,
        token: "app",
        relation: "app.definition",
      });
      dispatch(
        agentAppActions.setAppError({ id: appId, error: unavailable.message }),
      );
      dispatch(agentAppActions.setAppLoading({ id: appId, loading: false }));
      throw error ? pgErrorToError(error) : unavailable;
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
      assignField(patch, k, record[k]);
    }

    dispatch(agentAppActions.setAppLoading({ id: appId, loading: true }));
    dispatch(agentAppActions.setAppError({ id: appId, error: null }));

    // `organization_id` is NOT NULL on the `app.definition` table (the DB
    // Update type has no `null` variant), but the domain type allows null
    // before the field is set. A dirty patch should never carry a null org
    // id — omit it rather than send a value the column will reject.
    const columnPatch = patch;
    const dbPatch = {
      ...columnPatch,
      organization_id: columnPatch.organization_id ?? undefined,
    };

    const { error } = await tryWriteOne(
      supabase
        .schema("app")
        .from("definition")
        .update(dbPatch)
        .eq("id", appId)
        .select("id"),
      { action: "save", noun: "app" },
    );

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
  const patch: Partial<AgentApp> = {};
  assignField(patch, field, value);
  // See saveApp: organization_id is NOT NULL in the DB; never send null.
  const columnPatch = patch;
  const dbPatch = {
    ...columnPatch,
    organization_id: columnPatch.organization_id ?? undefined,
  };

  const { error } = await tryWriteOne(
    supabase
      .schema("app")
      .from("definition")
      .update(dbPatch)
      .eq("id", appId)
      .select("id"),
    { action: "save", noun: "app" },
  );

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
 * Publish/unpublish as one transition. The public resolver requires both
 * `status='published'` and `published_to_web`; independent field writes can
 * create a URL the UI advertises but the public route refuses.
 */
export const setAgentAppPublication = createAsyncThunk<
  void,
  { appId: string; published: boolean },
  ThunkApi
>("agentApp/setPublication", async ({ appId, published }, { dispatch }) => {
  const patch = agentAppPublicationPatch(published);
  const { error } = await tryWriteOne(
    supabase
      .schema("app")
      .from("definition")
      .update(patch)
      .eq("id", appId)
      .select("id"),
    { action: published ? "publish" : "unpublish", noun: "app" },
  );

  if (error) {
    dispatch(agentAppActions.setAppError({ id: appId, error: error.message }));
    throw pgErrorToError(error);
  }

  dispatch(agentAppActions.mergePartialApp({ id: appId, ...patch }));
});

/**
 * Delete an app. Mirrors the API route's belt-and-suspenders ownership check:
 * RLS already filters, but `.eq("created_by", ...)` makes accidental admin
 * deletes from the wrong session impossible.
 */
export const deleteApp = createAsyncThunk<void, string, ThunkApi>(
  "agentApp/delete",
  async (appId, { dispatch }) => {
    const { data: userData, error: authError } = await getClaimsUser(supabase);
    // An unverifiable token is a transient failure, not a signed-out person.
    if (authError)
      throw new Error(
        `We could not verify your sign-in just now (${authError.message}). Try again.`,
      );
    const userId = userData?.user?.id;
    if (!userId) throw new Error("Not authenticated");

    // Soft delete, never a hard one (owner ruling 2026-09-20). `app.definition`
    // is a registered entity carrying `deleted_at` and every reader of it in
    // this repo already filters it, so destroying the row took the person's app
    // AND its whole version history with it while the dialog above promised
    // nothing of the kind. Same class as DD-119.
    const { error } = await tryWriteOne(
      supabase
        .schema("app")
        .from("definition")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", appId)
        .eq("created_by", userId)
        .is("deleted_at", null)
        .select("id, deleted_at"),
      {
        action: "delete",
        noun: "app",
        alreadyDone: {
          reread: () =>
            supabase
              .schema("app")
              .from("definition")
              .select("id, deleted_at")
              .eq("id", appId)
              .maybeSingle(),
          isDone: (row) => row.deleted_at != null,
        },
      },
    );

    if (error) {
      dispatch(
        agentAppActions.setAppError({ id: appId, error: error.message }),
      );
      throw pgErrorToError(error);
    }

    dispatch(agentAppActions.removeApp({ id: appId }));
  },
);

// ---------------------------------------------------------------------------
// The Applet record's content (CONTRACTS §8) — version-guarded writes
// ---------------------------------------------------------------------------

/** The record columns the editor writes as whole values. */
export interface AppletRecordPatch {
  files?: Json;
  entry?: string | null;
  pages?: Json;
  mandates?: Json;
  sources?: Json;
}
type AppletRecordPart = keyof AppletRecordPatch;

type AppletPartRow = { version: number } & AppletRecordPatch;

/**
 * Write one or more content columns of an Applet, guarded on `version`: a
 * write based on a version someone else already moved is refused with a
 * sentence, never applied over their change. A version that moved only for a
 * column this write does not touch is a phantom and is rebased. The snapshot
 * trigger records the new version (`app.definition_version`).
 */
export const saveAppletRecord = createAsyncThunk<
  number,
  { appId: string; patch: AppletRecordPatch },
  ThunkApi
>("agentApp/saveAppletRecord", async ({ appId, patch }, { dispatch, getState }) => {
  const record = getState().agentApp.apps[appId];
  if (!record) throw new Error(`Applet ${appId} is not loaded.`);
  const columns = Object.keys(patch) as AppletRecordPart[];
  const base = Object.fromEntries(columns.map((c) => [c, record[c] ?? null]));
  const select = ["version", ...columns].join(", ");
  const result = await guardedUpdate<AppletPartRow>({
    expectedVersion: record.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      supabase
        .schema("app")
        .from("definition")
        .update({ ...patch, version: nextVersion })
        .eq("id", appId)
        .eq("version", expectedVersion)
        .select(select)
        .maybeSingle<AppletPartRow>(),
    fetchCurrent: () =>
      supabase
        .schema("app")
        .from("definition")
        .select(select)
        .eq("id", appId)
        .maybeSingle<AppletPartRow>(),
    rebase: {
      isPhantom: (current) =>
        columns.every(
          (c) => JSON.stringify(current[c] ?? null) === JSON.stringify(base[c]),
        ),
    },
  });
  if (result.status === "not_found") {
    throw new Error("This Applet is gone or you can no longer edit it.");
  }
  if (result.status === "conflict") {
    throw new Error(
      "Someone else changed this Applet since you opened it. Reload to see their version, then make your change again.",
    );
  }
  dispatch(
    agentAppActions.mergePartialApp({
      id: appId,
      ...patch,
      version: result.row.version,
    } as Partial<AgentApp> & { id: string }),
  );
  return result.row.version;
});
