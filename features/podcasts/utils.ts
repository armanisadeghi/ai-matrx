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
