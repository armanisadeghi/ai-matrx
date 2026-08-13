/**
 * Client-side mirror of `seo.fn_normalize_phrase` for lookups: lowercase,
 * trimmed, single-spaced. Persisted normalization stays server-owned — this
 * exists only to match against the stored `normalized_phrase` column.
 *
 * Lives in its own module (not `./data.ts`) because SERVER code needs it —
 * `data.ts` instantiates the browser Supabase client at import time, which has
 * no business in a Server Component's module graph. `data.ts` re-exports this
 * so every existing import path keeps working; there is still ONE definition.
 */
export function normalizeKeywordPhrase(phrase: string): string {
  return phrase.toLowerCase().trim().replace(/\s+/g, " ");
}
