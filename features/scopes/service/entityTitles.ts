// features/scopes/service/entityTitles.ts
//
// Batched entity-title resolution — the "UUIDs never render" primitive.
//
// Association edges SHOULD carry a `label` stamped at attach time; this service
// covers the rest (legacy unlabeled edges, rows renamed since attach). Given a
// token + ids, it reads `id, <titleColumn>` from the registry-resolved backing
// table through the registry-driven candidate RPC and memoizes per session. Tokens without a
// title column (or unregistered tokens) resolve to nothing — callers fall back
// to `Untitled <label>` via `entityTitleFallback`.
//
// Reads go DIRECT to Postgres via supabase-js (CLAUDE.md data-flow rule).

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { callReferenceSearchCandidates } from "@/features/scopes/service/associationCandidates";

const CHUNK = 200;

/** `${token}:${id}` → resolved title. Session-lifetime; titles change rarely. */
const titleCache = new Map<string, string>();

export function entityTitleCacheKey(token: string, id: string): string {
  return `${token}:${id}`;
}

/** Read the cache synchronously (for render paths after a fetch settled). */
export function getCachedEntityTitle(token: string, id: string): string | null {
  return titleCache.get(entityTitleCacheKey(token, id)) ?? null;
}

/**
 * Push a known-fresh title into the cache (after a rename or a create), so
 * surfaces that resolve through this service never show a stale name.
 */
export function primeEntityTitle(
  token: string,
  id: string,
  title: string,
): void {
  const trimmed = title.trim();
  if (trimmed) titleCache.set(entityTitleCacheKey(token, id), trimmed);
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

  for (let index = 0; index < missing.length; index += CHUNK) {
    const ids = missing.slice(index, index + CHUNK);
    const { data, error } = await callReferenceSearchCandidates({
      p_token: token,
      p_ids: ids,
      p_limit: ids.length,
    });
    if (error) {
      console.error("[fetchEntityTitles] candidate RPC failed", {
        token,
        chunkStart: index,
        chunkSize: ids.length,
        error,
      });
      continue;
    }
    for (const row of data) {
      const title = row.title?.trim();
      if (!title) continue;
      titleCache.set(entityTitleCacheKey(token, row.id), title);
      out.set(row.id, title);
    }
  }
  return out;
}
