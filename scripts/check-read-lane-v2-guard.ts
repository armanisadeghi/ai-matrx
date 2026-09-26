/**
 * RED-then-GREEN for the read-lane v2 guard strip (scripts/lib/read-lane-v2-guard.ts), the one
 * helper check:staff-door, check:access-parity and check:row-visibility delegate to.
 *   pnpm tsx scripts/check-read-lane-v2-guard.ts
 * Pure: no database. The deparse itself is proven by migrations/read_lane_v2_a_generator.sql.
 */
import { READ_LANE_V2_GUARD, stripReadLaneV2Guard, stripReadLaneV2GuardSql } from "./lib/read-lane-v2-guard";
import { exitAfterDrain } from "./lib/exit-after-drain";

let bad = 0;
const ok = (label: string, pass: boolean) => {
  console.log(`  ${pass ? "✓" : "✗"} ${label}`);
  if (!pass) bad++;
};
const inner = "((created_by = ( SELECT auth.uid() AS uid)) OR (visibility = 'public'::platform.visibility))";
const guarded = `(${READ_LANE_V2_GUARD}(${inner}))`;
const guardedWithArm = `(${READ_LANE_V2_GUARD}((( SELECT is_platform_admin() AS is_platform_admin)) OR ${inner}))`;
const walledGuarded = `(${READ_LANE_V2_GUARD}(((visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)) OR ${inner}))`;

ok("RED   — the raw guarded text DOES mention is_platform_admin (why the guards needed teaching)", guarded.includes("is_platform_admin"));
ok("GREEN — stripped, a guarded std_select with no admin arm mentions no admin text", !stripReadLaneV2Guard(guarded).includes("is_platform_admin"));
ok("RED   — an unwalled admin ARM inside a guarded std_select is still seen after the strip", stripReadLaneV2Guard(guardedWithArm).includes("is_platform_admin"));
ok("RED   — a walled admin arm inside a guarded std_select is still there for the wall check", stripReadLaneV2Guard(walledGuarded).includes("(visibility >= 'internal'::platform.visibility) AND ( SELECT is_platform_admin() AS is_platform_admin)"));
ok("GREEN — the strip is a literal, not a pattern: a near-miss guard text is left alone",
   stripReadLaneV2Guard("(( SELECT is_platform_admin() AS is_platform_admin) IS NOT FALSE) AND (x)").includes("is_platform_admin"));
ok("GREEN — the SQL form quotes the literal and names the expression", stripReadLaneV2GuardSql("q") === `replace(q, '${READ_LANE_V2_GUARD}', '')`);
console.log(bad ? `✗ ${bad} failed` : "✓ read-lane v2 guard strip: RED and GREEN as designed");
exitAfterDrain(bad ? 1 : 0);
