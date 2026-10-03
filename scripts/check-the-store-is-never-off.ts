/**
 * THE RECORD STORE IS NEVER OFF — for any organization, and nothing can switch it off again.
 *
 * WHAT THIS CLOSES (lane CHAIR-ALWAYS-ON, 2026-10-03). Arman, verbatim: "Why am I being told
 * that the table builder is off to organizations by default? EVERYTHING IS ON by default and
 * things can only be TURNED OFF! Don't limit what users can do." Since the final switch
 * (2026-10-01) the record store is the only data system, so the per-organization switch
 * `custom/system_enabled` was retired: `custom.store_is_open` answers true for every
 * organization, the knob is archived and can be overridden by nobody, its two `false`
 * overrides (set by seat suites on 2026-09-21) are gone, and no database body reads it.
 *
 * WHAT IT CHECKS, against the live database:
 *   1. `custom.store_is_open` is true for the two formerly-off organizations, for an
 *      organization nobody has heard of, and for no organization at all;
 *   2. the knob row `custom/system_enabled` is archived and overridable by nobody;
 *   3. no organization holds a `false` override of it (or of its mirror, `code_paths_enabled`);
 *   4. no database function reads the knob (`platform.knob_live_readers`).
 *
 * UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:the-store-is-never-off
 *   pnpm check:the-store-is-never-off:self-test
 *     inside a transaction on the nightly clone, replaces custom.store_is_open with a body that
 *     answers false, proves check 1 goes RED, and rolls it away.
 */

import { ceilingFor, connectCheckDirect } from "./lib/check-target";
import { exitAfterDrain } from "./lib/exit-after-drain";

/** The two organizations that carried `custom/system_enabled = false` until 2026-10-03. */
const FORMERLY_OFF = [
  "d46f323b-c132-4d27-8004-70670c4b8a11",
  "f09a8181-410c-4f26-b12e-9ee01e0a3852",
] as const;

const OPEN = `
  select custom.store_is_open('${FORMERLY_OFF[0]}'::uuid) as first_formerly_off,
         custom.store_is_open('${FORMERLY_OFF[1]}'::uuid) as second_formerly_off,
         custom.store_is_open(gen_random_uuid())           as an_unknown_organization,
         custom.store_is_open(null)                        as no_organization`;

const KNOB = `
  select archived_at is not null                  as archived,
         coalesce(cardinality(overridable_by), 0) as overridable_rungs
    from platform.feature_knob
   where feature = 'custom' and key = 'system_enabled'`;

const FALSE_OVERRIDES = `
  select o.key, o.organization_id::text as organization_id
    from platform.knob_override o
   where o.feature = 'custom'
     and o.key in ('system_enabled', 'code_paths_enabled')
     and o.value = 'false'::jsonb
   order by 1, 2`;

const READERS = `select platform.knob_live_readers('custom', 'system_enabled') as readers`;

type Client = { query: (sql: string) => Promise<unknown>; end: () => Promise<void> };

/** Check 1 alone: the names of the answers that are not `true`. */
async function closedAnswers(client: Client): Promise<string[]> {
  const row = ((await client.query(OPEN)) as { rows: Record<string, boolean | null>[] }).rows[0] ?? {};
  return Object.entries(row)
    .filter(([, open]) => open !== true)
    .map(([who]) => who);
}

async function main() {
  const selfTest = process.argv.includes("--self-test");
  const opened = await connectCheckDirect({
    gate: "check:the-store-is-never-off",
    defaultTarget: selfTest ? "clone" : "production",
  }).catch((e: unknown) => {
    console.error(`[FAIL] ${e instanceof Error ? e.message : String(e)} Unmeasured is not passed.`);
    exitAfterDrain(1);
  });
  const client = opened.client as Client;
  try {
    if (selfTest) {
      await client.query("begin");
      try {
        await client.query(`set local statement_timeout = '${ceilingFor(opened.target, 60_000)}'`);
        await client.query("set local lock_timeout = '5s'");
        await client.query(
          `create or replace function custom.store_is_open(p_organization_id uuid default null::uuid)
             returns boolean language plpgsql stable set search_path to 'pg_catalog'
           as $planted$ begin return false; end; $planted$`,
        );
        const red = await closedAnswers(client);
        if (red.length !== 4) {
          console.error(
            `[FAIL] self-test: custom.store_is_open was replaced with a body that answers false and the check named ${red.length} of 4 answers. It is not looking at the function it polices.`,
          );
          exitAfterDrain(1);
        }
        console.log(`[OK] self-test: a planted "off" body is caught — RED for ${red.join(", ")}.`);
      } finally {
        await client.query("rollback").catch(() => undefined);
      }
      const green = await closedAnswers(client);
      if (green.length !== 0) {
        console.error(
          `[FAIL] self-test: after the rollback the store still answers closed for ${green.join(", ")}. The planted body did not go away, or this database really has the store off.`,
        );
        exitAfterDrain(1);
      }
      console.log("[OK] self-test: rolled back — the store answers open for every organization again.");
      exitAfterDrain(0);
    }

    const failures: string[] = [];

    const closed = await closedAnswers(client);
    if (closed.length > 0) {
      failures.push(
        `custom.store_is_open does not answer true for: ${closed.join(", ")}. The store is never off — re-apply migrations/campaign/chairalwayson_a_the_store_is_never_off.sql.`,
      );
    }

    const knob = ((await client.query(KNOB)) as { rows: { archived: boolean; overridable_rungs: number }[] }).rows[0];
    if (!knob) {
      failures.push(
        "platform.feature_knob has no custom/system_enabled row. It is kept ARCHIVED (campaign files still name it as their guard), not deleted.",
      );
    } else {
      if (!knob.archived) {
        failures.push(
          "the knob custom/system_enabled is not archived, so a settings screen can offer the record store's off switch again.",
        );
      }
      if (knob.overridable_rungs !== 0) {
        failures.push(
          `the knob custom/system_enabled can still be overridden at ${knob.overridable_rungs} rung(s). Nobody may turn the record store off: overridable_by must be empty.`,
        );
      }
    }

    const overrides = ((await client.query(FALSE_OVERRIDES)) as { rows: { key: string; organization_id: string }[] }).rows;
    for (const o of overrides) {
      failures.push(
        `organization ${o.organization_id} holds custom/${o.key} = false. The store has no off; remove the override (a test that writes it is writing a switch that no longer exists).`,
      );
    }

    const readers = ((await client.query(READERS)) as { rows: { readers: string | null }[] }).rows[0]?.readers ?? null;
    if (readers) {
      failures.push(
        `database functions read the retired knob custom/system_enabled again: ${readers}. Ask custom.store_is_open, or nothing.`,
      );
    }

    if (failures.length > 0) {
      console.error(`[FAIL] the record store can be off again — ${failures.length} finding(s):`);
      for (const f of failures) console.error("  - " + f);
      exitAfterDrain(1);
    }
    console.log(
      "[OK] the record store is never off: custom.store_is_open answers true for the two formerly-off organizations, an unknown one and none; the knob custom/system_enabled is archived, overridable by nobody, carries no false override, and no database function reads it.",
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
