// features/scopes/service/entityTitles.ts
//
// HOST WIRING (W5 swap, 2026-08-29): chunked, session-cached title
// resolution lives in `@ai-matrx/associations/core` (createTitlesService —
// store-instance cache, registry titleColumn reads, `prime` after renames).
// Bound here to the host store under the historical free-function names.

import { getAssociationsStore } from "@/features/scopes/host/associationsStore";

export { entityTitleCacheKey } from "@ai-matrx/associations/core";

/** Read the session cache synchronously (render paths after a fetch settled). */
export function getCachedEntityTitle(token: string, id: string): string | null {
  return getAssociationsStore().titles.get(token, id);
}

/** Push a known-fresh title (after a rename/create) so no surface shows stale. */
export function primeEntityTitle(token: string, id: string, title: string): void {
  getAssociationsStore().titles.prime(token, id, title);
}

/** Display fallback when no label and no fetched title exist. */
export function entityTitleFallback(token: string): string {
  return getAssociationsStore().titles.fallback(token);
}

/**
 * Resolve titles for `ids` of one token. Returns ONLY the resolved entries
 * (cache + fresh reads); missing rows (deleted, no access) stay absent.
 */
export async function fetchEntityTitles(
  token: string,
  ids: string[],
): Promise<Map<string, string>> {
  return getAssociationsStore().titles.fetch(token, ids);
}
