#!/usr/bin/env tsx
/**
 * REACHABILITY STANDING GUARDS — `pnpm check:reachability-guards`
 *
 * Closes risks (1) and (2) of the 2026-08-15 architecture drift audit,
 * finding 8 (adjudicated 2026-08-21). `platform.reachability` is a
 * trigger-maintained closure cache that is now load-bearing for access
 * decisions, and nothing proved it stayed correct.
 *
 * Two guards, deliberately different in severity:
 *
 *   1. DEFINITION PARITY — BLOCKING. Every `platform.associations` column
 *      that `platform.containment_edges` reads must appear in the
 *      `trg_associations_reachability` `UPDATE OF` list. The two lists match
 *      only by manual synchronization; one forgotten column means the trigger
 *      silently stops firing for that column's updates and the cache rots
 *      with no symptom. The check is cheap (catalog-only), deterministic, and
 *      has exactly one correct answer — so it fails the build.
 *
 *   2. CACHE DRIFT — ADVISORY. `platform.reachability_drift()` FULL OUTER
 *      JOINs the cache against a fresh `derive_reachability()` walk, both
 *      directions, all depths, depth + level equality. Non-empty means the
 *      cache disagrees with the graph. It prints the count and a sample and
 *      does NOT fail the build: it is a full re-derivation (seconds today,
 *      growing with the graph), and the correct response is a rebuild plus a
 *      filed defect, not a blocked release.
 *
 * Non-zero drift is a DEFECT, not routine maintenance. Heal it with
 * `SELECT platform.rebuild_reachability();` (or the super-admin RPC
 * `public.admin_rebuild_reachability()`), then file the firing — a cache that
 * needed healing means a write path or trigger stopped working.
 *
 * NOT SCHEDULED. Recurring execution needs Arman's approval by name and
 * interval (common-docs/policies/no-unapproved-schedules.md). The proposal for
 * a recurring run + self-heal sits on the attention board
 * (common-docs/operations/attention.md, Table A).
 *
 * SQL side lives in migrations/reachability_standing_guards.sql
 * (`platform.reachability_drift`, `platform.reachability_definition_parity`,
 * `public.reachability_guard_report`).
 *
 *   pnpm check:reachability-guards            # parity blocks, drift is loud
 *   pnpm check:reachability-guards --strict   # same, plus drift exits 1
 */

import process from "node:process";
import { C, loadEnv, rpc } from "./lib";

const STRICT = process.argv.includes("--strict");

interface DriftRow {
  container_type: string;
  container_id: string;
  item_type: string;
  item_id: string;
  disagreement: string;
  cached_depth: number | null;
  derived_depth: number | null;
  cached_max_level: string | null;
  derived_max_level: string | null;
}

interface GuardReport {
  parity_missing_columns: string[];
  drift_total: number;
  drift_by_kind: Record<string, number>;
  drift_sample: DriftRow[];
  cached_rows: number;
  containers: number;
  checked_at: string;
}

async function main(): Promise<number> {
  const env = loadEnv();
  if (!env) {
    console.log(`${C.yellow}[WARN]${C.reset} reachability-guards: Supabase creds absent — skipped.`);
    return 0;
  }

  console.log(`${C.bold}Reachability standing guards${C.reset}\n`);
  const r = await rpc<GuardReport>(env, "reachability_guard_report", {});

  // ---- 1. Definition parity (BLOCKING) ----------------------------------
  let blocking = 0;
  if (r.parity_missing_columns.length > 0) {
    blocking += 1;
    console.log(
      `  ${C.red}FAIL${C.reset} trigger/view definition parity broken — ` +
        `platform.containment_edges reads ${r.parity_missing_columns.length} column(s) that ` +
        `trg_associations_reachability does NOT watch:`,
    );
    for (const col of r.parity_missing_columns) {
      console.log(`        ${C.yellow}platform.associations.${col}${C.reset}`);
    }
    console.log(
      `\n        Updates to those columns will not refresh platform.reachability.\n` +
        `        Fix: extend the trigger's UPDATE OF list in a migration, e.g.\n` +
        `        ${C.dim}DROP TRIGGER trg_associations_reachability ON platform.associations;\n` +
        `        CREATE TRIGGER trg_associations_reachability AFTER INSERT OR DELETE OR UPDATE OF\n` +
        `          source_type, source_id, target_type, target_id, label, deleted_at, ${r.parity_missing_columns.join(", ")}\n` +
        `          ON platform.associations FOR EACH ROW\n` +
        `          EXECUTE FUNCTION platform.trg_reachability_on_association();${C.reset}\n` +
        `        then rebuild once: ${C.dim}SELECT platform.rebuild_reachability();${C.reset}`,
    );
  } else {
    console.log(`  ${C.green}OK${C.reset} trigger watches every containment_edges column`);
  }

  // ---- 2. Cache drift (ADVISORY) ----------------------------------------
  if (r.drift_total > 0) {
    const kinds = Object.entries(r.drift_by_kind)
      .map(([k, n]) => `${k}=${n}`)
      .join(", ");
    console.log(
      `  ${C.red}DRIFT${C.reset} platform.reachability disagrees with a fresh walk on ` +
        `${C.bold}${r.drift_total}${C.reset} row(s) (${kinds})`,
    );
    for (const d of r.drift_sample) {
      console.log(
        `        ${C.yellow}${d.disagreement}${C.reset} ${d.container_type}:${d.container_id}` +
          ` -> ${d.item_type}:${d.item_id}` +
          ` depth ${d.cached_depth ?? "-"}/${d.derived_depth ?? "-"}` +
          ` level ${d.cached_max_level ?? "-"}/${d.derived_max_level ?? "-"}`,
      );
    }
    if (r.drift_total > r.drift_sample.length) {
      console.log(`        ${C.dim}… ${r.drift_total - r.drift_sample.length} more (full list: SELECT * FROM platform.reachability_drift())${C.reset}`);
    }
    console.log(
      `\n        This is a DEFECT, not maintenance. Heal, then file the firing:\n` +
        `        ${C.dim}SELECT platform.rebuild_reachability();${C.reset}`,
    );
  } else {
    console.log(
      `  ${C.green}OK${C.reset} cache agrees with a fresh derivation ` +
        `(${r.cached_rows} row(s) across ${r.containers} container(s))`,
    );
  }

  console.log("");
  if (blocking > 0) {
    console.error(`${C.red}${C.bold}REACHABILITY GUARDS: definition parity BROKEN.${C.reset} This one blocks.`);
    return 1;
  }
  if (r.drift_total > 0) {
    console.error(
      `${C.red}${C.bold}REACHABILITY GUARDS: ${r.drift_total} drifted row(s).${C.reset} Loud, non-blocking; --strict exits 1.`,
    );
    return STRICT ? 1 : 0;
  }
  console.log(`${C.green}${C.bold}REACHABILITY GUARDS CLEAN${C.reset}`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // A crash must not silently pass: parity is the blocking half and we
    // cannot tell from here whether it would have failed.
    console.error(`${C.red}[FAIL]${C.reset} reachability-guards crashed: ${String(err)}`);
    process.exit(1);
  });
