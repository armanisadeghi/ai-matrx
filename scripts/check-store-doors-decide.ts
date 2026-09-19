/**
 * EVERY DOOR INTO THE RECORD STORE DECIDES WHO IS KNOCKING.
 *
 * WHAT THIS CLOSES, measured live on the main database on 2026-09-19. Schema `custom`
 * opens functions to role `authenticated` one migration at a time, and two of them had
 * been opened without a decision in the body:
 *
 *   - `custom.record_write / record_update / record_delete / record_restore` asked ONLY
 *     "are you a member of this organization". The store's read door has always asked a
 *     second question - may this person reach THIS row - so a record marked
 *     `visibility='personal'` was refused by `custom.read_record` and rewritten by
 *     `custom.record_update` in the same breath, by the same person.
 *   - `custom.anon_token_revoke` asked nothing at all: a signed-in stranger revoked
 *     another organization's live anonymous access token and got `true` back.
 *
 * Neither was a bad line of SQL. Both were a door added later than the rule, which is a
 * class, so the rule is a QUERY over the live catalog and this is the guard that runs it.
 *
 * WHAT IT CHECKS - three censuses, all against the live database:
 *   1. custom.doors_not_deciding_the_caller()  - a client door taking an organization id
 *      whose body never decides the caller.
 *   2. custom.doors_not_deciding_the_record()  - a client door that takes a record or
 *      table id and writes a record without deciding that row.
 *   3. platform.client_callable_door rows for schema `custom`: a door declared for
 *      signed-in callers that holds no EXECUTE for `authenticated` (the app dies on it),
 *      and a row whose `identity_args` matches no live function at all (which makes every
 *      exact-match guard, including this one, skip that door in silence).
 *
 * UNMEASURED IS NOT PASSED. No credentials or an unreachable database is a FAILURE.
 *
 *   pnpm check:store-doors-decide
 *   pnpm check:store-doors-decide:self-test   # proves the censuses can still go RED
 */

import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { exitAfterDrain } from "./lib/exit-after-drain";

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  exitAfterDrain(1);
  throw new Error("unreachable");
}

/**
 * The six things a body in schema `custom` may decide a caller with. Kept here AND in the
 * two SQL census functions on purpose: the self-test empties this list and re-runs the
 * same query, which is how the query itself is proven capable of going red.
 */
const DECIDERS = [
  "assert_client_may_reach",
  "assert_client_may_change",
  "has_access_for",
  "has_visibility",
  "anon_token_verify",
  "visible_record_ids",
];

const CALLER_CENSUS = (deciders: string[]) => `
  select p.proname::text as function_name, pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and pg_get_function_identity_arguments(p.oid) ~ 'p_organization_id uuid'
     and p.proname <> 'store_is_open'
     ${deciders.length ? `and pg_get_functiondef(p.oid) !~* '(${deciders.join("|")})'` : ""}
   order by 1`;

const RECORD_CENSUS = (deciders: string[]) => `
  select p.proname::text as function_name, pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and p.prosecdef
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and pg_get_function_identity_arguments(p.oid) ~ '(p_record_id uuid|p_table_id uuid)'
     and pg_get_functiondef(p.oid) ~* '(insert into custom\\.record|update custom\\.record|custom\\.record_write|custom\\.record_update|custom\\.record_delete|custom\\.record_restore|snapshot_restore)'
     ${deciders.length ? `and pg_get_functiondef(p.oid) !~* '(${deciders.join("|")})'` : ""}
   order by 1`;

const GRANT_CENSUS = `
  select d.function_name, d.identity_args,
         case when p.oid is null then 'declared, but no function in schema custom has that exact signature'
              else 'declared for signed-in callers and authenticated holds no EXECUTE on it' end as why
    from platform.client_callable_door d
    left join pg_proc p
      on p.proname = d.function_name
     and p.pronamespace = 'custom'::regnamespace
     and pg_get_function_identity_arguments(p.oid) = d.identity_args
   where d.schema_name = 'custom'
     and (p.oid is null
          or (d.signed_in_callers and not has_function_privilege('authenticated', p.oid, 'EXECUTE')))
   order by 1`;

interface Row {
  function_name: string;
  identity_args: string;
  why?: string;
}

function report(title: string, rows: Row[]): boolean {
  if (rows.length === 0) {
    console.log(`[ OK ] ${title} - none.`);
    return true;
  }
  console.error(`[FAIL] ${title} - ${rows.length}:`);
  for (const r of rows) {
    console.error(`       custom.${r.function_name}(${r.identity_args})${r.why ? ` - ${r.why}` : ""}`);
  }
  return false;
}

async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");

  const env = loadDbEnv();
  if ("missing" in env) {
    fail(
      "LIVE PULL FAILED - this check is UNMEASURED, which is a failure, not a pass.\n" +
        `Missing: ${env.missing.join(", ")}\nLooked in: ${env.looked.join(", ")}`,
    );
  }

  const client = await connectDirect(env, "check-store-doors-decide").catch((error: unknown) => {
    fail(`LIVE PULL FAILED - could not reach the database: ${String(error)}`);
  });

  try {
    if (selfTest) {
      // THE RED HALF. The same two queries with NOTHING accepted as a decision must name
      // the doors that DO decide - otherwise the census is looking at an empty set and a
      // green answer above means nothing at all.
      const red = [
        ...(await client.query<Row>(CALLER_CENSUS([]))).rows,
        ...(await client.query<Row>(RECORD_CENSUS([]))).rows,
      ];
      const names = new Set(red.map((r) => r.function_name));
      const mustFind = [
        "record_write",
        "record_update",
        "record_delete",
        "record_restore",
        "anon_token_revoke",
      ];
      const missing = mustFind.filter((n) => !names.has(n));
      if (missing.length > 0) {
        fail(
          "SELF-TEST FAILED - with every decider removed the censuses did not even find the " +
            `doors that DO decide: missing ${missing.join(", ")}. The query is not looking at ` +
            "the doors it claims to look at, so its green answer proves nothing.",
        );
      }
      console.log(
        `[ OK ] self-test - with no decider accepted, the censuses name ${names.size} door(s) ` +
          "including all five that carry the fix. The queries can go red.",
      );
    }

    const callers = (await client.query<Row>(CALLER_CENSUS(DECIDERS))).rows;
    const records = (await client.query<Row>(RECORD_CENSUS(DECIDERS))).rows;
    const grants = (await client.query<Row>(GRANT_CENSUS)).rows;

    const ok = [
      report("client doors taking an organization id that never decide the caller", callers),
      report("client doors that write a record without deciding that row", records),
      report("declared doors whose grant or signature does not match the live catalog", grants),
    ].every(Boolean);

    if (!ok) {
      console.error(
        "\n  A door into schema `custom` that a signed-in caller may execute decides, FIRST:\n" +
          "    the organization  - custom.assert_client_may_reach(organization, door)\n" +
          "    and the row       - custom.assert_client_may_change(organization, subject, door[, level, word])\n" +
          "  A read door decides the row with iam.has_access_for / custom.has_visibility, and the\n" +
          "  anonymous doors decide with custom.anon_token_verify. Adding a door is adding one of\n" +
          "  those lines; there is no door that decides nothing.\n",
      );
      exitAfterDrain(1);
      return;
    }
    console.log("\nEvery client door into the record store decides the caller and the row.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
