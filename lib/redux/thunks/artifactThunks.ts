// lib/redux/thunks/artifactThunks.ts
//
// Async thunks for the artifacts slice.
//
// Thunks read appContextSlice at dispatch time to automatically attach
// org/project/task context — callers don't need to pass it.
//
// All thunks communicate with /api/artifacts which operates on the
// cx_artifact table in the main Supabase project.

import { createAsyncThunk } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "@/lib/redux/store";
import {
  upsertArtifact,
  upsertManyArtifacts,
  removeArtifact,
  setFetchStatus,
  setOperationStatus,
  clearOperationStatus,
} from "@/lib/redux/slices/artifactsSlice";
import {
  selectOrganizationId,
  selectProjectId,
  selectTaskId,
} from "@/lib/redux/slices/appContextSlice";
import type {
  CxArtifactRecord,
  CxArtifactRow,
  CreateArtifactPayload,
  UpdateArtifactPayload,
  ArtifactFilters,
  ArtifactStatus,
} from "@/features/artifacts/types";
import { rowToArtifactRecord } from "@/features/artifacts/types";

// ── API helper ────────────────────────────────────────────────────────────────

async function callArtifactsApi(
  action: string,
  params: object,
): Promise<{ data?: unknown; error?: string }> {
  const res = await fetch("/api/artifacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Request failed");
    return { error: text };
  }
  return { data: await res.json() };
}

// ── registerArtifactThunk ─────────────────────────────────────────────────────

/**
 * Register a new artifact after content has been created/published.
 * Reads appContextSlice automatically — callers only need to supply
 * message-level and artifact-specific fields.
 *
 * Idempotent on the natural key
 *   (messageId, artifactType, externalSystem).
 * If an artifact with that tuple already exists in Redux, the thunk
 * short-circuits and returns it without hitting the API. The server
 * itself also dedups on the same key, so even if the Redux cache is
 * cold (first open before `fetchArtifactsForMessageThunk` resolves)
 * the round-trip can't produce a duplicate row.
 *
 * Returns the resulting CxArtifactRecord on success, or throws on failure.
 */
export const registerArtifactThunk = createAsyncThunk<
  CxArtifactRecord,
  CreateArtifactPayload,
  { state: RootState; dispatch: AppDispatch }
>("artifacts/register", async (payload, { getState, dispatch }) => {
  const state = getState();

  // Client-side short-circuit: if a matching artifact is already in
  // Redux AND the caller isn't trying to push new mutable fields, skip
  // the network round-trip. When the caller supplies a fresh
  // `externalId`/`externalUrl`/`title`/`description`/`thumbnailUrl`,
  // defer to the server so the dedup-and-update path there keeps the
  // record current.
  const wantsUpdate =
    payload.externalId !== undefined ||
    payload.externalUrl !== undefined ||
    payload.title !== undefined ||
    payload.description !== undefined ||
    payload.thumbnailUrl !== undefined;
  if (!wantsUpdate) {
    const artifactsById = state.artifacts.artifacts;
    const idsForMessage = state.artifacts.byMessageId[payload.messageId] ?? [];
    const existing = idsForMessage
      .map((id) => artifactsById[id])
      .find(
        (a) =>
          a != null &&
          a.artifactType === payload.artifactType &&
          (a.externalSystem ?? null) === (payload.externalSystem ?? null),
      );
    if (existing) return existing;
  }

  // Read context from appContextSlice at dispatch time
  const context = {
    organizationId: payload.organizationId ?? selectOrganizationId(state),
    projectId: payload.projectId ?? selectProjectId(state),
    taskId: payload.taskId ?? selectTaskId(state),
  };

  const { data, error } = await callArtifactsApi("create", {
    messageId: payload.messageId,
    conversationId: payload.conversationId,
    artifactType: payload.artifactType,
    title: payload.title,
    description: payload.description,
    externalSystem: payload.externalSystem,
    externalId: payload.externalId,
    externalUrl: payload.externalUrl,
    thumbnailUrl: payload.thumbnailUrl,
    metadata: payload.metadata,
    ...context,
  });

  if (error || !data) {
    throw new Error(error ?? "Failed to register artifact");
  }

  const record = rowToArtifactRecord(
    (data as { artifact: CxArtifactRow }).artifact,
  );
  dispatch(upsertArtifact(record));
  return record;
});

// ── updateArtifactThunk ───────────────────────────────────────────────────────

/**
 * Update an existing artifact (e.g. after re-publishing an HTML page).
 */
export const updateArtifactThunk = createAsyncThunk<
  CxArtifactRecord,
  UpdateArtifactPayload,
  { state: RootState; dispatch: AppDispatch }
>("artifacts/update", async (payload, { dispatch }) => {
  dispatch(setOperationStatus({ id: payload.id, status: "loading" }));

  const { data, error } = await callArtifactsApi("update", payload);

  if (error || !data) {
    dispatch(setOperationStatus({ id: payload.id, status: "failed" }));
    throw new Error(error ?? "Failed to update artifact");
  }

  const record = rowToArtifactRecord(
    (data as { artifact: CxArtifactRow }).artifact,
  );
  dispatch(upsertArtifact(record));
  dispatch(setOperationStatus({ id: payload.id, status: "succeeded" }));
  return record;
});

