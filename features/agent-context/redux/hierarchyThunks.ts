"use client";

// features/context/redux/hierarchyThunks.ts
//
// Single fetch: get_user_full_context returns everything in one call —
// orgs, projects (with scope_tags), tasks, scope types, and scope values.
//
// The thunk fans the response out to hierarchySlice / organizationsSlice /
// projectsSlice / tasksSlice (orgs / projects / tasks). Its scope types and
// scopes are NOT fanned out: the canonical scope tree (`state.scopesTree`,
// `ensureScopeTree`) is the one home of those rows.
//
// Usage:
//   dispatch(fetchFullContext())              — app boot / sidebar mount
//   dispatch(invalidateAndRefetchFullContext()) — after any CRUD mutation

import { scopesService } from "@/features/scopes/service/scopesService";
import {
  fullContextFetchStarted,
  fullContextFetchSucceeded,
  fullContextFetchFailed,
  invalidateFullContext,
  type FullContextResponse,
} from "./hierarchySlice";
import { hydrateOrgsFromContext } from "./organizationsSlice";
import { hydrateProjectsFromContext } from "./projectsSlice";
import { hydrateTasksFromContext } from "./tasksSlice";
import type { AppDispatch } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";

// This RPC gates the initial task workspace as well as the organization and
// scope pickers. It must reach a visible retry state rather than leaving every
// dependent surface in a permanent skeleton when the request stalls.
export const FULL_CONTEXT_REQUEST_TIMEOUT_MS = 20_000;
const FULL_CONTEXT_TIMEOUT_MESSAGE =
  "Loading your workspace took too long. Please try again.";

// ─── Internal helpers ─────────────────────────────────────────────────────

async function doFetchFullContext(dispatch: AppDispatch) {
  dispatch(fullContextFetchStarted());
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, FULL_CONTEXT_REQUEST_TIMEOUT_MS);

  try {
    // `get_user_full_context` reaches context.*: through the scopes chokepoint.
    const { data, error } = await scopesService.fetchUserFullContext(
      controller.signal,
    );

    if (error) {
      if (didTimeout) {
        throw new Error(FULL_CONTEXT_TIMEOUT_MESSAGE);
      }

      // New users with no org memberships may trigger a Postgres-level error
      // (e.g. RLS, no rows). Treat this as an empty state rather than a crash.
      const msg = extractErrorMessage(error);
      const isEmptyState =
        error.code === "PGRST116" || // "no rows returned"
        msg.toLowerCase().includes("no rows") ||
        msg.toLowerCase().includes("no data");

      if (isEmptyState) {
        dispatch(fullContextFetchSucceeded({ organizations: [] }));
        return;
      }

      console.error("[fetchFullContext] RPC error:", error);
      throw error;
    }

    const response = (data as unknown as FullContextResponse) ?? {
      organizations: [],
    };

    const orgs = response.organizations ?? [];

    // ── Fan org, project, and task data out to normalized slices ─────────
    dispatch(hydrateOrgsFromContext(orgs));

    const projectsPayload = orgs.map((org) => ({
      orgId: org.id,
      projects: org.projects ?? [],
    }));
    dispatch(hydrateProjectsFromContext(projectsPayload));

    // Tasks are now a flat array per org in the new RPC response shape.
    // Each task has project_id (null = orphaned) and parent_task_id.
    const tasksPayload = orgs.map((org) => ({
      orgId: org.id,
      tasks: org.tasks ?? [],
    }));
    dispatch(hydrateTasksFromContext(tasksPayload));

    dispatch(fullContextFetchSucceeded(response));
  } catch (err) {
    const message = didTimeout
      ? FULL_CONTEXT_TIMEOUT_MESSAGE
      : extractErrorMessage(err);
    console.error("[fetchFullContext]", message, err);
    dispatch(fullContextFetchFailed(message));
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── fetchFullContext ─────────────────────────────────────────────────────

/**
 * Fetch the full user hierarchy (orgs, projects, tasks, scopes).
 * Skips if data is already loading or loaded.
 * Safe to call from multiple components — only one network request fires.
 */
export function fetchFullContext() {
  return (
    dispatch: AppDispatch,
    getState: () => { hierarchy: { fullContextStatus: string } },
  ) => {
    const status = getState().hierarchy.fullContextStatus;
    if (status === "loading" || status === "success") return undefined;
    return doFetchFullContext(dispatch);
  };
}

/**
 * @deprecated — use fetchFullContext(). Kept for backwards compat.
 */
export const fetchNavTree = fetchFullContext;

// ─── Invalidate + re-fetch helpers ────────────────────────────────────────

/**
 * Invalidate the full context and trigger a fresh fetch.
 * Use after any mutation that changes orgs, projects, tasks, or scopes.
 */
export function invalidateAndRefetchFullContext() {
  return (dispatch: AppDispatch) => {
    dispatch(invalidateFullContext());
    return doFetchFullContext(dispatch);
  };
}

/**
 * @deprecated — use invalidateAndRefetchFullContext().
 */
export const invalidateAndRefetchNavTree = invalidateAndRefetchFullContext;

/**
 * @deprecated — use invalidateAndRefetchFullContext().
 */
export const invalidateAndRefetchAll = invalidateAndRefetchFullContext;
