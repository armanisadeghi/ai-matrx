/**
 * THE RECORD STORE IS ONE SWITCH, AND THE TABLE KEEPS IT THAT WAY.
 *
 * WHAT THIS CLOSES — the V11-A census, 2026-09-22, on the main database. Lane NAV-FIX
 * ruled on 2026-09-19 that an organization's record store is ONE switch:
 * `custom/system_enabled` is it, `custom/code_paths_enabled` is the same answer for the
 * server's own code, and the two "must never be able to say something different". It made
 * `platform.unified_data_store_set` write both halves in one statement, and wrote in its
 * own header that after it "there is no way to turn the store on for an organization and
 * leave the code half behind."
 *
 * That was true of callers of THAT DOOR and never true of the table. Three days later
 * **42 organizations held two halves that disagreed**, because a proof, a fixture or a
 * seat suite writes `platform.knob_override` directly. Greenline Landscaping Crew — the
 * crew VERIFIER-11 did its entire walk in — was `system_enabled true` with no code half at
 * all, so the platform default answered false and the server's own kill switch had been
 * refusing that crew while every screen said the store was on.
 *
 * WHAT IT CHECKS, against the live database:
 *   1. the trigger `store_switch_halves_follow_each_other_tg` is on
 *      `platform.knob_override` — a safe door beside an unsafe one is not a fix;
 *   2. no organization holds two halves that disagree, one half missing included.
 *
 * UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:one-switch-two-halves
 *   pnpm check:one-switch-two-halves:self-test
 *     drops the trigger inside a transaction, writes ONE half of a real organization's
 *     switch, proves the census goes red, and rolls the whole thing away.
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";

const TRIGGER = `
  select count(*)::int as n
    from pg_trigger
   where tgrelid = 'platform.knob_override'::regclass
     and not tgisinternal
     and tgname = 'store_switch_halves_follow_each_other_tg'`;

const CENSUS = `
  select o.name as organization,
         k.organization_id,
         max(case when k.key = 'system_enabled'     then k.value::text end) as switch_half,
         max(case when k.key = 'code_paths_enabled' then k.value::text end) as code_half
    from platform.knob_override k
    join iam.organizations o on o.id = k.organization_id
   where k.feature = 'custom'
     and k.key in ('system_enabled', 'code_paths_enabled')
     and k.scope_kind = 'organization'
   group by 1, 2
  having max(case when k.key = 'system_enabled'     then k.value::text end)
      is distinct from
         max(case when k.key = 'code_paths_enabled' then k.value::text end)
   order by 1`;

type Row = { organization: string; switch_half: string | null; code_half: string | null };

const say = (r: Row) =>
  `${r.organization} — the switch says ${r.switch_half ?? "nothing at all"} and the server's own half says ${r.code_half ?? "nothing at all"}. ` +
  `Whichever way round, half of this organization's store is answering the opposite of what its people were told.`;

async function main() {
  const env = loadDbEnv();
  if ("missing" in env) {
    console.error(
      `[FAIL] no database credentials (${env.missing.join(", ")} — looked in ${env.looked.join(", ")}). Unmeasured is not passed.`,
    );
    process.exit(1);
  }
  const selfTest = process.argv.includes("--self-test");
  const client = await connectDirect(env, "check:one-switch-two-halves");
  try {
    const trigger = ((await client.query(TRIGGER)) as { rows: { n: number }[] }).rows[0].n;

    if (selfTest) {
      await client.query("begin");
      try {
        await client.query("set local statement_timeout = '60s'");
        await client.query("set local lock_timeout = '20s'");
        await client.query(
          "drop trigger if exists store_switch_halves_follow_each_other_tg on platform.knob_override",
        );
        const victim = (await client.query(
          `select organization_id, scope_id, value::text as value
             from platform.knob_override
            where feature = 'custom' and key = 'system_enabled' and scope_kind = 'organization'
            limit 1`,
        )) as { rows: { organization_id: string; scope_id: string; value: string }[] };
        if (victim.rows.length === 0) {
          console.error(
            "[FAIL] self-test: no organization has decided its record-store switch on this database, so the census has nothing to be proven against. Unmeasured is not passed.",
          );
          process.exit(1);
        }
        const v = victim.rows[0];
        await client.query(
          `update platform.knob_override set value = ${v.value === "true" ? "'false'" : "'true'"}::jsonb
            where feature = 'custom' and key = 'system_enabled' and scope_kind = 'organization'
              and scope_id = '${v.scope_id}'::uuid and organization_id = '${v.organization_id}'::uuid`,
        );
        const red = ((await client.query(CENSUS)) as { rows: Row[] }).rows;
        if (red.length === 0) {
          console.error(
            "[FAIL] self-test: with the trigger dropped, one half of a live organization's switch was moved and the census found NOTHING. It is not looking at the thing it is supposed to police.",
          );
          process.exit(1);
        }
        console.log(`[OK] self-test: trigger dropped, one half moved, census RED — ${say(red[0])}`);
      } finally {
        await client.query("rollback").catch(() => undefined);
      }
      const green = ((await client.query(CENSUS)) as { rows: Row[] }).rows;
      const back = ((await client.query(TRIGGER)) as { rows: { n: number }[] }).rows[0].n;
      if (green.length !== 0 || back !== 1) {
        console.error(
          `[FAIL] self-test: after the rollback the census names ${green.length} organization(s) and the trigger count is ${back}. Its own write did not go away, or the tree is genuinely red.`,
        );
        process.exit(1);
      }
      console.log("[OK] self-test: rolled back — the trigger is back and every organization's halves agree.");
      process.exit(0);
    }

    if (trigger !== 1) {
      console.error(
        "[FAIL] platform.knob_override carries no store_switch_halves_follow_each_other_tg, so any direct write can turn an organization's store on and leave the server's own half saying the opposite. Apply migrations/campaign/fix11a_the_two_halves_of_the_one_switch_cannot_drift.sql.",
      );
      process.exit(1);
    }
    const rows = ((await client.query(CENSUS)) as { rows: Row[] }).rows;
    if (rows.length > 0) {
      console.error(`[FAIL] ${rows.length} organization(s) hold two halves of one switch that disagree:`);
      for (const r of rows) console.error("  - " + say(r));
      console.error("  Settle them: scripts/fix11a/mirror_the_code_half_onto_every_organization.sql");
      process.exit(1);
    }
    console.log(
      "[OK] the record store is one switch: the trigger is on platform.knob_override and no organization holds two halves that disagree.",
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
