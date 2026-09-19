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
     and p.prosecdef
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

/**
 * THE FOURTH CENSUS — ONE LADDER (2026-09-19).
 *
 * The store had TWO implementations of "may this person reach this record": the read doors
 * asked `custom.has_visibility` (owner + a direct grant), the write doors asked
 * `iam.has_access_for` (the platform kernel), and field masking asked `iam.effective_level`.
 * Measured live as a real colleague: 25 records they were allowed to REWRITE and refused
 * when they tried to OPEN. The rule is now one function at four thresholds, and the rule is
 * a query: `custom.doors_not_on_one_ladder()` names any function in schema `custom` that
 * still decides a row with a ladder of its own. It reads the body with `--` comments
 * stripped, because a comment is not a decision.
 */
const ONE_LADDER_CENSUS = `select function_name, identity_args, why from custom.doors_not_on_one_ladder()`;

/**
 * The RED half of it: the same query with `custom.has_visibility` ADDED to the list of
 * ladders it objects to. Every door that carries the fix must then be named — otherwise the
 * census is reading an empty set and its green answer above proves nothing.
 */
const ONE_LADDER_RED = `
  select p.proname::text as function_name, pg_get_function_identity_arguments(p.oid) as identity_args
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
         ~* '(iam\\.has_access_for|iam\\.effective_level|public\\.has_permission_for|custom\\.has_visibility)'
     and p.proname not in ('has_visibility', 'has_visibility_at', 'effective_level',
                           'visible_record_ids', 'doors_not_on_one_ladder')
   order by 1`;

/**
 * THE FIFTH AND SIXTH CENSUSES — EVERY DECLARED DOOR GOES THROUGH THE LADDER,
 * AND EVERY DECLARED DOOR THAT WRITES ASKS THE SWITCH (2026-09-19, lane REACH).
 *
 * The first four censuses read the CATALOGUE — "this function holds a grant, does
 * its body decide". That catches a door somebody granted. It does not catch the
 * opposite and now much more common thing: a door somebody DECLARED. Schema
 * `custom` went from 28 client-reachable functions to 67 in one sitting, and every
 * one of those arrived as a row in `platform.client_callable_door` rather than as
 * a GRANT. A declaration whose body decides nothing is the seo.keyword_value_map
 * class again, with a truthful-looking row in front of it.
 *
 * So the rule is read from the DECLARATION side as well:
 *
 *   5. LADDER — a door row that opens a SECURITY DEFINER function taking a uuid to
 *      a client, whose body never reaches the one ladder. "The one ladder" is
 *      `custom.assert_client_may_reach` (the organization wall),
 *      `custom.assert_client_may_change` / `custom.assert_client_may_open` (the
 *      wall and then the row), `custom.has_visibility` / `custom.visible_record_ids`
 *      (the ladder itself), or `custom.anon_token_verify` for a door whose caller
 *      has no account. The uuid condition and the SECURITY DEFINER condition are
 *      the live trigger `platform.door_body_must_decide`'s own carve-outs, stated
 *      the same way here: a SECURITY INVOKER function in this schema is bounded by
 *      table privileges, and census 7 is what proves that boundary still exists.
 *
 *   6. SWITCH — a client door whose body WRITES a record and never asks
 *      `custom.assert_store_door` / `custom.store_is_open`. The OFF switch is the
 *      campaign's own product switch: a store that is switched off must answer a
 *      sentence, not take the write quietly. Measured live when this was written:
 *      home_add, record_reparent and relation_own had just become client-reachable
 *      and none of the three asked it.
 *
 *   7. THE BOUNDARY CENSUS 5 LEANS ON — `authenticated` (or anon, or PUBLIC) must
 *      hold NO table privilege anywhere in schema `custom`. The store is reached
 *      through its doors or not at all; the moment one table privilege exists, a
 *      SECURITY INVOKER function in this schema stops being harmless and censuses
 *      1 and 5 are excusing something real.
 */
const LADDER_RUNGS = [
  "custom\\.assert_client_may_reach",
  "custom\\.assert_client_may_change",
  "custom\\.assert_client_may_open",
  "custom\\.has_visibility",
  "custom\\.visible_record_ids",
  "custom\\.anon_token_verify",
];

