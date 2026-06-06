/**
 * Display name → snake_case key.
 * Lowercase, replace whitespace/hyphens with `_`, strip non-alphanumeric_underscore,
 * collapse repeats, trim leading/trailing underscores.
 */
export function slugifyKey(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Display name → kebab-case URL slug (the human-readable route segment).
 * Lowercase, non-alphanumerics → single hyphen, trim leading/trailing hyphens.
 * Mirrors the SQL backfill in `migrations/ctx_add_slugs_columns_backfill_indexes.sql`.
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** True when `s` is already a clean kebab slug (a-z, 0-9, single hyphens). */
export function isValidSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a route segment is a UUID (resolve by id) vs a slug (resolve by name). */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
