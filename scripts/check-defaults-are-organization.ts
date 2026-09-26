/**
 * EVERY DEFAULT IS ORGANIZATION; ONLY ARMAN MOVES A TABLE INTO CONFIDENTIAL OR PRIVATE.
 *
 * The law: common-docs/policies/access-ladder.md (Arman, 2026-09-26). Locking a person out of
 * their organization's work is a bug, never caution — so no default path may land a table on
 * Confidential or Private, and the only way in is one of the two approval functions that record
 * his verbatim words:
 *
 *   platform.set_table_confidential_arman_explicitly_approved(p_token, p_arman_words, p_approved_on)
 *   platform.set_table_private_arman_explicitly_approved(p_token, p_arman_words, p_approved_on)
 *
 * The check is ONE database query, `platform.defaults_that_lock_people_out()`, which answers with a
 * row per violation (migration access_ladder_defaults_are_organization.sql):
 *
 *   · platform.derive_data_class yields Confidential/Private for a default (any non-owner-only
 *     variant × any default visibility, including unset);
 *   · iam.class_lanes resolves an unregistered token, an unclassified token or a component with no
 *     classified parent to Confidential/Private;
 *   · platform.strict_class_refusal stops refusing a tightening — or starts refusing a loosening or
 *     an unchanged class (regeneration of an existing table must always work);
 *   · the refusing trigger on platform.entity_types is missing or disabled;
 *   · a client role can execute an approval/probe door or write the approval ledger.
 *
 * ZERO ROWS OR IT FAILED. No allow-list, no baseline. UNMEASURED IS NOT PASSED.
 *
 * THE SELF-TEST plants each violation for real inside a transaction that is always rolled back,
 * asks the same function, and requires the named check to go red — then requires the clean
 * database to be green again. Nothing is ever edited on disk and nothing is ever committed.
 *
 *   pnpm check:defaults-are-organization
 *   pnpm check:defaults-are-organization:self-test
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

const GUARD = `select check_name, detail from platform.defaults_that_lock_people_out()`;

interface Row {
  check_name: string;
  detail: string;
}

/** Each plant is real DDL executed inside BEGIN … ROLLBACK, and the check it must turn red. */
const PLANTS: ReadonlyArray<{ name: string; expect: string; sql: string }> = [
  {
    name: "an unset default derives Private again",
    expect: "derive_data_class",
    sql: `create or replace function platform.derive_data_class(p_variant text, p_visibility text)
            returns platform.data_class language sql immutable as $f$
            select case when p_variant = 'component' then null
                        when p_visibility = 'public' then 'public'::platform.data_class
                        else 'private'::platform.data_class end $f$`,
  },
  {
    name: "an unregistered token resolves Private again",
    expect: "class_lanes_unregistered",
    sql: `do $d$ begin execute replace(pg_get_functiondef('iam.class_lanes(text)'::regprocedure),
            $q$v_class := 'organization';                  -- unregistered token$q$,
            $q$v_class := 'private';                  -- unregistered token$q$); end $d$`,
  },
  {
    name: "the refusal stops refusing",
    expect: "refusal_confidential",
    sql: `create or replace function platform.strict_class_refusal(p_token text, p_is_insert boolean,
            p_old_class platform.data_class, p_new_class platform.data_class,
            p_old_variant text, p_new_variant text)
            returns text language sql stable as $f$ select null::text $f$`,
  },
  {
    name: "the refusing trigger is disabled",
    expect: "gate_trigger",
    sql: `alter table platform.entity_types disable trigger _entity_types_strict_class_needs_arman`,
  },
  {
    name: "a signed-in client can write the approval ledger",
    expect: "client_can_write_ledger",
    sql: `grant insert on platform.class_approval_by_arman to authenticated`,
  },
];

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");
  const env = loadDbEnv();
  if (!("host" in env)) {
    fail("UNMEASURED: no database credentials. A guard that cannot measure has not passed.");
  }
  const client = await connectDirect(env, "check-defaults-are-organization").catch(
    (error: unknown) => {
      fail(`UNMEASURED: could not reach the database — ${String(error)}`);
    },
  );

  try {
    if (selfTest) {
      for (const plant of PLANTS) {
        await client.query("begin");
        try {
          await client.query("set local lock_timeout = '2s'");
          await client.query(plant.sql);
          const rows = (await client.query<Row>(GUARD)).rows;
          if (!rows.some((r) => r.check_name === plant.expect)) {
            fail(
              `SELF-TEST FAILED — planted "${plant.name}" and the guard did not report ` +
                `${plant.expect} (it answered: ${rows.map((r) => r.check_name).join(", ") || "nothing"}). ` +
                "The guard can no longer see this violation.",
            );
          }
          console.log(`[ OK ] RED as expected — ${plant.name} -> ${plant.expect}`);
        } finally {
          await client.query("rollback");
        }
      }
      const clean = (await client.query<Row>(GUARD)).rows;
      if (clean.length > 0) {
        fail(`SELF-TEST FAILED — after every rollback the live database is not green: ${clean.map((r) => r.check_name).join(", ")}`);
      }
      console.log(`[ OK ] self-test — ${PLANTS.length} planted violations each went RED for their named reason; the rolled-back database is GREEN.`);
      return;
    }

    const rows = (await client.query<Row>(GUARD)).rows;
    if (rows.length > 0) {
      fail(
        `${rows.length} path(s) could lock people out of their organization's work:\n` +
          rows.map((r) => `  - ${r.check_name}: ${r.detail}`).join("\n") +
          "\n  Every default is Organization (common-docs/policies/access-ladder.md). A table enters " +
          "Confidential or Private only through platform.set_table_confidential_arman_explicitly_approved / " +
          "platform.set_table_private_arman_explicitly_approved with Arman's own words.",
      );
    }
    console.log(
      "✅ DEFAULTS ARE ORGANIZATION: no default path yields Confidential or Private, tightening is " +
        "refused without Arman's recorded words, and no client can forge an approval.",
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