const DECLARED_DOOR_BODY = `
    from pg_proc p
    join platform.client_callable_door d
      on d.schema_name = 'custom'
     and d.function_name = p.proname
     and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
   where p.pronamespace = 'custom'::regnamespace
     and (d.signed_in_callers or d.anonymous_callers)`;

/** `--` comments stripped: a sentence promising the ladder is not the ladder. */
const NO_COMMENTS = `regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')`;

const DECLARED_LADDER_CENSUS = (rungs: string[]) => `
  select p.proname::text as function_name, pg_get_function_identity_arguments(p.oid) as identity_args,
         'declared client-callable, is SECURITY DEFINER, takes an id - and its body never reaches '
         'the one ladder (custom.assert_client_may_reach / _may_change / _may_open / has_visibility)'::text as why
    ${DECLARED_DOOR_BODY}
     and p.prosecdef
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and exists (select 1 from unnest(p.proargtypes) t(typ)
                  where t.typ in ('pg_catalog.uuid'::regtype, 'pg_catalog.uuid[]'::regtype))
     ${rungs.length ? `and ${NO_COMMENTS} !~* '(${rungs.join("|")})'` : ""}
   order by 1`;

const DECLARED_SWITCH_CENSUS = (accept: boolean) => `
  select p.proname::text as function_name, pg_get_function_identity_arguments(p.oid) as identity_args,
         'declared client-callable and writes a record, but never asks whether the store is open '
         '(custom.assert_store_door / custom.store_is_open)'::text as why
    ${DECLARED_DOOR_BODY}
     and ${NO_COMMENTS} ~* '(insert into custom\\.record|update custom\\.record|custom\\.record_write|custom\\.record_update|custom\\.record_delete|custom\\.record_restore)'
     ${accept ? `and ${NO_COMMENTS} !~* '(custom\\.assert_store_door|custom\\.store_is_open)'` : ""}
   order by 1`;

