"use client";

// features/context/redux/hierarchyThunks.ts
//
// Single fetch: get_user_full_context returns everything in one call —
// orgs, projects (with scope_tags), tasks, scope types, and scope values.
//
// The thunk fans the response out to:
//   - hierarchySlice   (orgs / projects / tasks)
//   - scopeTypesSlice  (scope type definitions per org)
//   - scopesSlice      (scope values per org)
//
// This means scope pickers are populated immediately on app load without
// any per-org secondary fetches.
//
// Usage:
//   dispatch(fetchFullContext())              — app boot / sidebar mount
//   dispatch(invalidateAndRefetchFullContext()) — after any CRUD mutation

import { supabase } from "@/utils/supabase/client";
import {
  fullContextFetchStarted,
  fullContextFetchSucceeded,
  fullContextFetchFailed,
  invalidateFullContext,
  type FullContextResponse,
  type FullContextScopeType,
  type FullContextScope,
} from "./hierarchySlice";
import { hydrateScopeTypesFromContext } from "./scope/scopeTypesSlice";
import { hydrateScopesFromContext } from "./scope/scopesSlice";
import { hydrateOrgsFromContext } from "./organizationsSlice";
import { hydrateProjectsFromContext } from "./projectsSlice";
import { hydrateTasksFromContext } from "./tasksSlice";
import type { ScopeType } from "./scope/types";
import type { Scope } from "./scope/types";
import type { AppDispatch } from "@/lib/redux/store";
import { extractErrorMessage } from "@/utils/errors";

// ─── Internal helpers ─────────────────────────────────────────────────────

/**
 * Map the scope type shape returned by get_user_full_context to the full
 * ScopeType shape used by scopeTypesSlice (adds organization_id).
 */
function mapScopeType(orgId: string, t: FullContextScopeType): ScopeType {
  return {
    id: t.id,
    organization_id: orgId,
    parent_type_id: t.parent_type_id,
    label_singular: t.label_singular,
    label_plural: t.label_plural,
    icon: t.icon,
    description: t.description,
    color: t.color,
    sort_order: t.sort_order,
    max_assignments_per_entity: t.max_assignments_per_entity,
    default_variable_keys: t.default_variable_keys ?? [],
    created_at: t.created_at,
    updated_at: t.updated_at,
  };
}

/**
 * Map the scope shape returned by get_user_full_context to the full
 * Scope shape used by scopesSlice (adds organization_id).
 */
function mapScope(orgId: string, s: FullContextScope): Scope {
  return {
    id: s.id,
    organization_id: orgId,
    scope_type_id: s.scope_type_id,
    parent_scope_id: s.parent_scope_id,
    name: s.name,
    description: s.description ?? "",
    settings: s.settings ?? {},
    sort_order: s.sort_order ?? 0,
    created_by: s.created_by,
    created_at: s.created_at,
    updated_at: s.updated_at,
    _type_label: s.type_label,
  };
}

async function doFetchFullContext(dispatch: AppDispatch) {
  dispatch(fullContextFetchStarted());
  try {
    const { data, error } = await supabase.rpc("get_user_full_context");

    if (error) {
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

    // ── Fan scope data out ───────────────────────────────────────────────
    const scopeTypesPayload = orgs.map((org) => ({
      orgId: org.id,
      types: (org.scope_types ?? []).map((t) => mapScopeType(org.id, t)),
    }));

    const scopesPayload = orgs.map((org) => ({
      orgId: org.id,
      scopes: (org.scopes ?? []).map((s) => mapScope(org.id, s)),
    }));

    dispatch(hydrateScopeTypesFromContext(scopeTypesPayload));
    dispatch(hydrateScopesFromContext(scopesPayload));

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
    const message = extractErrorMessage(err);
    console.error("[fetchFullContext]", message, err);
    dispatch(fullContextFetchFailed(message));
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
    if (status === "loading" || status === "success") return;
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
