// features/scopes/service/entityTitles.ts
//
// Batched entity-title resolution — the "UUIDs never render" primitive.
//
// Association edges SHOULD carry a `label` stamped at attach time; this service
// covers the rest (legacy unlabeled edges, rows renamed since attach). Given a
// token + ids, it reads `id, <titleColumn>` from the registry-resolved backing
// table in chunks, RLS-scoped, and memoizes per session. Tokens without a
// title column (or unregistered tokens) resolve to nothing — callers fall back
// to `Untitled <label>` via `entityTitleFallback`.
//
// Reads go DIRECT to Postgres via supabase-js (CLAUDE.md data-flow rule).

import { supabase } from "@/utils/supabase/client";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";

const CHUNK = 100;

/** `${token}:${id}` → resolved title. Session-lifetime; titles change rarely. */
const titleCache = new Map<string, string>();

export function entityTitleCacheKey(token: string, id: string): string {
  return `${token}:${id}`;
}

/** Read the cache synchronously (for render paths after a fetch settled). */
export function getCachedEntityTitle(token: string, id: string): string | null {
  return titleCache.get(entityTitleCacheKey(token, id)) ?? null;
}

/** Display fallback when no label and no fetched title exist. */
export function entityTitleFallback(token: string): string {
  const info = tryGetEntityInfo(token);
  return `Untitled ${info?.label ?? token}`;
}

/**
 * Resolve titles for `ids` of one token. Returns ONLY the resolved entries
 * (cache + fresh reads); missing rows (deleted, no access) stay absent.
 */
export async function fetchEntityTitles(
  token: string,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;

  const info = tryGetEntityInfo(token);
  const missing: string[] = [];
  for (const id of ids) {
    const cached = titleCache.get(entityTitleCacheKey(token, id));
    if (cached !== undefined) out.set(id, cached);
    else missing.push(id);
  }
  if (missing.length === 0 || !info?.titleColumn) return out;

  const titleCol = info.titleColumn;
  const db = (
    info.schema && info.schema !== "public"
      ? supabase.schema(info.schema as "files")
      : supabase
  ) as typeof supabase;

  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK);
    const { data, error } = await db
      .from(info.table as never)
      .select(`id, ${titleCol}`)
      .in("id" as never, chunk as never[]);
    if (error) {
      // Loud but non-fatal: rows render with their fallback until fixed.
      console.error("[fetchEntityTitles] query failed", { token, error });
      continue;
    }
    for (const r of (data as Array<Record<string, unknown>>) ?? []) {
      const id = String(r.id);
      const title = String(r[titleCol] ?? "").trim();
      if (!title) continue;
      titleCache.set(entityTitleCacheKey(token, id), title);
      out.set(id, title);
    }
  }
  return out;
}
