// features/scopes/service/storeScopeReads.ts
//
// THE BROWSER'S CALLS OF THE STORE'S SCOPE DOORS (lane SCOPES-READS-WEB). Each read calls one
// `custom.context_*` door and decodes its answer with the permanent adapter in
// `storeScopeAdapter.ts` (the mapping, its reasons, and the server's twin are documented there).

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/utils/supabase/client";
import { err, mapPgErrorPair, ok } from "@/features/scopes/service/rpcResult";
import { WHOLE_VALUE_SOURCE_KIND, wholeValueSize, type WholeValuePointer } from "@ai-matrx/records/core";
import { readFileText } from "@/features/unified-data/recordsFiles";
import { INCOMPLETE_VALUE_MARKER } from "@/features/scopes/utils/incompleteValue";
import type {
  ArchivedScopeTypeRow,
  ContextItemRow,
  ContextItemValue,
  ScopeNode,
  ScopesRpcResult,
  ScopeTypeNode,
} from "@/features/scopes/types";
import {
  type StoreTypeRow,
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
  | "context_tree_types"
  | "context_tree_type_scopes"
  | "context_tree_search"
  | "context_scopes"
  | "context_items"
  | "context_values"
  | "context_archived_types"
  | "context_system_items"
  | "context_templates"
  // The archive's one read door (a scope is a Record of its type's Table): the scopes a person
  // archived are reached here, because every context_* door answers live scopes only.
  | "read_records_archived";

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
  const cells = res.data.map(contextValueFromStore);
  await wholeScopeValues(res.data, cells);
  return ok(cells);
}

// ─── a text kept as a file (SCOPES-D1, lane 9, 2026-10-02) ─────────────────────────────────────────

/** The first words with one sentence naming the file and why its whole text is not here. */
function wordsAndFile(words: string, pointer: WholeValuePointer, why: string): string {
  return `${words}${INCOMPLETE_VALUE_MARKER}${wholeValueSize(pointer)} text kept as file ${pointer.file_id}; it could not be opened here: ${why}]`;
}

/** The SHA-256 of a text's UTF-8 bytes, hex — or null where this runtime has no Web Crypto. */
async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A CELL THAT HOLDS ONLY THE FIRST WORDS OF A TEXT KEPT AS A FILE GETS ITS WHOLE TEXT.
 *
 * The record store keeps a value over its ceiling for one cell (`custom/value_max_bytes`, 100,000
 * bytes) as a file and the cell holds its first 1000 characters; `custom.context_values` names the
 * file beside that row (`whole_value`). The old scope table held the whole text, and every scope
 * screen reads `value_text`, so here each such cell is given the file's whole text — read once per
 * file, as the person, through the platform's one file reader (`readFileText`), and checked against
 * the size and SHA-256 the pointer names. A file that cannot be read, or whose content is not the
 * text the cell points at, leaves the first words with a sentence naming the file
 * (`wordsAndFile`) — never the first words passed off as the value. A text still waiting for its
 * file (`pending`) that the door could not answer whole says the rest is still being saved.
 * Mutates `cells` in place; `rows[i]` is the door's row behind `cells[i]`.
 */
export async function wholeScopeValues(
  rows: readonly StoreValueRow[],
  cells: Array<ContextItemValue & { scope_id: string }>,
  read: (args: { fileId: string }) => Promise<string> = readFileText,
): Promise<void> {
  const texts = new Map<string, Promise<string>>();
  await Promise.all(
    rows.map(async (row, i) => {
      const w = row.whole_value;
      const cell = cells[i];
      if (!w || w.in_value || !cell || typeof cell.value_text !== "string") return;
      const words = cell.value_text;
      // Every path below that does not hand the whole text marks the cell (`value_incomplete`), so
      // no editor can save the first words back over the real value (utils/incompleteValue.ts).
      const incomplete = (fileId: string | null): void => {
        cell.value_incomplete = { head: words, chars: typeof w.chars === "number" ? w.chars : null, file_id: fileId };
      };
      if (!w.file_id) {
        cell.value_text = `${words}${INCOMPLETE_VALUE_MARKER}${w.chars ?? "longer"}-character text that is still being saved; open it again in a moment for all of it.]`;
        incomplete(null);
        return;
      }
      const pointer = { ...w, kind: WHOLE_VALUE_SOURCE_KIND, file_id: w.file_id } as WholeValuePointer;
      if (!texts.has(w.file_id)) texts.set(w.file_id, read({ fileId: w.file_id }));
      try {
        const text = await texts.get(w.file_id)!;
        if (typeof w.chars === "number" && [...text].length !== w.chars) {
          cell.value_text = wordsAndFile(words, pointer, `the file holds ${[...text].length} characters, not ${w.chars}`);
          incomplete(w.file_id);
          return;
        }
        if (w.sha256) {
          // No Web Crypto (an insecure origin, an old runtime): the file cannot be checked, so it is
          // not handed as the value — unverifiable is unverified, said on the cell, never skipped.
          const sha = await sha256Hex(text);
          if (sha === null || sha !== w.sha256) {
            const why = sha === null ? "this browser cannot check the file" : "the file's content is not the text the cell points at";
            cell.value_text = wordsAndFile(words, pointer, why);
            incomplete(w.file_id);
            return;
          }
        }
        cell.value_text = text;
      } catch (thrown) {
        cell.value_text = wordsAndFile(words, pointer, thrown instanceof Error ? thrown.message : String(thrown));
        incomplete(w.file_id);
      }
    }),
  );
}

