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

/**
 * Whose items — a filter, never permission. `all` is everything the person can see, in every
 * organization (the default: the active organization never narrows a list). `mine` is what she
 * made; an `organizationId` on it or on `organization` is the page's organization filter, which
 * narrows every lane.
 */
export type KindScope =
  | { kind: "all" }
  | { kind: "mine"; organizationId?: string | null }
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
  if (scope.kind === "all") return "all";
  if (scope.kind === "mine") return scope.organizationId ? `mine:${scope.organizationId}` : "mine";
  return `org:${scope.organizationId}`;
}

/** The inverse of `kindScopeKey` — lets a hook depend on the string alone. */
export function kindScopeFromKey(key: string): KindScope | null {
  if (key === "all") return { kind: "all" };
  if (key === "mine") return { kind: "mine" };
  if (key.startsWith("mine:") && key.length > 5) return { kind: "mine", organizationId: key.slice(5) };
  if (key.startsWith("org:") && key.length > 4) {
    return { kind: "organization", organizationId: key.slice(4) };
  }
  return null;
}

function scopeArgs(scope: KindScope): { p_organization_id?: string; p_mine?: boolean } {
  if (scope.kind === "all") return {};
  if (scope.kind === "mine") {
    return scope.organizationId ? { p_mine: true, p_organization_id: scope.organizationId } : { p_mine: true };
  }
  return { p_organization_id: scope.organizationId };
}

function failure(what: string, error: { message?: string; code?: string } | null): Error {
  // A PostgREST error is a plain object, not an Error — keep its message and code.
  const detail = error?.message ? `: ${error.message}` : "";
  const code = error?.code ? ` (${error.code})` : "";
  return new Error(`${what} failed${detail}${code}`);
}

/**
 * How many kinds one count call carries. Every kind is its own count query inside the one
 * function, and the function runs under the signed-in role's statement timeout — which cancels the
 * WHOLE call, so one slow kind would take every kind in its call down with it. A short list (the
 * Source input's Use existing: up to this many kinds) is therefore counted one kind per call, in
 * parallel; a long list ("All": every pickable kind) is split into calls of this size.
 */
const COUNT_CHUNK = 8;

/**
 * System files and folders (`metadata.system_artifact`: page captures, crawl output, coding
 * sessions, variants) are listed and counted only when the person's `files.show_system_files`
 * setting is on (default off; `useShowSystemFiles`). Omitted, the database resolves the setting
 * itself for the filtered organization.
 */
function systemArgs(showSystemFiles: boolean | undefined): { p_show_system_files?: boolean } {
  return showSystemFiles === undefined ? {} : { p_show_system_files: showSystemFiles };
}

async function countChunk(
  scope: KindScope,
  tokens: readonly string[] | undefined,
  showSystemFiles: boolean | undefined,
): Promise<Map<string, number | null>> {
  const { data, error } = await supabase.rpc("entity_kind_counts", {
    ...scopeArgs(scope),
    ...(tokens ? { p_tokens: [...tokens] } : {}),
    ...systemArgs(showSystemFiles),
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

/**
 * Per-kind counts. `tokens` omitted = every kind the Source input offers (one call).
 * A kind the database could not count comes back as `null` (show a dash, never a fake 0).
 * A short list is counted one kind per call, a long list in chunks, all in parallel; a call that
 * fails (a statement timeout included) leaves only its kinds `null`
 * (and says so in the console) — only when every chunk fails does the read fail.
 */
export async function fetchKindCounts(
  scope: KindScope,
  tokens?: readonly string[],
  showSystemFiles?: boolean,
): Promise<Map<string, number | null>> {
  if (!tokens || tokens.length <= 1) return countChunk(scope, tokens, showSystemFiles);
  const size = tokens.length <= COUNT_CHUNK ? 1 : COUNT_CHUNK;
  const chunks: string[][] = [];
  for (let i = 0; i < tokens.length; i += size) chunks.push(tokens.slice(i, i + size));
  const settled = await Promise.allSettled(chunks.map((c) => countChunk(scope, c, showSystemFiles)));
  const failed = settled.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed.length === settled.length) throw failed[0]!.reason;
  const out = new Map<string, number | null>();
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      for (const [token, n] of r.value) out.set(token, n);
      return;
    }
    console.error(`[kindInventory] could not count ${chunks[i]!.join(", ")}:`, r.reason);
    for (const token of chunks[i]!) out.set(token, null);
  });
  return out;
}

/** One page of a kind's items, most recent first, optionally filtered by name on the server. */
export async function fetchKindItemsPage(args: {
  token: string;
  scope: KindScope;
  query?: string;
  offset: number;
  limit: number;
  /** The person's `files.show_system_files` (see `systemArgs`); omitted = resolved by the database. */
  showSystemFiles?: boolean;
}): Promise<KindItem[]> {
  const search = args.query?.trim();
  const { data, error } = await supabase.rpc("reference_search_candidates", {
    p_token: args.token,
    p_order: "recent",
    p_offset: args.offset,
    p_limit: args.limit,
    ...(search ? { p_search: search } : {}),
    ...scopeArgs(args.scope),
    ...systemArgs(args.showSystemFiles),
  });
  if (error) throw failure(`Listing ${args.token} items`, error);
  return (data ?? []).map((row) => ({
    id: row.id,
    title: (row.title ?? "").trim() || "Untitled",
    updatedAt: row.updated_at ?? null,
  }));
}
