/**
 * WHO SAVED a component row — the one reader, because `created_by` cannot answer it.
 *
 * A `component` table takes its access from a parent (db-rules §6d-1). On those tables the
 * trigger `zzz_component_created_by` (`platform.component_created_by_from_parent()`) rewrites
 * `created_by` to the PARENT's owner on insert and on reparent. So on a component:
 *
 * - `created_by` = the parent's owner. Never the saver, author, recipient, a "mine" key, or a
 *   per-viewer key.
 * - `updated_by` = the person who last saved the row. `platform._stamp_actor` stamps it from
 *   `app.user_id` / `auth.uid()` on every write, and nothing rewrites it to anybody else.
 *
 * `updated_by` is NULL when the write declared no person (a server write). That is "unknown"
 * and the caller must say so. It must NEVER fall back to `created_by`: that fallback is how a
 * test monitor's digest reached the brand owner's personal inbox (aidream, 2026-09-27).
 *
 * Twin of aidream's `aidream/services/provenance/component_actor.py::component_saver`.
 * Guard: `pnpm check:component-created-by-reads`.
 */
export function componentSaver(
  row: { updated_by?: string | null } | null | undefined,
): string | null {
  const value = row?.updated_by;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
