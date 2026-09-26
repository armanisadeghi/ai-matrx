#!/usr/bin/env npx tsx
/**
 * `pnpm check:list-lane-owner` — THE MY ORGS LANE NEVER DISOWNS YOUR OWN ROWS, AND THE PUBLIC LANE
 * SHOWS PUBLISHED CARDS.
 *
 * 🚨 THE DEFECT (2026-09-26, mandate-sharing verification). Seven `public.*_list_scoped` functions
 * (agents, workflows, conversations, interviews, transcripts, SEO rank targets, shapes) answered
 * every orgs-lane row with the literal `false, 'org'` — so a row the viewer CREATED came back
 * `is_owner = false`, and Share / Rename / Archive / Delete were disabled with "You don't own this
 * workflow". And `agx_list_scoped`'s Public lane read `visibility = 'public'`, a state
 * `agent_definition_body_not_public_chk` forbids, so it was always empty; publishing writes
 * `card_visibility`.
 *
 * Three checks, all against the LIVE database, all read-only or rolled back:
 *
 *   A. CENSUS (static, catches a sibling with no data yet): no `public.*_list_scoped` body may carry
 *      a literal `false, 'org'` arm.
 *   B. BEHAVIOUR (the real seat): as admin@admin.com, every orgs-lane row whose owner column is the
 *      viewer must come back `is_owner = true`, for every list function that has a `mine` lane.
 *   C. PUBLIC LANE: inside a transaction that is ALWAYS rolled back, one of admin@admin.com's own
 *      agents and workflows gets a public card; as test@test.com the Public lane must then list it.
 *
 * RED on the pre-fix bodies (A names seven functions; B counts disowned rows; C finds 0 rows);
 * GREEN after `migrations/list_lanes_owner_and_public_cards.sql`. Without DB credentials it prints
 * UNMEASURED and exits 2 — never a pass.
 */
import process from "node:process";
import { connectDirect, loadDbEnv } from "./lib/direct-db";

const ADMIN = "admin@admin.com";
const TESTER = "test@test.com";

/** Every list function with an orgs lane: its argument shape and the owner column it returns. */
const LISTS: { fn: string; call: (scope: string) => string; owner: string }[] = [
  { fn: "agx_list_scoped", owner: "created_by",
    call: (s) => `public.agx_list_scoped('${s}', null, null, false, 'updated', 'desc', false, 'all', '{}'::jsonb, 5000, 0)` },
  { fn: "wfx_list_scoped", owner: "created_by",
    call: (s) => `public.wfx_list_scoped('${s}', null, null, false, 'updated', 'desc', false, 'all', '{}'::jsonb, 5000, 0)` },
  { fn: "cvx_list_scoped", owner: "created_by",
    call: (s) => `public.cvx_list_scoped('${s}', null, null, false, 'updated', 'desc', false, 'all', '{}'::jsonb, 5000, 0)` },
  { fn: "ivw_list_scoped", owner: "user_id",
    call: (s) => `public.ivw_list_scoped('${s}', null, null, 'updated', 'desc', '{}'::jsonb, 5000, 0)` },
  { fn: "trx_list_scoped", owner: "created_by",
    call: (s) => `public.trx_list_scoped('${s}', null, null, false, 'updated', 'desc', '{}'::jsonb, 5000, 0)` },
  { fn: "seo_rank_target_list_scoped", owner: "created_by",
    call: (s) => `public.seo_rank_target_list_scoped('${s}', null, null, 'updated', 'desc', '{}'::jsonb, 5000, 0)` },
  { fn: "shx_list_scoped", owner: "created_by",
    call: (s) => `public.shx_list_scoped('${s}', null, null, false, 'updated', 'desc', '{}'::jsonb, 5000, 0)` },
];