// ── archiveArtifactThunk ──────────────────────────────────────────────────────

/**
 * Soft-delete an artifact (status → 'archived').
 * Does not hard-delete from the DB — use the delete thunk for that.
 */
export const archiveArtifactThunk = createAsyncThunk<
  void,
  string, // artifactId
  { state: RootState; dispatch: AppDispatch }
>("artifacts/archive", async (artifactId, { dispatch }) => {
  dispatch(setOperationStatus({ id: artifactId, status: "loading" }));

  const { error } = await callArtifactsApi("archive", { id: artifactId });

  if (error) {
    dispatch(setOperationStatus({ id: artifactId, status: "failed" }));
    throw new Error(error);
  }

  // Remove from the active store (archived artifacts don't show in lists)
  dispatch(removeArtifact(artifactId));
  dispatch(clearOperationStatus(artifactId));
});

// ── fetchArtifactsForMessageThunk ─────────────────────────────────────────────

/**
 * Fetch all artifacts linked to a specific message.
 * Called when the message action menu opens so the bridge knows whether
 * a page was already published from this message.
 *
 * Uses a short-circuit: if artifacts are already loaded for this message,
 * does not make a network request.
 */
export const fetchArtifactsForMessageThunk = createAsyncThunk<
  CxArtifactRecord[],
  string, // messageId
  { state: RootState; dispatch: AppDispatch }
>("artifacts/fetchForMessage", async (messageId, { getState, dispatch }) => {
  // Short-circuit if we already have data for this message
  const existing = getState().artifacts.byMessageId[messageId];
  if (existing && existing.length > 0) {
    return existing
      .map((id) => getState().artifacts.artifacts[id])
      .filter(Boolean);
  }

  const { data, error } = await callArtifactsApi("listForMessage", {
    messageId,
  });

  if (error || !data) {
    // Non-fatal — return empty array so bridge renders cleanly
    console.warn("[artifactThunks] fetchForMessage failed:", error);
    return [];
  }

  const artifacts = (data as { artifacts: CxArtifactRow[] }).artifacts.map(
    rowToArtifactRecord,
  );
  if (artifacts.length > 0) {
    dispatch(upsertManyArtifacts(artifacts));
  }
  return artifacts;
});

// ── fetchUserArtifactsThunk ───────────────────────────────────────────────────

/**
 * Fetch all artifacts for the current user, with optional filters.
 * Called on CMS page mount and after filter changes.
 */
export const fetchUserArtifactsThunk = createAsyncThunk<
  CxArtifactRecord[],
  ArtifactFilters | undefined,
  { state: RootState; dispatch: AppDispatch }
>("artifacts/fetchAll", async (filters, { dispatch }) => {
  dispatch(setFetchStatus({ status: "loading" }));

  const { data, error } = await callArtifactsApi("list", {
    filters,
  });

  if (error || !data) {
    dispatch(
      setFetchStatus({
        status: "failed",
        error: error ?? "Failed to load artifacts",
      }),
    );
    throw new Error(error ?? "Failed to load artifacts");
  }

  const artifacts = (data as { artifacts: CxArtifactRow[] }).artifacts.map(
    rowToArtifactRecord,
  );
  dispatch(upsertManyArtifacts(artifacts));
  dispatch(setFetchStatus({ status: "succeeded" }));
  return artifacts;
});

// ── deleteArtifactThunk ───────────────────────────────────────────────────────

/**
 * Hard-delete an artifact. Removes from Redux and calls the API.
 */
export const deleteArtifactThunk = createAsyncThunk<
  void,
  string,
  { state: RootState; dispatch: AppDispatch }
>("artifacts/delete", async (artifactId, { dispatch }) => {
  dispatch(setOperationStatus({ id: artifactId, status: "loading" }));

  const { error } = await callArtifactsApi("delete", { id: artifactId });

  if (error) {
    dispatch(setOperationStatus({ id: artifactId, status: "failed" }));
    throw new Error(error);
  }

  dispatch(removeArtifact(artifactId));
});

// ── updateArtifactStatusThunk ─────────────────────────────────────────────────

/**
 * Lightweight status-only update (draft → published, etc.).
 * Used after the HTML page is successfully created/updated.
 */
export const updateArtifactStatusThunk = createAsyncThunk<
  CxArtifactRecord,
  {
    id: string;
    status: ArtifactStatus;
    externalUrl?: string;
    externalId?: string;
  },
  { state: RootState; dispatch: AppDispatch }
>("artifacts/updateStatus", async (payload, { dispatch }) => {
  const { data, error } = await callArtifactsApi("update", {
    id: payload.id,
    status: payload.status,
    externalUrl: payload.externalUrl,
    externalId: payload.externalId,
  });

  if (error || !data) {
    throw new Error(error ?? "Failed to update artifact status");
  }

  const record = rowToArtifactRecord(
    (data as { artifact: CxArtifactRow }).artifact,
  );
  dispatch(upsertArtifact(record));
  return record;
});
