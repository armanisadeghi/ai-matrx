/**
 * THE ROW GATE EVERY SIGNED-OUT PODCAST EPISODE READER APPLIES — one predicate,
 * every public reader, never a second copy.
 *
 * WHY THIS FILE EXISTS (DD-234 residue, V-103, 2026-09-14). `publicColumns.ts`
 * collapsed the COLUMN half of "what a signed-out listener may see" into one
 * list. The ROW half was still written out per route, and the two routes that
 * serve the same episodes disagreed:
 *
 *   feed.xml       .is('deleted_at', null).eq('is_published', true)
 *   chapters.json  .is('deleted_at', null)                           ← no publish gate
 *
 * `podcast.pc_episodes`' generated `pub_read` policy is
 * `deleted_at IS NULL AND visibility = 'public'` — it carries no `is_published`
 * term at all. So RLS alone does NOT close the gap, and V-103 proved it against
 * the live database: a `visibility='public', is_published=false` episode
 * inserted inside a rolled-back transaction WAS readable by `anon`. Its chapters
 * would therefore have been served by `chapters.json` while the show's own feed
 * deliberately excluded the episode — a draft's chapter titles published to
 * anyone who guessed the slug, out of a route nobody thought of as a publishing
 * surface.
 *
 * Two facts, two gates, and only one of them was being applied everywhere:
 *   `visibility = 'public'` — may a signed-out reader see this row at all (RLS);
 *   `is_published = true`   — has the owner published this episode (ours).
 *
 * So: one helper, called by every public episode reader. Adding a third reader
 * means calling this; changing the rule means changing it here, once.
 */

/**
 * The minimum shape of a PostgREST query builder this gate needs. Structural on
 * purpose — supabase-js's `PostgrestFilterBuilder` methods return `this`, so a
 * real builder satisfies it and the call site keeps its full row typing.
 */
export interface GateableEpisodeQuery<Q> {
  is(column: "deleted_at", value: null): Q;
  eq(column: "is_published", value: true): Q;
}

/**
 * Narrow an episode query to the rows a signed-out listener may be served:
 * not soft-deleted, and published by its owner.
 *
 * `visibility` is deliberately NOT repeated here — it is the row-security
 * gate (`pub_read`), it is applied to a signed-out reader whether a query asks
 * for it or not, and re-stating it in a client filter would read as though this
 * helper were the thing enforcing it.
 */
export function publiclyServableEpisodes<Q extends GateableEpisodeQuery<Q>>(
  query: Q,
): Q {
  return query.is("deleted_at", null).eq("is_published", true);
}