async function main(): Promise<number> {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.log(`UNMEASURED: no direct DB credentials (${env.missing.join(", ")}).`);
    return 2;
  }
  const db = await connectDirect(env, "check-list-lane-owner");
  const failures: string[] = [];
  try {
    // ── A. census ────────────────────────────────────────────────────────────────────────────
    const census = await db.query<{ fn: string }>(`
      select p.proname as fn
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like '%\\_list\\_scoped' and p.prokind = 'f'
         and p.prosrc ~* 'false\\s*,\\s*''org'''
       order by 1`);
    for (const r of census.rows)
      failures.push(`A ${r.fn}: its orgs arm returns a literal \`false, 'org'\` — every row is disowned, the viewer's own included.`);

    const ids = await db.query<{ email: string; id: string }>(
      `select email, id::text from auth.users where email in ($1, $2)`, [ADMIN, TESTER]);
    const idOf = new Map(ids.rows.map((r) => [r.email, r.id]));
    const admin = idOf.get(ADMIN);
    const tester = idOf.get(TESTER);
    if (!admin || !tester) {
      console.log(`UNMEASURED: ${ADMIN} or ${TESTER} is missing.`);
      return 2;
    }
    const seat = async (uid: string) => {
      await db.query(`set local role authenticated`);
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: uid, role: "authenticated" }),
      ]);
    };

    // ── B. behaviour, from admin's seat ──────────────────────────────────────────────────────
    let ownRowsSeen = 0;
    for (const l of LISTS) {
      await db.query("begin");
      try {
        await seat(admin);
        const r = await db.query<{ own: string; disowned: string }>(`
          select count(*) filter (where r.${l.owner} = $1::uuid)::text as own,
                 count(*) filter (where r.${l.owner} = $1::uuid and r.is_owner is not true)::text as disowned
            from ${l.call("orgs")} r`, [admin]);
        const own = Number(r.rows[0].own);
        const disowned = Number(r.rows[0].disowned);
        ownRowsSeen += own;
        console.log(`B ${l.fn}: ${own} own rows in My Orgs, ${disowned} marked not owned`);
        if (disowned > 0)
          failures.push(`B ${l.fn}: ${disowned} of the viewer's own My Orgs rows come back is_owner = false.`);
      } finally {
        await db.query("rollback");
      }
    }
    if (ownRowsSeen === 0)
      failures.push(`B measured nothing: ${ADMIN} has no own rows in any My Orgs lane, so the check proves nothing.`);

    // ── C. public lane (rolled back) ─────────────────────────────────────────────────────────
    for (const kind of [
      { fn: "agx_list_scoped", table: "agent.definition", extra: "and agent_type = 'user'" },
      { fn: "wfx_list_scoped", table: "workflow.definition", extra: "" },
    ]) {
      await db.query("begin");
      try {
        await db.query(`set local lock_timeout = '2s'`);
        // A probe write names its system (platform._stamp_actor_tier); it is rolled back below.
        await db.query(`select set_config('app.actor_system', 'check-list-lane-owner', true)`);
        const pick = await db.query<{ id: string }>(`
          select id::text from ${kind.table}
           where created_by = $1::uuid and deleted_at is null and is_archived is not true ${kind.extra}
           order by updated_at desc limit 1`, [admin]);
        if (!pick.rows[0]) {
          failures.push(`C ${kind.fn}: ${ADMIN} has no ${kind.table} row to publish inside the rolled-back probe.`);
          continue;
        }
        const id = pick.rows[0].id;
        await db.query(`update ${kind.table} set card_visibility = 'public' where id = $1::uuid`, [id]);
        await seat(tester);
        const l = LISTS.find((x) => x.fn === kind.fn)!;
        const r = await db.query<{ n: string }>(
          `select count(*)::text as n from ${l.call("public")} r where r.id = $1::uuid`, [id]);
        const n = Number(r.rows[0].n);
        console.log(`C ${kind.fn}: a freshly published card is ${n ? "listed" : "MISSING"} in ${TESTER}'s Public lane`);
        if (n !== 1)
          failures.push(`C ${kind.fn}: an agent/workflow with card_visibility = 'public' is not in another person's Public lane.`);
      } finally {
        await db.query("rollback");
      }
    }
  } finally {
    await db.end();
  }

  if (failures.length) {
    console.log(`\nFAIL — ${failures.length}:\n  ${failures.join("\n  ")}`);
    return 1;
  }
  console.log("\nPASS — My Orgs owns your own rows; the Public lane lists published cards.");
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
