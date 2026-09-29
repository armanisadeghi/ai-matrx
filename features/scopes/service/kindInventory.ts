// features/scopes/service/kindInventory.ts
//
// "What you have", by kind — the two reads behind `useKindCounts` / `useKindItems`.
//
// Both go to ONE database filter (`platform._inventory_filter`), so a kind's count is always the
// length of its list: `public.entity_kind_counts` counts it, `public.reference_search_candidates`
// pages it (recent first, server-searched by name). Machine files (child files, system paths, crawl
// and system artifacts, files that belong to a chat/session/profile) are hidden by that filter on
// both sides. The scope is a FILTER, never permission — row security stays the ceiling.
//
// Which kinds the Source input offers is the registry's `source_input_pickable` flag: call
// `fetchKindCounts(scope)` with no tokens and the database answers for exactly those kinds.

import { supabase } from "@/utils/supabase/client";

/** Whose items: the signed-in person's own, or one organization's. A filter, never permission. */
export type KindScope =
  | { kind: "mine" }
  | { kind: "organization"; organizationId: string };

/** The feature knob that sets how many items a per-kind list loads at a time. */
export const INVENTORY_PAGE_SIZE_KNOB = {
  feature: "resources.inventory",
  key: "page_size",
} as const;

export interface KindItem {
  id: string;
  title: string;
  /** Last change, ISO string; null when the kind's table has no timestamp. */
  updatedAt: string | null;
}

/** A stable string for a scope — use it as a dependency / cache key. */
export function kindScopeKey(scope: KindScope | null | undefined): string {
  if (!scope) return "";
  return scope.kind === "mine" ? "mine" : `org:${scope.organizationId}`;
}

/** The inverse of `kindScopeKey` — lets a hook depend on the string alone. */
export function kindScopeFromKey(key: string): KindScope | null {
  if (key === "mine") return { kind: "mine" };
  if (key.startsWith("org:") && key.length > 4) {
    return { kind: "organization", organizationId: key.slice(4) };
  }
  return null;
}

function scopeArgs(scope: KindScope): { p_organization_id?: string; p_mine?: boolean } {
  return scope.kind === "mine"
    ? { p_mine: true }
    : { p_organization_id: scope.organizationId };
}

function failure(what: string, error: { message?: string; code?: string } | null): Error {
  // A PostgREST error is a plain object, not an Error — keep its message and code.
  const detail = error?.message ? `: ${error.message}` : "";
  const code = error?.code ? ` (${error.code})` : "";
  return new Error(`${what} failed${detail}${code}`);
}

/**
 * Per-kind counts in one round trip. `tokens` omitted = every kind the Source input offers.
 * A kind the database could not count comes back as `null` (show a dash, never a fake 0).
 */
export async function fetchKindCounts(
  scope: KindScope,
  tokens?: readonly string[],
): Promise<Map<string, number | null>> {
  const { data, error } = await supabase.rpc("entity_kind_counts", {
    ...scopeArgs(scope),
    ...(tokens ? { p_tokens: [...tokens] } : {}),
  });
  if (error) throw failure("Counting your items", error);
  const out = new Map<string, number | null>();
  for (const row of data ?? []) {
    // The generated type says number; the function returns NULL for an uncountable kind.
    const n = row.n as number | null;
    out.set(row.token, n === null || n === undefined ? null : Number(n));
  }
  return out;
}

/** One page of a kind's items, most recent first, optionally filtered by name on the server. */
export async function fetchKindItemsPage(args: {
  token: string;
  scope: KindScope;
  query?: string;
  offset: number;
  limit: number;
}): Promise<KindItem[]> {
  const search = args.query?.trim();
  const { data, error } = await supabase.rpc("reference_search_candidates", {
    p_token: args.token,
    p_order: "recent",
    p_offset: args.offset,
    p_limit: args.limit,
    ...(search ? { p_search: search } : {}),
    ...scopeArgs(args.scope),
  });
  if (error) throw failure(`Listing ${args.token} items`, error);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: (row.title ?? "").trim() || "Untitled",
    updatedAt: row.updated_at ?? null,
  }));
}
