import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import {
  buildScopeQueryString,
  resolveRowScope,
  scopeIndexKey,
  type Scope,
  type ScopeRef,
} from "../shared/scope";
import {
  clearCategoryScope,
  markCategorySaved,
  removeCategory,
  rollbackCategoryOptimisticUpdate,
  setCategoriesError,
  setCategoriesStatus,
  setCategoryError,
  setCategoryLoading,
  setCategoryScopeLoaded,
  upsertCategories,
  upsertCategory,
} from "./slice";
import { categoryDefToRowPatch, categoryRowToDef } from "./converters";
import type {
  AgentShortcutCategoryDef,
  CategoryApiRow,
  CategoryFieldSnapshot,
  CreateCategoryPayload,
  UpdateCategoryPatch,
} from "./types";
import { selectCategoryById } from "./selectors";

type ThunkApi = { dispatch: AppDispatch; state: RootState };

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status} ${response.statusText}`;
    try {
      const body = await response.json();
      if (body && typeof body === "object") {
        const b = body as Record<string, unknown>;
        const parts: string[] = [];
        if (typeof b.error === "string") parts.push(b.error);
        if (typeof b.details === "string") parts.push(`Details: ${b.details}`);
        if (typeof b.hint === "string") parts.push(`Hint: ${b.hint}`);
        if (parts.length > 0) message = parts.join(" — ");
      }
    } catch {
      // no body or non-JSON response — keep the HTTP status message
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export const fetchCategoriesForScope = createAsyncThunk<
  AgentShortcutCategoryDef[],
  ScopeRef,
  ThunkApi
>("agentShortcutCategory/fetchForScope", async (scopeRef, { dispatch }) => {
  dispatch(setCategoriesStatus("loading"));
  dispatch(clearCategoryScope({ scopeRef }));
  try {
    const qs = buildScopeQueryString(scopeRef);
    const response = await fetch(`/api/agent-shortcut-categories?${qs}`, {
      method: "GET",
      credentials: "include",
    });
    const payload = await parseJsonOrThrow<{
      data: CategoryApiRow[];
    }>(response);
    const defs = payload.data.map(categoryRowToDef);
    dispatch(upsertCategories(defs));
    dispatch(setCategoryScopeLoaded({ scopeRef, loaded: true }));
    dispatch(setCategoriesStatus("succeeded"));
    return defs;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load categories";
    dispatch(setCategoriesError(message));
    dispatch(setCategoriesStatus("failed"));
    throw error;
  }
});

export const createCategory = createAsyncThunk<
  AgentShortcutCategoryDef,
  CreateCategoryPayload,
  ThunkApi
>("agentShortcutCategory/create", async (payload, { dispatch }) => {
  const { scope: explicitScope, scopeId, ...rest } = payload;
  const scope: Scope =
    explicitScope ??
    resolveRowScope({
      userId: rest.userId ?? null,
      organizationId: rest.organizationId ?? null,
      projectId: rest.projectId ?? null,
      taskId: rest.taskId ?? null,
    });
  const body = {
    scope,
    scopeId: scopeId ?? null,
    ...categoryDefToRowPatch(rest as Partial<AgentShortcutCategoryDef>),
  };
  const response = await fetch("/api/agent-shortcut-categories", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await parseJsonOrThrow<{ data: CategoryApiRow }>(response);
  const def = categoryRowToDef(result.data);
  dispatch(upsertCategory(def));
  return def;
});

export interface DuplicateCategoryInput {
  id: string;
  /** Optional new label. When omitted the API uses `"{source.label} (Copy)"`. */
  label?: string | null;
  /** Optional new placement type. When omitted the source placement is kept. */
  placementType?: string | null;
  /**
   * Optional new parent category id. Defaults to `null` when moving placements
   * (parents don't cross placements), otherwise inherits the source parent.
   */
  parentCategoryId?: string | null;
  /** Optional new sort order. Defaults to the source's sort order. */
  sortOrder?: number | null;
}

/**
 * Duplicates a category row. Ownership (`user_id`/`organization_id`/
 * `project_id`/`task_id`) on the copy exactly matches the source row, so
 * admins duplicating global categories get global copies and users stay in
 * their own scope.
 */
export const duplicateCategory = createAsyncThunk<
  AgentShortcutCategoryDef,
  DuplicateCategoryInput,
  ThunkApi
>("agentShortcutCategory/duplicate", async (input, { dispatch }) => {
  const { id, label, placementType, parentCategoryId, sortOrder } = input;

  const body: Record<string, unknown> = {};
  if (typeof label === "string") body.label = label;
  if (typeof placementType === "string") body.placement_type = placementType;
  if (parentCategoryId === null || typeof parentCategoryId === "string") {
    body.parent_category_id = parentCategoryId;
  }
  if (typeof sortOrder === "number") body.sort_order = sortOrder;

  const response = await fetch(
    `/api/agent-shortcut-categories/${id}/duplicate`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const result = await parseJsonOrThrow<{ data: CategoryApiRow }>(response);
  const def = categoryRowToDef(result.data);
  dispatch(upsertCategory(def));
  return def;
});

export type UpdateCategoryInput = { id: string } & UpdateCategoryPatch;

export const updateCategory = createAsyncThunk<
  AgentShortcutCategoryDef,
  UpdateCategoryInput,
  ThunkApi
>("agentShortcutCategory/update", async (input, { dispatch, getState }) => {
  const { id, ...patch } = input;
  const existing = selectCategoryById(getState(), id);
  const snapshot: CategoryFieldSnapshot = existing
    ? (Object.keys(patch) as (keyof AgentShortcutCategoryDef)[]).reduce(
        (acc, field) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (acc as any)[field] = (existing as any)[field];
          return acc;
        },
        {} as CategoryFieldSnapshot,
      )
    : {};

  dispatch(setCategoryLoading({ id, loading: true }));
  try {
    const response = await fetch(`/api/agent-shortcut-categories/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(categoryDefToRowPatch(patch)),
    });
    const result = await parseJsonOrThrow<{ data: CategoryApiRow }>(response);
    const def = categoryRowToDef(result.data);
    dispatch(upsertCategory(def));
    dispatch(markCategorySaved({ id }));
    return def;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update category";
    dispatch(rollbackCategoryOptimisticUpdate({ id, snapshot }));
    dispatch(setCategoryError({ id, error: message }));
    throw error;
  } finally {
    dispatch(setCategoryLoading({ id, loading: false }));
  }
});

export const deleteCategory = createAsyncThunk<void, string, ThunkApi>(
  "agentShortcutCategory/delete",
  async (id, { dispatch }) => {
    const response = await fetch(`/api/agent-shortcut-categories/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const message = `Failed to delete category: ${response.status}`;
      dispatch(setCategoryError({ id, error: message }));
      throw new Error(message);
    }
    dispatch(removeCategory(id));
  },
);

export function categoryScopeKey(scope: Scope, scopeId?: string | null) {
  return scopeIndexKey({ scope, scopeId: scopeId ?? null });
}
