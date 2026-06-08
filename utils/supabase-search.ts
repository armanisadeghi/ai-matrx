/**
 * Server-side search helpers for Supabase / PostgREST queries.
 *
 * The client-side counterpart is `@/utils/search-scoring` (relevance scoring +
 * automatic id matching for in-memory lists). This module is the equivalent for
 * queries that filter in the database via PostgREST, where we can't pull the
 * whole table into memory.
 *
 * Usage:
 *   query = query.or(buildSearchOr(term, ["name", "description"]));
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when `value` is a complete, well-formed UUID. */
export function isFullUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/**
 * Build a PostgREST `.or(...)` filter string that searches each of `textColumns`
 * with case-insensitive substring matching, AND — when the term is a complete
 * UUID — the row's id column via equality. So an admin can paste a record's full
 * id into the search box and find it, the same way the client-side helper lets
 * them paste a partial one.
 *
 * Reserved PostgREST grammar characters (`,` `(` `)`) are stripped from the LIKE
 * pattern so a stray comma can't break the filter or inject extra clauses.
 *
 * LIMITATION — partial UUIDs: PostgREST cannot cast a `uuid` column to text
 * inside a filter, so a *partial* id can't be matched with `ilike` here. Full
 * pasted UUIDs match via `id.eq`; partial-UUID server-side search needs a
 * generated `id::text` column (or an RPC) on the target table — tracked as a
 * follow-up. Endpoints that also filter client-side get partial matching for
 * free via `@/utils/search-scoring` once the row is in memory.
 */
export function buildSearchOr(
  term: string,
  textColumns: string[],
  opts?: { idColumn?: string },
): string {
  const trimmed = term.trim();
  const safe = trimmed.replace(/[(),]/g, " ");
  const parts = textColumns.map((c) => `${c}.ilike.%${safe}%`);
  if (isFullUuid(trimmed)) {
    parts.push(`${opts?.idColumn ?? "id"}.eq.${trimmed}`);
  }
  return parts.join(",");
}
