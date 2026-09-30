// features/scopes/service/storeScopeReads.ts
//
// THE BROWSER'S CALLS OF THE STORE'S SCOPE DOORS (lane SCOPES-READS-WEB). Each read calls one
// `custom.context_*` door and decodes its answer with the permanent adapter in
// `storeScopeAdapter.ts` (the mapping, its reasons, and the server's twin are documented there).

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { err, mapPgErrorPair, ok } from "@/features/scopes/service/rpcResult";
import type {
  ArchivedScopeTypeRow,
  ContextItemRow,
  ContextItemValue,
  ScopeNode,
  ScopesRpcResult,
  ScopeTypeNode,
} from "@/features/scopes/types";
import {
  archivedTypeFromStore,
  contextItemRowFromStore,
  contextValueFromStore,
  scopeNodeFromStore,
  scopeTypeNodeFromStore,
  type StoreItemRow,
  type StoreScopeRow,
  type StoreTree,
  type StoreValueRow,
} from "@/features/scopes/service/storeScopeAdapter";

// ─── the doors ──────────────────────────────────────────────────────────────────────────────────

export type ContextReadDoor =
  | "context_tree"
  | "context_scopes"
  | "context_items"
  | "context_values"
  | "context_archived_types"
  | "context_system_items"
  | "context_templates";

/** The store's doors live in the `custom` schema; the generated types do not list them yet. */
function customDoor(): SupabaseClient {
  return (supabase as unknown as SupabaseClient).schema("custom") as unknown as SupabaseClient;
}

/** The raw PostgREST call of one door, for a caller that wraps it (`runWithSessionRetry`). */
export function contextDoorQuery(name: ContextReadDoor, args: Record<string, unknown> = {}) {
  return customDoor().rpc(name, args);
}

/** One call of one door. A refusal carries the store's own sentence (`mapPgErrorPair`). */
export async function callContextDoor<T>(
  name: ContextReadDoor,
  args: Record<string, unknown> = {},
): Promise<ScopesRpcResult<T>> {
  const { data, error } = await customDoor().rpc(name, args);
  if (error) return err(...mapPgErrorPair(error));
  return ok(data as T);
}

/** Ids in batches of `size`, each batch one door call, answers concatenated in order. */
export async function inBatches<T>(
  ids: readonly string[],
  size: number,
  call: (batch: string[]) => Promise<ScopesRpcResult<T[]>>,
): Promise<ScopesRpcResult<T[]>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += size) batches.push(unique.slice(i, i + size));
  const answers = await Promise.all(batches.map(call));
  const out: T[] = [];
  for (const a of answers) {
    if (!a.ok) return a;
    out.push(...(a.data ?? []));
  }
  return ok(out);
}

/** `custom.context_values` answers at most this many scopes a call (its own refusal above it). */
export const CONTEXT_VALUES_PAGE = 200;

// ─── the reads ──────────────────────────────────────────────────────────────────────────────────

/** The live scope types (each with its live scopes) of these organizations. */
export async function readScopeTree(
  organizationIds: readonly string[],
): Promise<ScopesRpcResult<{ types: ScopeTypeNode[] }>> {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  if (ids.length === 0) return ok({ types: [] });
  const res = await callContextDoor<StoreTree>("context_tree", { p_organization_ids: ids });
  if (!res.ok) return res;
  const tree = res.data ?? { types: [], scopes: [] };
  const byType = new Map<string, ScopeNode[]>();
  for (const s of tree.scopes ?? []) {
    const node = scopeNodeFromStore(s);
    const list = byType.get(node.scope_type_id) ?? [];
    list.push(node);
    byType.set(node.scope_type_id, list);
  }
  const types = (tree.types ?? []).map((t) => ({
    ...scopeTypeNodeFromStore(t),
    scopes: byType.get(t.id) ?? [],
  }));
  return ok({ types });
}

/** Scopes by id, each in the organization it lives in (at most 1000 a call; batched here by 500). */
export async function readScopesById(ids: readonly string[]): Promise<ScopesRpcResult<StoreScopeRow[]>> {
  return inBatches(ids, 500, (batch) => callContextDoor<StoreScopeRow[]>("context_scopes", { p_scope_ids: batch }));
}

/** The context items of scope types by id (every type in its own organization). */
export async function readContextItems(typeIds: readonly string[]): Promise<ScopesRpcResult<ContextItemRow[]>> {
  const res = await inBatches(typeIds, 100, (batch) =>
    callContextDoor<StoreItemRow[]>("context_items", { p_scope_type_ids: batch }),
  );
  if (!res.ok) return res;
  return ok(res.data.map(contextItemRowFromStore));
}

/** The current values of scopes by id: the door answers at most 200 a call, so 200 scopes are ONE call. */
export async function readContextValues(
  scopeIds: readonly string[],
): Promise<ScopesRpcResult<Array<ContextItemValue & { scope_id: string }>>> {
  const res = await inBatches(scopeIds, CONTEXT_VALUES_PAGE, (batch) =>
    callContextDoor<StoreValueRow[]>("context_values", { p_scope_ids: batch }),
  );
  if (!res.ok) return res;
  return ok(res.data.map(contextValueFromStore));
}

export async function readArchivedScopeTypes(
  organizationId: string,
): Promise<ScopesRpcResult<ArchivedScopeTypeRow[]>> {
  const res = await callContextDoor<Parameters<typeof archivedTypeFromStore>[0][]>("context_archived_types", {
    p_organization_id: organizationId,
  });
  if (!res.ok) return res;
  return ok((res.data ?? []).map(archivedTypeFromStore));
}
