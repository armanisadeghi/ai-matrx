/**
 * READ-LANE V2 (P2/P4) — the lane-admin guard on an enrolled table's `std_select`.
 *
 * `iam._apply_rls_unchecked` wraps an enrolled table's std_select as
 *   ((select public.is_platform_admin()) is not true) and (<today's USING>)
 * so a platform admin inside the admin lane SKIPS std_select (and reads every row through
 * `platform_admin_read`). The guard only NARROWS std_select: it grants nothing to anyone.
 *
 * Every guard that judges std_select by matching admin text strips this EXACT literal — the
 * deparse PostgreSQL prints, never a pattern — so an admin ARM anywhere is still seen. The literal is
 * the same one `iam.read_lane_v2_guard_deparsed()` returns, and the functions migration
 * (migrations/read_lane_v2_a_generator.sql) proves it against a real pg_get_viewdef.
 *
 * Design + chair approval: common-docs/projects/rich-content-unification/evidence/generator-perf-design.md
 */
export const READ_LANE_V2_GUARD = "(( SELECT is_platform_admin() AS is_platform_admin) IS NOT TRUE) AND ";

/** The policy text with the guard removed (whitespace-normalised input is fine: the literal has single spaces). */
export function stripReadLaneV2Guard(qual: string): string {
  return qual.split(READ_LANE_V2_GUARD).join("");
}

/** The same strip, as a SQL expression over `expr` (for guards that match inside their query). */
export function stripReadLaneV2GuardSql(expr: string): string {
  return `replace(${expr}, '${READ_LANE_V2_GUARD.replace(/'/g, "''")}', '')`;
}
