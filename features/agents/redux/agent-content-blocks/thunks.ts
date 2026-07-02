import { createAsyncThunk } from "@reduxjs/toolkit";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import { assignField } from "../shared/field-flags";
import {
  buildScopeQueryString,
  resolveRowScope,
  scopeIndexKey,
  type Scope,
  type ScopeRef,
} from "../shared/scope";
import {
  clearContentBlockScope,
  markContentBlockSaved,
  removeContentBlock,
  rollbackContentBlockOptimisticUpdate,
  setContentBlockError,
  setContentBlockLoading,
  setContentBlockScopeLoaded,
  setContentBlocksError,
  setContentBlocksStatus,
  upsertContentBlock,
  upsertContentBlocks,
} from "./slice";
import { contentBlockDefToRowPatch, contentBlockRowToDef } from "./converters";
import type {
  AgentContentBlockDef,
  ContentBlockApiRow,
  ContentBlockFieldSnapshot,
  CreateContentBlockPayload,
  UpdateContentBlockPatch,
} from "./types";
import { selectContentBlockById } from "./selectors";

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

export const fetchContentBlocksForScope = createAsyncThunk<
  AgentContentBlockDef[],
  ScopeRef,
  ThunkApi
>("agentContentBlock/fetchForScope", async (scopeRef, { dispatch }) => {
  dispatch(setContentBlocksStatus("loading"));
  dispatch(clearContentBlockScope({ scopeRef }));
  try {
    const qs = buildScopeQueryString(scopeRef);
    const response = await fetch(`/api/agent-content-blocks?${qs}`, {
      method: "GET",
      credentials: "include",
    });
    const payload = await parseJsonOrThrow<{
      data: ContentBlockApiRow[];
    }>(response);
    const defs = payload.data.map(contentBlockRowToDef);
    dispatch(upsertContentBlocks(defs));
    dispatch(setContentBlockScopeLoaded({ scopeRef, loaded: true }));
    dispatch(setContentBlocksStatus("succeeded"));
    return defs;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load content blocks";
    dispatch(setContentBlocksError(message));
    dispatch(setContentBlocksStatus("failed"));
    throw error;
  }
});

export const createContentBlock = createAsyncThunk<
  AgentContentBlockDef,
  CreateContentBlockPayload,
  ThunkApi
>("agentContentBlock/create", async (payload, { dispatch }) => {
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
    ...contentBlockDefToRowPatch(rest as Partial<AgentContentBlockDef>),
  };
  const response = await fetch("/api/agent-content-blocks", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await parseJsonOrThrow<{ data: ContentBlockApiRow }>(response);
  const def = contentBlockRowToDef(result.data);
  dispatch(upsertContentBlock(def));
  return def;
});

export type UpdateContentBlockInput = { id: string } & UpdateContentBlockPatch;

export const updateContentBlock = createAsyncThunk<
  AgentContentBlockDef,
  UpdateContentBlockInput,
  ThunkApi
>("agentContentBlock/update", async (input, { dispatch, getState }) => {
  const { id, ...patch } = input;
  const existing = selectContentBlockById(getState(), id);
  const snapshot: ContentBlockFieldSnapshot = existing
    ? (Object.keys(patch) as (keyof AgentContentBlockDef)[]).reduce(
        (acc, field) => {
          assignField(acc, field, existing[field]);
          return acc;
        },
        {} as ContentBlockFieldSnapshot,
      )
    : {};

  dispatch(setContentBlockLoading({ id, loading: true }));
  try {
    const response = await fetch(`/api/agent-content-blocks/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contentBlockDefToRowPatch(patch)),
    });
    const result = await parseJsonOrThrow<{ data: ContentBlockApiRow }>(
      response,
    );
    const def = contentBlockRowToDef(result.data);
    dispatch(upsertContentBlock(def));
    dispatch(markContentBlockSaved({ id }));
    return def;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update content block";
    dispatch(rollbackContentBlockOptimisticUpdate({ id, snapshot }));
    dispatch(setContentBlockError({ id, error: message }));
    throw error;
  } finally {
    dispatch(setContentBlockLoading({ id, loading: false }));
  }
});

export const deleteContentBlock = createAsyncThunk<void, string, ThunkApi>(
  "agentContentBlock/delete",
  async (id, { dispatch }) => {
    const response = await fetch(`/api/agent-content-blocks/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const message = `Failed to delete content block: ${response.status}`;
      dispatch(setContentBlockError({ id, error: message }));
      throw new Error(message);
    }
    dispatch(removeContentBlock(id));
  },
);

export function contentBlockScopeKey(scope: Scope, scopeId?: string | null) {
  return scopeIndexKey({ scope, scopeId: scopeId ?? null });
}
