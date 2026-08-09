// features/podcasts/utils.ts
//
// Shared pure helpers for the podcasts feature. No JSX, no client deps — safe
// in both server and client modules.

/**
 * URL-safe slug from a title: lowercase, ASCII-alnum + hyphens, ≤60 chars.
 * Empty/garbage input → "" (callers append a uniqueness suffix and supply
 * their own fallback). The single slug source for shows / episodes / articles.
 */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// ─── Route builders ─────────────────────────────────────────────────────────
// THE DOOR LAW: every podcast record this app names has to be openable, so the
// paths live here once instead of being re-concatenated at each call site.

/**
 * The PUBLIC page for a show or an episode — `app/(core)/podcast/[slug]`
 * resolves either, by slug OR uuid, filtering only `deleted_at is null`
 * (publication state does not gate it). Admin surfaces that offer "copy public
 * link" offer this as a real door too.
 */
export function podcastPublicHref(slugOrId: string): string {
  return `/podcast/${slugOrId}`;
}

/** Admin show workspace — `app/(admin)/administration/knowledge/podcasts/shows/[showId]`. */
export function podcastShowAdminHref(showId: string): string {
  return `/administration/knowledge/podcasts/shows/${showId}`;
}

/** Admin episode workspace — `…/shows/[showId]/episodes/[episodeId]`. */
export function podcastEpisodeAdminHref(
  showId: string,
  episodeId: string,
): string {
  return `/administration/knowledge/podcasts/shows/${showId}/episodes/${episodeId}`;
}