/** The archive answers at most this many rows a call (`custom.page_size` ceiling). */
export const ARCHIVED_SCOPES_PAGE = 200;

/**
 * Of these scope ids, the ones that are ARCHIVED scopes of this type (a Table of this organization),
 * paged through the archive's read door until every id is found or the archive is exhausted. A scope
 * archived away still names what was filed under it (references survive archive).
 */
export async function readArchivedScopesOfType(
  organizationId: string,
  scopeTypeId: string,
  wanted: ReadonlySet<string>,
): Promise<ScopesRpcResult<Array<{ id: string; name: string | null; slug: string | null; archived_at: string | null }>>> {
  const out: Array<{ id: string; name: string | null; slug: string | null; archived_at: string | null }> = [];
  for (let offset = 0; out.length < wanted.size; offset += ARCHIVED_SCOPES_PAGE) {
    const res = await callContextDoor<
      Array<{ id: string; document?: { name?: unknown; slug?: unknown } | null; archived_at?: string | null }>
    >("read_records_archived", {
      p_organization_id: organizationId,
      p_table_id: scopeTypeId,
      p_lane: "org",
      p_by_id: false,
      p_limit: ARCHIVED_SCOPES_PAGE,
      p_offset: offset,
    });
    if (!res.ok) return res;
    const rows = res.data ?? [];
    for (const r of rows)
      if (wanted.has(r.id))
        out.push({
          id: r.id,
          name: typeof r.document?.name === "string" ? r.document.name : null,
          slug: typeof r.document?.slug === "string" ? r.document.slug : null,
          archived_at: r.archived_at ?? null,
        });
    if (rows.length < ARCHIVED_SCOPES_PAGE) break;
  }
  return ok(out);
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

// ─── the paged tree (lane SCOPES-TREE-PAGED) ────────────────────────────────────────────────────
//
// The same rows as `readScopeTree`, asked in pieces: the scope types first (the first paint; counts
// in a second call, because a count asks the one ladder of every Table), one type's scopes a page at a
// time when it is opened, and a server-side search across every scope for the pickers and the chat
// lens. The doors answer through custom.context_tree's own body (proof:
// scripts/campaign-tests/scopestreepaged_same_rows_as_the_tree.sql).

/** One page of a type's scopes is this many (the door's default; it answers at most 1000). */
export const TYPE_SCOPES_PAGE = 200;

export interface ScopeTypeSkeleton {
  types: ScopeTypeNode[];
  /** type id → how many scopes the caller sees in it; absent when asked without counts. */
  counts: Record<string, number> | null;
}

/** The scope types of these organizations (each with `scopes: []`), with or without counts. */
export async function readScopeTypes(
  organizationIds: readonly string[],
  withCounts: boolean,
): Promise<ScopesRpcResult<ScopeTypeSkeleton>> {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  if (ids.length === 0) return ok({ types: [], counts: withCounts ? {} : null });
  const res = await callContextDoor<{ types?: Array<StoreTypeRow & { scope_count?: number }> }>(
    "context_tree_types",
    { p_organization_ids: ids, p_with_counts: withCounts },
  );
  if (!res.ok) return res;
  const rows = res.data?.types ?? [];
  const counts: Record<string, number> | null = withCounts ? {} : null;
  if (counts) for (const r of rows) counts[r.id] = Number(r.scope_count ?? 0);
  return ok({ types: rows.map(scopeTypeNodeFromStore), counts });
}

export interface ScopePage {
  scopes: ScopeNode[];
  total: number;
  nextOffset: number | null;
}

/** One page of one type's scopes, in the whole tree's order. */
export async function readTypeScopesPage(
  scopeTypeId: string,
  offset = 0,
  limit = TYPE_SCOPES_PAGE,
): Promise<ScopesRpcResult<ScopePage>> {
  const res = await callContextDoor<{ scopes?: StoreScopeRow[]; total?: number; next_offset?: number | null }>(
    "context_tree_type_scopes",
    { p_scope_type_id: scopeTypeId, p_offset: offset, p_limit: limit },
  );
  if (!res.ok) return res;
  return ok({
    scopes: (res.data?.scopes ?? []).map(scopeNodeFromStore),
    total: Number(res.data?.total ?? 0),
    nextOffset: res.data?.next_offset ?? null,
  });
}

/** The scopes whose name holds `query` (case-insensitive), across these organizations. */
export async function searchScopesInStore(
  organizationIds: readonly string[],
  query: string,
  limit = 100,
): Promise<ScopesRpcResult<{ scopes: ScopeNode[]; total: number }>> {
  const ids = [...new Set(organizationIds.filter(Boolean))];
  const q = query.trim();
  if (ids.length === 0 || q === "") return ok({ scopes: [], total: 0 });
  const res = await callContextDoor<{ scopes?: StoreScopeRow[]; total?: number }>("context_tree_search", {
    p_organization_ids: ids,
    p_query: q,
    p_limit: limit,
  });
  if (!res.ok) return res;
  return ok({ scopes: (res.data?.scopes ?? []).map(scopeNodeFromStore), total: Number(res.data?.total ?? 0) });
}