const TABLE_PRIVILEGE_CENSUS = `
  select c.relname::text as function_name,
         string_agg(g.role || ' ' || g.priv, ', ' order by g.role, g.priv) as identity_args,
         'a client role holds a TABLE privilege in schema custom - the store is reached through '
         'its doors or not at all, and censuses 1 and 5 excuse SECURITY INVOKER bodies only '
         'because this is empty'::text as why
    from pg_class c
   cross join (values ('authenticated','SELECT'), ('authenticated','INSERT'),
                      ('authenticated','UPDATE'), ('authenticated','DELETE'),
                      ('anon','SELECT'), ('anon','INSERT'),
                      ('anon','UPDATE'), ('anon','DELETE')) as g(role, priv)
   where c.relnamespace = 'custom'::regnamespace
     and c.relkind in ('r', 'p', 'v', 'f')
     and has_table_privilege(g.role, c.oid, g.priv)
   group by c.relname
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

      // AND THE ONE-LADDER CENSUS, the same way: with `custom.has_visibility` itself listed
      // as a ladder it objects to, every routed door must be named.
      const redLadder = (await client.query<Row>(ONE_LADDER_RED)).rows;
      const ladderNames = new Set(redLadder.map((r) => r.function_name));
      const mustRoute = [
        "read_record",
        "read_records",
        "assert_client_may_change",
        "io_restore",
        "anon_publish",
      ];
      const unrouted = mustRoute.filter((n) => !ladderNames.has(n));
      if (unrouted.length > 0) {
        fail(
          "SELF-TEST FAILED - with custom.has_visibility itself counted as a ladder to object " +
            `to, the one-ladder census did not name ${unrouted.join(", ")}. Either those doors ` +
            "are no longer on the one ladder, or the census is not reading the bodies it claims to.",
        );
      }
      console.log(
        `[ OK ] self-test - counting the one ladder itself as an objection, the one-ladder ` +
          `census names ${ladderNames.size} door(s) including all five that must be routed. ` +
          "It can go red.",
      );

      // CENSUS 5, THE RED HALF. With NO rung accepted as the ladder, every declared
      // SECURITY DEFINER door that takes an id must be named - including the ones lane
      // REACH routed. If it names nothing, it is reading an empty set.
      const redDeclared = (await client.query<Row>(DECLARED_LADDER_CENSUS([]))).rows;
      const declaredNames = new Set(redDeclared.map((r) => r.function_name));
      const mustDeclare = [
        "migrate_rename",
        "query_across_homes",
        "home_add",
        "relation_targets",
        "query_record_as_of",
        "record_aggregate",
        "io_export",
      ];
      const undeclared = mustDeclare.filter((n) => !declaredNames.has(n));
      if (undeclared.length > 0) {
        fail(
          "SELF-TEST FAILED - with no rung accepted as the one ladder, the declared-door census " +
            `did not name ${undeclared.join(", ")}. One door per group - a migration verb, a ` +
            "query, a home, a relation, an as-of read, an aggregate and an export - has to be in " +
            "reach of this query or its green answer proves nothing.",
        );
      }
      console.log(
        `[ OK ] self-test - with no rung accepted, the declared-door census names ` +
          `${declaredNames.size} door(s) including one from every group lane REACH opened. It can go red.`,
      );

      // CENSUS 6, THE RED HALF. With the switch itself not accepted, every declared door
      // that writes a record must be named.
      const redSwitch = (await client.query<Row>(DECLARED_SWITCH_CENSUS(false))).rows;
      const switchNames = new Set(redSwitch.map((r) => r.function_name));
      const mustAsk = ["record_write", "migrate_rename", "home_add", "relation_own"];
      const notAsking = mustAsk.filter((n) => !switchNames.has(n));
      if (notAsking.length > 0) {
        fail(
          "SELF-TEST FAILED - with the store's switch not accepted as an answer, the switch " +
            `census did not name ${notAsking.join(", ")}, which all write a record through a ` +
            "client door. The query is not reading the bodies it claims to.",
        );
      }
      console.log(
        `[ OK ] self-test - counting the switch itself as an objection, the switch census names ` +
          `${switchNames.size} writing door(s). It can go red.`,
      );
    }

    const callers = (await client.query<Row>(CALLER_CENSUS(DECIDERS))).rows;
    const records = (await client.query<Row>(RECORD_CENSUS(DECIDERS))).rows;
    const grants = (await client.query<Row>(GRANT_CENSUS)).rows;
    const ladder = (await client.query<Row>(ONE_LADDER_CENSUS)).rows;
    const declaredLadder = (await client.query<Row>(DECLARED_LADDER_CENSUS(LADDER_RUNGS))).rows;
    const declaredSwitch = (await client.query<Row>(DECLARED_SWITCH_CENSUS(true))).rows;
    const tablePrivileges = (await client.query<Row>(TABLE_PRIVILEGE_CENSUS)).rows;

    const ok = [
      report("client doors taking an organization id that never decide the caller", callers),
      report("client doors that write a record without deciding that row", records),
      report("declared doors whose grant or signature does not match the live catalog", grants),
      report("doors deciding a row with a ladder of their own instead of the one function", ladder),
      report("declared client doors whose body never goes through the one ladder", declaredLadder),
      report("declared client doors that write a record without asking the store's switch", declaredSwitch),
      report("client roles holding a TABLE privilege in schema custom", tablePrivileges),
    ].every(Boolean);

    if (!ok) {
      console.error(
        "\n  A door into schema `custom` that a signed-in caller may execute decides, FIRST:\n" +
          "    the organization  - custom.assert_client_may_reach(organization, door)\n" +
          "    and the row       - custom.assert_client_may_change(organization, subject, door[, level, word])\n" +
          "  A read door decides the row with custom.has_visibility - THE ONE LADDER, asked at\n" +
          "  viewer to read, commenter to comment, editor to write, admin for the structural\n" +
          "  doors - and the\n" +
          "  anonymous doors decide with custom.anon_token_verify. Adding a door is adding one of\n" +
          "  those lines; there is no door that decides nothing.\n",
      );
      exitAfterDrain(1);
    }
    console.log("\nEvery client door into the record store decides the caller and the row.");
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
