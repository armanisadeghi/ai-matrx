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
