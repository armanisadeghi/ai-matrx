#!/usr/bin/env npx tsx
/**
 * Topic-placement ceiling counter — does "placed today" count placements made today?
 *
 * WHAT IT PROTECTS: the per-site daily ceiling of the topic-placement backfill
 * (`seo.topic_placement.daily_keyword_ceiling`, "Keywords placed per UTC day, per
 * site"). The handler (aidream/services/seo/topic_placement_backfill.py) reads the
 * day's spend from `seo.fn_topic_placement_settled_since(site, midnight)`, which
 * counts ledger rows whose `completed_at` is today.
 *
 * THE DEFECT THIS WAS BUILT FROM (2026-09-14): `seo.fn_refresh_topic_placement_queue`
 * re-stamped `completed_at = now()` on EVERY already-done row on every refresh. The
 * first pass of each night refreshes, so "placed today" became "every agent
 * placement this site has ever had": All Green read 8,300 placed-today against an
 * 8,000 ceiling at 04:50 UTC with 0 placed that day, claimed nothing for weeks, and
 * 3,302 claimable keywords sat unvalued (KI-014). A ceiling must compare the unit
 * the approval is expressed in — placements made today — never a reconciliation
 * stamp.
 *
 * TWO CHECKS, both live, both side-effect free:
 *   1. REFRESH MUST NOT SPEND BUDGET. Inside a transaction that is always rolled
 *      back, run the real refresh for a small enrolled site that has agent
 *      placements, and compare the day's counter before and after. Any increase is
 *      the defect.
 *   2. COUNTER ≤ TRUTH, per site. The counter may never exceed the agent primary
 *      placements whose `seo.keyword_topic` row was created or updated today for
 *      keywords in that site's ledger.
 *
 *   pnpm check:topic-placement-ceiling            # loud, exit 0
 *   pnpm check:topic-placement-ceiling:strict     # exit 1 on any finding
 *
 * 🚨 UNMEASURED IS NOT PASSED: no credentials, no enrolled site, or a failed query
 * exits 1 under --strict.
 */
import process from "node:process";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const STRICT = process.argv.includes("--strict");
const MIDNIGHT = "date_trunc('day', now() at time zone 'utc') at time zone 'utc'";

function finish(findings: string[], unmeasured: string | null): never {
  if (unmeasured) {
    console.error(`\nLIVE PULL FAILED — UNMEASURED: ${unmeasured}`);
    exitAfterDrain(STRICT ? 1 : 0);
  }
  if (findings.length) {
    console.error(`\nFAIL — ${findings.length} finding(s):`);
    for (const f of findings) console.error(`  - ${f}`);
    exitAfterDrain(STRICT ? 1 : 0);
  }
  console.log("\nOK — the placement ceiling counts placements made today, and a refresh spends none of it.");
  exitAfterDrain(0);
}

async function main(): Promise<void> {
  const env = loadDbEnv();
  if ("missing" in env) {
    finish([], `missing ${env.missing.join(", ")} (looked in: ${env.looked.join(", ") || "nothing"})`);
  }
  console.log(`connection variables from ${env.from}`);
  const client = await connectDirect(env, "matrx-frontend check:topic-placement-ceiling");
  const findings: string[] = [];
  try {
    // ── 2. counter ≤ truth, every enrolled site ────────────────────────────
    const truth = await client.query<{
      site_id: string;
      counter: string;
      truth: string;
    }>(`
      select s.site_id,
             (select placed from seo.fn_topic_placement_settled_since(s.site_id, ${MIDNIGHT}))::text as counter,
             (select count(*) from seo.topic_placement_queue q
                join seo.keyword_topic kt on kt.keyword_id = q.keyword_id
                 and kt.is_primary and kt.deleted_at is null and kt.assigned_by <> 'human'
               where q.site_id = s.site_id
                 and greatest(kt.created_at, kt.updated_at) >= ${MIDNIGHT})::text as truth
        from (select distinct site_id from seo.topic_placement_queue) s`);
    if (truth.rows.length === 0) finish([], "no site is enrolled in seo.topic_placement_queue");
    for (const r of truth.rows) {
      const line = `site ${r.site_id}: counter ${r.counter}, agent placements touched today ${r.truth}`;
      console.log(`  ${line}`);
      if (Number(r.counter) > Number(r.truth)) {
        findings.push(`${line} — the ceiling is spending budget no placement used`);
      }
    }

    // ── 1. a refresh must not move the counter ─────────────────────────────
    const pick = await client.query<{ site_id: string; rows: string }>(`
      select q.site_id, count(*)::text as rows
        from seo.topic_placement_queue q
       group by q.site_id
      having count(*) filter (where q.status = 'done' and q.placement_source = 'agent') > 0
       order by count(*) asc
       limit 1`);
    const site = pick.rows[0]?.site_id;
    if (!site) finish(findings, "no enrolled site has an agent placement to re-reconcile");
    const window = await client.query<{ value: string }>(
      `select value::text from platform.feature_knob where feature = 'seo.topic_placement' and key = 'demand_window_days'`,
    );
    const windowDays = Number(window.rows[0]?.value);
    if (!Number.isFinite(windowDays) || windowDays < 1) {
      finish(findings, "knob seo.topic_placement.demand_window_days is missing");
    }
    await client.query("begin");
    try {
      await client.query("set local statement_timeout = '300s'");
      const counterSql = `select placed::text from seo.fn_topic_placement_settled_since($1, ${MIDNIGHT})`;
      const before = Number((await client.query<{ placed: string }>(counterSql, [site])).rows[0]?.placed);
      await client.query("select * from seo.fn_refresh_topic_placement_queue($1, $2)", [site, windowDays]);
      const after = Number((await client.query<{ placed: string }>(counterSql, [site])).rows[0]?.placed);
      console.log(`  refresh probe on site ${site} (${pick.rows[0]!.rows} ledger rows, rolled back): counter ${before} -> ${after}`);
      if (after > before) {
        findings.push(
          `site ${site}: one refresh raised "placed today" from ${before} to ${after} with no placement made — the refresh re-stamps completed_at`,
        );
      }
    } finally {
      await client.query("rollback");
    }
  } catch (err) {
    finish(findings, err instanceof Error ? err.message : String(err));
  } finally {
    await client.end();
  }
  finish(findings, null);
}

main().catch((err: unknown) => {
  console.error(err);
  exitAfterDrain(2);
});
