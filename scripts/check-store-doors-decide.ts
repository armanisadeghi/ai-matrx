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
 *  11. A client-executable function in schema `custom` that is SECURITY INVOKER. The
 *      grant on it is worth nothing (census 7 keeps `authenticated` holding no table
 *      privilege here) and the call dies on the body's own first line. That was T9.
 *
 *   pnpm check:store-doors-decide
 *   pnpm check:store-doors-decide:self-test   # proves the censuses can still go RED
 *   pnpm check:store-doors-decide --exhaustive  # census 13 CALLS every door, every row
 */

import { formatDurationMs } from "@ai-matrx/kit/format";
import { connectDirect, loadDbEnv } from "./lib/direct-db";
import { censusWithPatience } from "./lib/census-with-patience";
import { exitAfterDrain } from "./lib/exit-after-drain";

function fail(message: string): never {
  console.error(`[FAIL] ${message}`);
  // exitAfterDrain's return type is `never` (it always calls process.exit), so a
  // trailing statement here can never run — that made TS7027 flag it as dead code.
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

/**
 * THE ELEVENTH CENSUS - A GRANT ON A SECURITY INVOKER BODY IS A GRANT WORTH NOTHING
 * (2026-09-20, lane STORE-T).
 *
 * `custom.migrate_retype` was declared client-callable, held EXECUTE for `authenticated`,
 * asked the one ladder in its first three lines - and was SECURITY INVOKER. So it ran with
 * the CALLER'S privileges, and `authenticated` holds EXECUTE on none of the ladder, so it
 * died on its own first line: `permission denied for function assert_client_may_reach`, to
 * the OWNER of the record. That is the whole of acceptance test T9, and every census above
 * was green on it: the grant was there, the door row was there, the ladder was in the body.
 *
 * Census 7 keeps the boundary that makes this checkable - `authenticated` holds no TABLE
 * privilege in schema `custom` - so an INVOKER function here can reach nothing of the store
 * at all. Which means: if its body names the store's own tables or the ladder, the grant on
 * it is either dead or about to be. Either way it is a lie told to a caller.
 *
 * TRIGGER functions are exempt and always were: they have no direct call surface, `CREATE
 * FUNCTION` gives them PUBLIC EXECUTE by default, and both DDL guards exempt them for the
 * same reason.
 */
const INVOKER_DOOR_CENSUS = (exempt: boolean) => `
  select p.proname::text as function_name, pg_get_function_identity_arguments(p.oid) as identity_args,
         'a client may execute it and it is SECURITY INVOKER, so it runs with the CALLER''s '
         'privileges - and it reaches ' ||
         case when ${NO_COMMENTS} ~* '(from|join|into|update|delete\\s+from)\\s+custom\\.record\\M'
              then 'custom.record, which authenticated holds no privilege on'
              else 'custom.' || (select string_agg(q.proname, ', ' order by q.proname)
                                   from pg_proc q
                                  where q.pronamespace = 'custom'::regnamespace
                                    and q.oid <> p.oid
                                    and not has_function_privilege('authenticated', q.oid, 'EXECUTE')
                                    and ${NO_COMMENTS} ~* ('custom\\.' || q.proname || '\\s*\\('))
                   || ', which authenticated may not execute'
         end ||
         ' - so the grant is worth nothing and the call dies on the body''s own first line'::text as why
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and not p.prosecdef
     ${exempt ? `and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)` : ""}
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     -- THE REAL QUESTION, NOT A PROXY FOR IT (lane ENTITY-FIELDS, 2026-09-20). This used to
     -- read \`custom.record|custom.assert_|assert_client_may|has_visibility\`, which is the
     -- shape the defect happened to have rather than the thing that makes it a defect. It
     -- named a body for mentioning a ladder function the caller CAN execute - and it named a
     -- body for its own CREATE FUNCTION line, because that line contains the function's own
     -- name. The census now asks what actually decides it: does this body touch something the
     -- CALLER cannot reach? custom.record (census 7 keeps authenticated holding no table
     -- privilege here) or a function of this schema with no EXECUTE for authenticated. A
     -- The custom.record arm reads FROM / JOIN / INTO / UPDATE / DELETE FROM specifically,
     -- because \`'custom.record'::regclass\` is a NAME, not a read: custom.assert_client_may_reach
     -- resolves that literal to find the store's owner and needs no privilege on the table to
     -- do it, and a census that named it for the mention alone would be back to a proxy. A
     -- SECURITY INVOKER door that touches NEITHER runs perfectly as the person - which is the
     -- whole point of the three ENTITY-FIELDS value doors, where the standard business table's
     -- OWN row-level security is what must decide, and a SECURITY DEFINER wrapper would
     -- replace it with a second access system.
     and (
       ${NO_COMMENTS} ~* '(from|join|into|update|delete\\s+from)\\s+custom\\.record\\M'
       or exists (select 1 from pg_proc q
                   where q.pronamespace = 'custom'::regnamespace
                     and q.oid <> p.oid
                     and not has_function_privilege('authenticated', q.oid, 'EXECUTE')
                     and ${NO_COMMENTS} ~* ('custom\\.' || q.proname || '\\s*\\('))
     )
   order by 1`;

const DECLARED_SWITCH_CENSUS = (accept: boolean) => `
  select p.proname::text as function_name, pg_get_function_identity_arguments(p.oid) as identity_args,
         'declared client-callable and writes a record, but never asks whether the store is open '
         '(custom.assert_store_door / custom.store_is_open)'::text as why
    ${DECLARED_DOOR_BODY}
     and ${NO_COMMENTS} ~* '(insert into custom\\.record|update custom\\.record|custom\\.record_write|custom\\.record_update|custom\\.record_delete|custom\\.record_restore)'
     ${accept ? `and ${NO_COMMENTS} !~* '(custom\\.assert_store_door|custom\\.store_is_open)'` : ""}
   order by 1`;

/**
 * THE EIGHTH CENSUS — A CLOSED SCHEMA IS CLOSED, NOT MERELY DESCRIBED AS CLOSED
 * (2026-09-19, lane OPEN-CENSUS).
 *
 * Censuses 1-7 all read a door somebody DECLARED or a body somebody WROTE. None of
 * them could see the opposite thing: a function nobody declared at all, holding a
 * client EXECUTE grant nobody decided to give it. Measured live on the main database
 * when this was written: THIRTY-ONE of them.
 *
 *   - `custom`, 10, straight from Postgres's own default. `CREATE FUNCTION` grants
 *     EXECUTE to PUBLIC, `authenticated` holds USAGE on the schema, and both birth
 *     guards stand down — `platform.enforce_definer_client_grants` skips SECURITY
 *     INVOKER by design and `platform.close_new_functions_to_anon` does not list
 *     `custom` at all. `custom.delete_cascade_closure(uuid, uuid)`, created after
 *     lane REACH's sweep, was executable by `authenticated` AND by `anon`.
 *   - `history`, 21, from one blanket `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA
 *     history TO authenticated`.
 *
 * `platform.schema_client_exposure` had declared `custom` closed since 2026-09-18 and
 * nothing in the database ever acted on that row: `platform.reopen_declared_doors`
 * had an OPENING pass only. It now has a closing pass, it runs at `CREATE FUNCTION`
 * as well as at `REVOKE`, and THIS is the query that says whether it is still true.
 *
 * The rule is the whole declaration, not one schema: every schema declared closed in
 * `platform.schema_client_exposure` reaches a client through a
 * `platform.client_callable_door` row or not at all.
 */
const CLOSED_SCHEMA_CENSUS = (respectDeclarations: boolean) => `
  select n.nspname || '.' || p.proname as function_name,
         pg_get_function_identity_arguments(p.oid) as identity_args,
         'in schema ' || n.nspname || ', declared CLOSED in platform.schema_client_exposure, and '
         'reachable by a client with no platform.client_callable_door row opening a client lane. '
         'Run select * from platform.reopen_declared_doors(' || quote_literal(n.nspname) || ') to '
         'close it, or declare it if a person is meant to call it.'::text as why
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join platform.schema_client_exposure e
      on e.schema_name = n.nspname and not coalesce(e.client_exposed, false)
   where p.prokind in ('f', 'p')
     and p.prorettype not in ('pg_catalog.trigger'::regtype, 'pg_catalog.event_trigger'::regtype)
     and not exists (select 1 from pg_depend dep where dep.objid = p.oid and dep.deptype = 'e')
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('public', p.oid, 'EXECUTE'))
     ${
       respectDeclarations
         ? `and not exists (select 1 from platform.client_callable_door d
                             where d.schema_name = n.nspname and d.function_name = p.proname
                               and d.identity_argtypes = platform.door_argtypes(p.proargtypes)
                               and (d.signed_in_callers or d.anonymous_callers))`
         : ""
     }
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

/**
 * CENSUS 9 — A DOOR ROW SAYS THE SIGNATURE THE CATALOG SAYS, IN EVERY SCHEMA.
 *
 * `identity_args` is text, and text renders differently depending on the search_path of
 * whoever rendered it: `pg_get_function_identity_arguments` schema-qualifies a type that is
 * not visible on the path, so a door written at `search_path = pg_catalog` reads
 * `p_required public.permission_level` while every reader on an ordinary session reads
 * `p_required permission_level`. Census 3 above joins on that text, so a door with an enum
 * argument was reported as naming no live function while both the door and the function were
 * fine — and two lanes repaired their own rows by hand before anybody fixed the helper
 * (`iam.door_identity_args`, TABLE-OWNER 2026-09-19).
 *
 * This census asks the class rather than the instance: matched by `identity_argtypes`, which
 * is the search-path-free key, does the stored TEXT equal what the catalog renders here?
 * `argtypes` null is not this census's business — census 3 already refuses a row that names
 * no live function at all.
 */
const IDENTITY_RENDERING_CENSUS = `
  select d.schema_name || '.' || d.function_name as function_name,
         d.identity_args,
         'the row stores ' || quote_literal(d.identity_args) ||
         ' and the catalog renders ' || quote_literal(pg_get_function_identity_arguments(p.oid)) as why
    from platform.client_callable_door d
    join pg_namespace n on n.nspname = d.schema_name
    join pg_proc p on p.proname = d.function_name and p.pronamespace = n.oid
     and platform.door_argtypes(p.proargtypes) = d.identity_argtypes
   where d.identity_argtypes is not null
     and d.identity_args is distinct from pg_get_function_identity_arguments(p.oid)
   order by 1`;

/**
 * CENSUS 12 — THE THREE ANSWERS TO ONE QUESTION, IN EVERY `shared_only` ORGANIZATION
 * (2026-09-19, lane SHARED-ONLY).
 *
 * Censuses 1-9 read the CATALOGUE and census 10 asks two seats about one record. All eleven
 * were green on the day the sixth independent pass found that an organization which chooses
 * "people only see what is shared with them" LOSES SHARING ENTIRELY: the store's own question
 * "can she see this?" answered TRUE, every screen answered "You do not have access to this
 * table", and a whole table shared at Admin opened with zero rows. Nothing about the shape of
 * a door was wrong; three different pieces of the system answered one question differently.
 *
 * `custom.shared_only_disagreements()` is that comparison, over every (member, record) pair in
 * every organization that has said `shared_only`: the ONE LADDER, the READ DOOR's own
 * predicate, and the RLS POLICY TEXT the mirror generates, on the same row. The kind of
 * disagreement is the first word of `why`:
 *
 *   doors-disagree      the ladder and the read door differ - always a failure
 *   mirror-admits-more  the policy text admits a row every door refuses - always a failure,
 *                       and exactly what `custom/member_default_visibility` left open in
 *                       `iam.entity_read_expr` until this lane
 *   mirror-admits-less  the doors admit through an arm of the store ladder that sits ABOVE the
 *                       platform kernel the mirror is generated from. Harmless while schema
 *                       `custom` holds no table privilege for any client role - which is
 *                       census 7 - because then no policy built from that text decides
 *                       anything. The moment census 7 finds one, this becomes a failure too,
 *                       and the two censuses are wired together below so that happens by
 *                       itself.
 *   unmeasured          an organization with more pairs than the ceiling - never a pass.
 *
 * Its RED half re-runs the same census with one of two REAL historical states restored:
 * `mirror_forgets_the_knob` (the mirror before this lane) and `door_refuses_the_share` (the
 * screens the sixth pass photographed).
 */
const SHARED_ONLY_CENSUS = (pretend: string | null) =>
  `select record_id::text as function_name,
          coalesce(member_id::text, organization_name) as identity_args,
          why
     from custom.shared_only_disagreements(${pretend === null ? "null" : `'${pretend}'`})`;

/** The kinds that are never allowed, whatever else is true. */
const SHARED_ONLY_NEVER = ["doors-disagree", "mirror-admits-more", "unmeasured"];

/**
 * CENSUS 13 — EVERY LIST-SHAPED DOOR ANSWERS EXACTLY WHAT `custom.read_record` ANSWERS
 * (2026-09-20, lane LEAK-T10).
 *
 * Census 12 compares the one LADDER, the read door's PREDICATE TEXT and the RLS POLICY TEXT.
 * All twelve censuses above it were green on the morning the seventh independent pass found
 * that a member shared ONE Home of a multi-Home Table was handed EVERY record of that Table in
 * every other Home — with its contents — by `custom.read_records`, `custom.query_visible_ids`,
 * `custom.query_across_homes` and `custom.io_export`, while `custom.read_record` refused her
 * the same row. Nothing about the shape of a door was wrong and the ladder was right; the
 * set-based path took a different route to the same question, and a census that reads a
 * PREDICATE never executes the door that uses it.
 *
 * `custom.list_door_disagreements()` CALLS THE DOORS: every organization whose store is open —
 * under BOTH privacy settings — every active member, every Table, `custom.read_record` per row
 * for the truth, and each list-shaped door for its rows. Exhaustive for a Table with more than
 * one Home, sampled otherwise.
 *
 * ITS KINDS. `doors-disagree` is always a failure. `unmeasured` is never a pass — it means a
 * door DIED rather than answered (a broken worked-out column used to close a whole Table) or an
 * organization is over the ceiling.
 *
 * NO LIVE ORGANIZATION HAS A MULTI-HOME TABLE, so the live sweep alone would be green about
 * nothing. `t10Probe` BUILDS the shape — one Table in two Homes, one record in each, a member
 * shared one Home and nothing else — through the product's own doors, runs the census on it
 * under `shared_only` AND `all_records`, and rolls the whole thing back.
 *
 * Its RED half re-runs that fixture with the ONE LINE this lane changed put back
 * (`custom.visible_set`'s whole-Table shortcut asking `custom.reaches_directly` about the Table,
 * which climbs from the Table into the Table's Homes) and requires it to name rows.
 */
const LIST_DOOR_CENSUS = (
  pretend: string | null,
  organization: string | null,
  exhaustive = false,
) =>
  `select coalesce(record_id::text, table_id::text, organization_id::text) as function_name,
          coalesce(door, organization_name) as identity_args,
          why
     from custom.list_door_disagreements(${pretend === null ? "null" : `'${pretend}'`},
                                         ${organization === null ? "null" : `'${organization}'`},
                                         200, ${exhaustive})`;

/**
 * CENSUS 14 — A REFUSAL NEVER TELLS SOMEBODY WHAT THEY DO HOLD UNLESS THE DOOR ASKED
 * (2026-09-20, lane LEAK-T10).
 *
 * `custom.io_comment_write` refused a person who may not read a record at all with "You may
 * READ this record but not comment on it." The door had asked one question — is she a
 * commenter — and answered a different one, telling her she holds a level she does not and
 * that the record exists. `custom.refusals_claiming_a_level_never_asked()` names any body in
 * schema `custom` that says that sentence without asking `viewer` first; it reads the CODE with
 * `--` comments stripped, and it excludes itself, because its own text has to contain the
 * sentence it looks for.
 */
const REFUSAL_CENSUS = `select function_name, identity_args, why
   from custom.refusals_claiming_a_level_never_asked()`;

const T10_ORG = "2ef10000-0000-4a00-8a00-0000000000e1";
const T10_PRETEND = "a_home_of_a_table_is_the_whole_table";

/**
 * ONE TABLE, TWO HOMES, ONE SHARE — built through `custom.table_declare`, `custom.home_add`,
 * `custom.record_reparent` and `custom.share_grant`, which is how a person builds it, then
 * censused and rolled back. `visibilityKnob` is the organization's privacy setting; the caller
 * runs it at both.
 */
const T10_FIXTURE = (visibilityKnob: string) => `
  select set_config('app.actor_system', 'check_store_doors_decide', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values ('${T10_ORG}', 'STORE DOORS two-home probe', 'store-doors-two-home-probe', 'SDH',
          '${TWO_SEAT_ADMIN}');
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values ('${T10_ORG}', 'organization', '${T10_ORG}', '${TWO_SEAT_ADMIN}', 'owner', 'active'),
         ('${T10_ORG}', 'organization', '${T10_ORG}', '${TWO_SEAT_MEMBER}', 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', '${T10_ORG}', '${T10_ORG}',
          'true'::jsonb, 'check:store-doors-decide two-home probe'),
         ('custom', 'member_default_visibility', 'organization', '${T10_ORG}', '${T10_ORG}',
          '"${visibilityKnob}"'::jsonb, 'check:store-doors-decide two-home probe');
  do $probe$
  declare
    v_org   constant uuid := '${T10_ORG}';
    v_admin constant uuid := '${TWO_SEAT_ADMIN}';
    v_dana  constant uuid := '${TWO_SEAT_MEMBER}';
    v_boss  text := current_user;
    v_home uuid; v_tproj uuid; v_hx uuid; v_hy uuid; v_trisk uuid; v_rx uuid; v_ry uuid;
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_home  := custom.record_write(v_org, custom.organization_kernel_id(),
                                   jsonb_build_object('name', 'two-home probe'));
    v_tproj := custom.table_declare(v_org, jsonb_build_object(
      'name','sdh_projects','slug','sdh_projects','label_singular','Project','label_plural','Projects',
      'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
      'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
      'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
      'title_field','title','parent_id', v_home::text));
    perform custom.field_declare(v_org, v_tproj, jsonb_build_object('label','Title','type','text'));
    v_hx := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project X'));
    v_hy := custom.record_write(v_org, v_tproj, jsonb_build_object('title','Project Y'));
    v_trisk := custom.table_declare(v_org, jsonb_build_object(
      'name','sdh_risks','slug','sdh_risks','label_singular','Risk','label_plural','Risks',
      'type','entity','display','list','ordered',false,'weight','light','retention_days',30,
      'default_sort','[]'::jsonb,'row_order','sorted','agent_writable',true,
      'fields', jsonb_build_array(jsonb_build_object('name','title','kind','text')),
      'title_field','title','parent_id', v_home::text));
    perform custom.field_declare(v_org, v_trisk, jsonb_build_object('label','Title','type','text'));
    -- THE SHAPE: one Table, two Homes.
    perform custom.home_add(v_org, v_trisk, v_hx);
    perform custom.home_add(v_org, v_trisk, v_hy);
    v_rx := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in X'));
    v_ry := custom.record_write(v_org, v_trisk, jsonb_build_object('title','risk in Y'));
    perform custom.record_reparent(v_org, v_rx, v_hx);
    perform custom.record_reparent(v_org, v_ry, v_hy);
    -- SHE IS GIVEN PROJECT X AND NOTHING ELSE.
    perform custom.share_grant(v_org, v_hx, 'user', v_dana, 'viewer'::public.permission_level);
    perform set_config('role', v_boss, true);
  end $probe$;
`;

/**
 * Build the two-Home fixture at one privacy setting, run census 13 over that organization
 * alone, roll back whatever happens, and hand back the rows it named.
 */
async function t10Probe(
  client: { query: (sql: string) => Promise<unknown> },
  visibilityKnob: string,
  pretend: string | null,
  exhaustive = false,
): Promise<Row[]> {
  await client.query("begin");
  try {
    await client.query("set local statement_timeout = '300s'");
    await client.query("set local lock_timeout = '20s'");
    await client.query(T10_FIXTURE(visibilityKnob));
    const rows = (await client.query(
      LIST_DOOR_CENSUS(pretend, T10_ORG, exhaustive),
    )) as { rows: Row[] };
    return rows.rows;
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
}

/**
 * CENSUS 10 — THE TWO-SEAT PROBE: "VIEWER" MEANS VIEWER, AND REVOKED MEANS REVOKED
 * (2026-09-19, lane LEVEL-FIX).
 *
 * Censuses 1-9 all read the CATALOGUE. Every one of them was green on the day the fifth
 * independent pass shared a record with a colleague at VIEWER through the Share dialog and
 * watched her rewrite it, delete it, create her own in the table, and go on editing after the
 * share was revoked. Nothing about the shape of a door was wrong. The ANSWER was wrong:
 * `iam.has_access_for_base`'s organization-member lane hard-coded `p_required <= 'editor'` for
 * every member of every organization, so the read door said `editor` while
 * `custom.share_access` said `viewer` in the same breath.
 *
 * A shape census cannot see that, so this one is not a shape census. It BUILDS a throwaway
 * organization with two real seats inside a transaction it always rolls back, shares one record
 * at viewer, and asks the doors the two questions the product promises:
 *
 *   a. A VIEWER CANNOT WRITE - `custom.record_update`, `custom.record_delete` and
 *      `custom.record_write` all refuse, as role `authenticated` carrying her claims.
 *   b. REVOKED CANNOT READ - with the share gone, in an organization that has said membership
 *      alone shows nothing (`custom/member_default_visibility = shared_only`),
 *      `custom.read_record` refuses.
 *
 * And, because a probe that can only pass is not a probe, its RED half (`--self-test`) inverts
 * exactly two real things inside the same rolled-back transaction - the grant is written at
 * `editor` instead of `viewer`, and the organization is left at the shipped `all_records` - and
 * requires both clauses to FAIL. Those are the two states in which the product genuinely does
 * allow the write and the read, so a green answer above is green about something.
 *
 * It uses `admin@admin.com` and `test@test.com` and nobody else, touches no existing row, and
 * commits nothing.
 */
const TWO_SEAT_ORG = "1ef10000-0000-4a00-8a00-0000000000d1";
const TWO_SEAT_TBL = "1ef10000-0000-4a00-8a00-0000000000d2";
const TWO_SEAT_REC = "1ef10000-0000-4a00-8a00-0000000000d3";
const TWO_SEAT_ADMIN = "87a6e699-3622-4869-8843-d0867456c0dd";
const TWO_SEAT_MEMBER = "4060701e-706a-4c76-b3ca-0bbc69fa5a14";
/** The kernel Table every store fixture hangs off. */
const TWO_SEAT_KERNEL_ORG = "11111111-0000-4000-8000-000000000004";

const TWO_SEAT_FIXTURE = (grantLevel: string, visibilityKnob: string) => `
  select set_config('app.actor_system', 'check_store_doors_decide', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values ('${TWO_SEAT_ORG}', 'STORE DOORS two-seat probe', 'store-doors-two-seat-probe', 'SDP',
          '${TWO_SEAT_ADMIN}');
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values ('${TWO_SEAT_ORG}', 'organization', '${TWO_SEAT_ORG}', '${TWO_SEAT_ADMIN}', 'owner', 'active'),
         ('${TWO_SEAT_ORG}', 'organization', '${TWO_SEAT_ORG}', '${TWO_SEAT_MEMBER}', 'member', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', '${TWO_SEAT_ORG}', '${TWO_SEAT_ORG}',
          'true'::jsonb, 'check:store-doors-decide two-seat probe'),
         ('custom', 'member_default_visibility', 'organization', '${TWO_SEAT_ORG}', '${TWO_SEAT_ORG}',
          '"${visibilityKnob}"'::jsonb, 'check:store-doors-decide two-seat probe');
  insert into custom.record (id, organization_id, table_id, data_class, data, created_by)
  values ('${TWO_SEAT_TBL}', '${TWO_SEAT_ORG}', '${TWO_SEAT_KERNEL_ORG}', 'record',
          jsonb_build_object('name', 'Two-seat probe table'), '${TWO_SEAT_ADMIN}'),
         ('${TWO_SEAT_REC}', '${TWO_SEAT_ORG}', '${TWO_SEAT_TBL}', 'record',
          jsonb_build_object('title', 'The admin''s record'), '${TWO_SEAT_ADMIN}');
  -- The share the dialog writes - on the record AND on the table it lives in, because
  -- custom.record_write asks for editor ON THE TABLE and the probe has to be able to invert
  -- into a person who genuinely may create a record, not merely one who may edit an existing one.
  insert into iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  values ('record', '${TWO_SEAT_REC}', '${TWO_SEAT_MEMBER}', '${grantLevel}', '${TWO_SEAT_ADMIN}'),
         ('record', '${TWO_SEAT_TBL}', '${TWO_SEAT_MEMBER}', '${grantLevel}', '${TWO_SEAT_ADMIN}');
`;

/** Each clause the member's seat must be refused, and the name it is reported under. */
const TWO_SEAT_WRITE_CLAUSES: ReadonlyArray<readonly [string, string]> = [
  ["custom.record_update", `select custom.record_update('${TWO_SEAT_ORG}', '${TWO_SEAT_REC}', '{"title":"probe"}'::jsonb, null)`],
  ["custom.record_delete", `select custom.record_delete('${TWO_SEAT_ORG}', '${TWO_SEAT_REC}')`],
  ["custom.record_write", `select custom.record_write('${TWO_SEAT_ORG}', '${TWO_SEAT_TBL}', '{"title":"probe"}'::jsonb)`],
];

const TWO_SEAT_BECOME_MEMBER = `
  select set_config('request.jwt.claims',
    '{"sub":"${TWO_SEAT_MEMBER}","role":"authenticated"}', true);
  set local role authenticated;
`;

interface TwoSeatResult {
  /** Doors that took a write from somebody shared at the probe's level. */
  readonly wroteAnyway: string[];
  /** True when the revoked seat could still open the record. */
  readonly readAfterRevoke: boolean;
}

/**
 * Run the probe inside ONE transaction and roll it back, whatever happens. `grantLevel` and
 * `visibilityKnob` are what the self-test inverts.
 */
async function twoSeatProbe(
  client: { query: (sql: string) => Promise<unknown> },
  grantLevel: string,
  visibilityKnob: string,
): Promise<TwoSeatResult> {
  const wroteAnyway: string[] = [];
  let readAfterRevoke = false;
  await client.query("begin");
  try {
    await client.query("set local statement_timeout = '120s'");
    await client.query("set local lock_timeout = '20s'");
    await client.query(TWO_SEAT_FIXTURE(grantLevel, visibilityKnob));

    for (const [name, sql] of TWO_SEAT_WRITE_CLAUSES) {
      await client.query("savepoint probe");
      try {
        await client.query(TWO_SEAT_BECOME_MEMBER);
        await client.query(sql);
        wroteAnyway.push(name);
      } catch {
        // refused, which is the answer the product promises
      } finally {
        await client.query("rollback to savepoint probe");
      }
    }

    // …and the revoked seat.
    await client.query(
      `delete from iam.permissions where resource_type = 'record'
         and resource_id in ('${TWO_SEAT_REC}', '${TWO_SEAT_TBL}')
         and granted_to_user_id = '${TWO_SEAT_MEMBER}'`,
    );
    await client.query("savepoint probe");
    try {
      await client.query(TWO_SEAT_BECOME_MEMBER);
      await client.query(`select custom.read_record('${TWO_SEAT_ORG}', '${TWO_SEAT_REC}', false)`);
      readAfterRevoke = true;
    } catch {
      // refused
    } finally {
      await client.query("rollback to savepoint probe");
    }
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
  return { wroteAnyway, readAfterRevoke };
}

/**
 * CENSUS 16 — THE FINGERPRINT AND THE BODIES ARE THE SAME DATABASE (lane PAIR-GUARD, 2026-09-20).
 *
 * `platform.provision` refuses EVERY spec with `preflight.read_kernel` the moment
 * `iam.entity_read_kernel_fingerprint()` (hashed from the sixteen live access-kernel
 * bodies) stops equalling `iam.entity_read_kernel_expected()` (the recorded proof). On
 * 2026-09-20 that is exactly what happened: three landings replaced kernel bodies and
 * re-recorded nothing, and no table could be created on this database for ~2.5 hours.
 *
 * `platform.provision_selfcheck()` already finds this — hourly, AFTER the fact. This
 * census is the same fact asked BEFORE a lane lands, in the guard lanes actually run.
 * It reads the two functions rather than a cached string, so nothing can go green by
 * agreeing with a stale copy of itself.
 */
const KERNEL_FINGERPRINT_CENSUS = `
  select 'iam.entity_read_kernel_expected' as function_name,
         'the recorded proof' as identity_args,
         'live bodies hash to ' || iam.entity_read_kernel_fingerprint() ||
         ' but the recorded expectation is ' || iam.entity_read_kernel_expected() ||
         ' - platform.provision refuses every spec with preflight.read_kernel until they agree' as why
   where iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected()`;

interface Row {
  function_name: string;
  identity_args: string;
  why?: string;
}

/**
 * `qualified` says the census already returns `<schema>.<name>` — census 8 spans every
 * schema declared closed, so prefixing it with `custom.` would print a lie.
 */
function report(title: string, rows: Row[], qualified = false): boolean {
  if (rows.length === 0) {
    console.log(`[ OK ] ${title} - none.`);
    return true;
  }
  console.error(`[FAIL] ${title} - ${rows.length}:`);
  for (const r of rows) {
    const name = qualified ? r.function_name : `custom.${r.function_name}`;
    console.error(`       ${name}(${r.identity_args})${r.why ? ` - ${r.why}` : ""}`);
  }
  return false;
}

/**
 * WHAT `--exhaustive` IS FOR (2026-09-20, lane GUARD-PERF).
 *
 * Census 13's default run compares the SET every list-shaped door builds its rows from
 * (`custom.visible_set`) against the per-row ladder `custom.read_record` decides with
 * (`custom.has_visibility`) — one query per (member, Table), and it checks in the catalogue
 * that each door still routes through that set before it believes the substitution.
 * `--exhaustive` CALLS the seven doors instead, for every row, with no sampling anywhere:
 * the census exactly as LEAK-T10 wrote it. It is ~5x slower, which is why it is the nightly
 * non-blocking run rather than the one a lane waits on, and why it is a flag rather than a
 * deletion.
 */
async function main(): Promise<void> {
  const selfTest = process.argv.includes("--self-test");
  const exhaustive = process.argv.includes("--exhaustive");
  /** Wall-clock per census, so a guard that starts to crawl says so before it dies. */
  const started = Date.now();
  const since = (mark: number) => formatDurationMs(Date.now() - mark, { style: "compact" });

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

      // CENSUS 8, THE RED HALF. With the declarations NOT respected, every client-reachable
      // function in a declared-closed schema must be named — which is every door lane REACH
      // opened. If it names nothing, the query is reading an empty set and its green answer
      // above proves only that `platform.schema_client_exposure` has no rows it can see.
      const redClosed = (await client.query<Row>(CLOSED_SCHEMA_CENSUS(false))).rows;
      const closedNames = new Set(redClosed.map((r) => r.function_name));
      const mustBeReachable = [
        "custom.record_write",
        "custom.record_update",
        "custom.read_record",
        "custom.migrate_rename",
        "custom.io_export",
      ];
      const unreachable = mustBeReachable.filter((n) => !closedNames.has(n));
      if (unreachable.length > 0) {
        fail(
          "SELF-TEST FAILED - with the door declarations not respected, the closed-schema census " +
            `did not name ${unreachable.join(", ")}, which ARE client-reachable in a schema ` +
            "declared closed. Either platform.schema_client_exposure no longer declares their " +
            "schema closed, or the census is not reading the catalog it claims to - and then its " +
            "green answer means nothing.",
        );
      }
      console.log(
        `[ OK ] self-test - ignoring the declarations, the closed-schema census names ` +
          `${closedNames.size} client-reachable function(s) in a declared-closed schema, ` +
          "including all five that must be. It can go red.",
      );
      // CENSUS 10, THE RED HALF. The same probe with exactly two real things inverted: the
      // grant is written at EDITOR rather than viewer, and the organization is left at the
      // shipped `all_records` rather than `shared_only`. Both clauses must then FAIL - those
      // are the two states in which the product really does allow the write and the read, so
      // if they do not fail, the probe is not driving the doors it claims to drive.
      const redProbe = await twoSeatProbe(client, "editor", "all_records");
      const missedWrites = TWO_SEAT_WRITE_CLAUSES.map(([n]) => n).filter(
        (n) => !redProbe.wroteAnyway.includes(n),
      );
      if (missedWrites.length > 0) {
        fail(
          "SELF-TEST FAILED - with the colleague granted EDITOR outright, the two-seat probe " +
            `still saw ${missedWrites.join(", ")} refuse her. Either those doors are broken for ` +
            "somebody who may, or the probe is not calling them - and then its green answer proves " +
            "nothing.",
        );
      }
      if (!redProbe.readAfterRevoke) {
        fail(
          "SELF-TEST FAILED - with the organization left at the shipped `all_records`, a member " +
            "with no share at all was still refused the read. Either the member lane is gone " +
            "entirely, or the probe is not calling custom.read_record.",
        );
      }
      console.log(
        "[ OK ] self-test - inverting the grant to editor and the organization to all_records, " +
          `the two-seat probe sees all ${redProbe.wroteAnyway.length} write door(s) take the ` +
          "write and the read go through. It can go red.",
      );

      // CENSUS 11, THE RED HALF. With trigger functions no longer exempt, every SECURITY
      // INVOKER trigger body in this schema that touches the store must be named. An empty
      // answer would mean the query is not reading the catalogue it claims to.
      const redInvoker = (await client.query<Row>(INVOKER_DOOR_CENSUS(false))).rows;
      if (redInvoker.length === 0) {
        fail(
          "SELF-TEST FAILED - with trigger functions no longer exempt, the SECURITY INVOKER " +
            "census named nothing at all. Schema `custom` is full of INVOKER trigger bodies " +
            "that touch custom.record, so an empty answer means it is not reading them.",
        );
      }
      console.log(
        `[ OK ] self-test - without the trigger exemption the SECURITY INVOKER census names ` +
          `${redInvoker.length} function(s). It can go red.`,
      );

      // CENSUS 12, THE RED HALF. The two states this really was in, each of which must produce
      // the kind of disagreement it caused: the RLS mirror before it learned
      // `custom/member_default_visibility`, and the screens the sixth pass photographed.
      for (const [pretend, kind, what] of [
        [
          "mirror_forgets_the_knob",
          "mirror-admits-more",
          "with `custom/member_default_visibility` taken back out of iam.entity_read_expr, the " +
            "policy text admits nobody the doors refuse",
        ],
        [
          "door_refuses_the_share",
          "doors-disagree",
          "with the read door refusing every row, it still agrees with the one ladder",
        ],
      ] as const) {
        await client.query("begin");
        let redShared: Row[];
        try {
          await client.query("set local statement_timeout = '900s'");
          redShared = (await client.query<Row>(SHARED_ONLY_CENSUS(pretend))).rows;
        } finally {
          await client.query("rollback").catch(() => undefined);
        }
        const rows = redShared.filter((r) => r.why?.startsWith(kind));
        if (rows.length === 0) {
          fail(
            `SELF-TEST FAILED - ${what}. Either every shared_only organization on this database ` +
              "has no member with anything shared, or the census is not comparing what it says it " +
              "compares - and then its zero above proves nothing.",
          );
        }
        console.log(
          `[ OK ] self-test - ${pretend}: the shared_only census names ${rows.length} ` +
            `${kind} row(s). It can go red.`,
        );
      }

      // CENSUS 13, THE RED HALF. The two-Home fixture with the ONE LINE this lane changed put
      // back: `custom.visible_set`'s whole-Table shortcut asking `custom.reaches_directly` about
      // the Table, which climbs from the Table into the Table's own HOMES. A viewer on Project X
      // then gets Project Y's records out of every list door while `custom.read_record` refuses
      // her. If this names nothing, the fixture is not the shape the defect lived in and the
      // zero above is zero about nothing.
      const redStrict = (await t10Probe(client, "shared_only", T10_PRETEND)).filter((r) =>
        r.why?.startsWith("doors-disagree"),
      );
      if (redStrict.length === 0) {
        fail(
          "SELF-TEST FAILED - with a Home of a Table read as the whole Table again, the list-door " +
            "census named no disagreement under `shared_only` in a fixture built exactly as " +
            "acceptance test 10 describes it: one Table, two Homes, one record in each, the " +
            "colleague shared ONE Home and nothing else. Either the fixture no longer builds that " +
            "shape, or the census is not calling the doors - and then its zero above proves nothing.",
        );
      }
      console.log(
        `[ OK ] self-test - a Home read as the whole Table: the list-door census names ` +
          `${redStrict.length} doors-disagree row(s) under shared_only. It can go red.`,
      );

      // AND IT IS RED ONLY WHERE THE DEFECT CAN EXIST. Under `all_records` the organization's
      // own membership default already admits every row at or above `internal` to every member,
      // so the whole-Table shortcut has nothing left to hand over and `custom.read_record` opens
      // the other Home's row too - the doors agree, wrongly-written line or not. Asserting that
      // pins the REASON the red above is red, so a future change that makes `all_records` leak
      // cannot hide behind "that setting never showed it". The GREEN half still runs both.
      const redOpen = (await t10Probe(client, "all_records", T10_PRETEND)).filter((r) =>
        r.why?.startsWith("doors-disagree"),
      );
      if (redOpen.length > 0) {
        fail(
          "SELF-TEST FAILED - under `all_records`, where every member already reaches every row " +
            `at or above internal, the old line produced ${redOpen.length} disagreement(s). Then ` +
            "the member lane is no longer admitting what it is documented to admit, and the " +
            "shared_only clause above is measuring something other than the Home-as-whole-Table " +
            "defect.",
        );
      }
      console.log(
        "[ OK ] self-test - under all_records the same old line produces no disagreement, which " +
          "is why the strict setting is where this defect lives.",
      );

      // CENSUS 16's RED HALF — a kernel body PLANTED, in a transaction that is always
      // rolled back. `iam.entity_read_kernel_fingerprint()` hashes `prosrc`, so one
      // comment line inside a body is the whole plant: the exact shape a lane produces
      // when it CREATE OR REPLACE's a kernel function and re-records nothing. If this
      // does not go red, census 16's green above is reading something that cannot move.
      await client.query("begin");
      try {
        await client.query("set local lock_timeout = '20s'");
        await client.query(`
          do $plant$
          declare v_def text; v_src text;
          begin
            select pg_get_functiondef(p.oid), p.prosrc into v_def, v_src
              from pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname = 'library_is_open'
             limit 1;
            if v_def is null then
              raise exception 'public.library_is_open is not on this database — census 16 cannot be proved red';
            end if;
            execute replace(v_def, v_src, v_src || E'\n  -- planted by check:store-doors-decide --self-test');
          end
          $plant$;`);
        const planted = (await client.query<Row>(KERNEL_FINGERPRINT_CENSUS)).rows;
        if (planted.length !== 1) {
          await client.query("rollback").catch(() => undefined);
          fail(
            "SELF-TEST FAILED - one access-kernel body (public.library_is_open) was replaced with " +
              `one comment line added and census 16 named ${planted.length} disagreement(s), not 1. ` +
              "Then the census is not comparing iam.entity_read_kernel_fingerprint() against the live " +
              "bodies, and its zero on the real run proves nothing.",
          );
        }
        console.log(`[ OK ] self-test - ${planted[0]!.why}`);
      } finally {
        await client.query("rollback").catch(() => undefined);
      }
      const healed = (await client.query<Row>(KERNEL_FINGERPRINT_CENSUS)).rows;
      if (healed.length !== 0) {
        fail(
          "SELF-TEST FAILED - the planted kernel body was rolled back and census 16 still names " +
            `${healed.length} disagreement(s). Either the plant escaped its transaction (it must not) ` +
            "or this database really is in the P2-00f state and every provision is being refused.",
        );
      }
      console.log(
        "[ OK ] self-test - after ROLLBACK the recorded fingerprint and the live bodies agree again.",
      );
    }

    const callers = (await client.query<Row>(CALLER_CENSUS(DECIDERS))).rows;
    const records = (await client.query<Row>(RECORD_CENSUS(DECIDERS))).rows;
    const grants = (await client.query<Row>(GRANT_CENSUS)).rows;
    const ladder = (await client.query<Row>(ONE_LADDER_CENSUS)).rows;
    const declaredLadder = (await client.query<Row>(DECLARED_LADDER_CENSUS(LADDER_RUNGS))).rows;
    const declaredSwitch = (await client.query<Row>(DECLARED_SWITCH_CENSUS(true))).rows;
    const tablePrivileges = (await client.query<Row>(TABLE_PRIVILEGE_CENSUS)).rows;
    const closedSchemas = (await client.query<Row>(CLOSED_SCHEMA_CENSUS(true))).rows;
    const rendering = (await client.query<Row>(IDENTITY_RENDERING_CENSUS)).rows;
    const invokerDoors = (await client.query<Row>(INVOKER_DOOR_CENSUS(true))).rows;
    const refusals = (await client.query<Row>(REFUSAL_CENSUS)).rows;

    // CENSUS 12 — the three answers, live, in every organization that has said `shared_only`.
    // `mirror-admits-less` is a failure only when census 7 is non-empty, so the two are read
    // together rather than one of them excusing the other in prose.
    // 🚨 IT SAYS ITS OWN CLOCK, INSIDE A TRANSACTION. This connection reaches the database
    // through the TRANSACTION pooler, where a bare `SET` is not guaranteed to still be on the
    // same server connection when the next statement runs — `set local` inside an explicit
    // transaction is the only form that holds. Without it this census ran under the role's
    // 30 s default and died as a CRASH rather than returning a verdict, which is what
    // `[FAIL] canceling statement due to statement timeout` looked like on 2026-09-20.
    const mark12 = Date.now();
    const unmeasured: string[] = [];
    const census12 = await censusWithPatience<Row>(
      client,
      "census 12 (the three answers in every shared_only organization)",
      SHARED_ONLY_CENSUS(null),
    );
    const sharedOnlyAll: Row[] = census12.rows;
    if (census12.unmeasured) unmeasured.push(census12.unmeasured);
    console.log(`[TIME] census 12 - the three answers in every shared_only organization: ${since(mark12)}`);
    const mirrorNarrower = sharedOnlyAll.filter((r) => r.why?.startsWith("mirror-admits-less"));
    const sharedOnly = sharedOnlyAll.filter(
      (r) =>
        SHARED_ONLY_NEVER.some((kind) => r.why?.startsWith(kind)) ||
        (tablePrivileges.length > 0 && r.why?.startsWith("mirror-admits-less")),
    );
    if (mirrorNarrower.length > 0 && tablePrivileges.length === 0) {
      console.log(
        `[INFO] ${mirrorNarrower.length} row(s) the store's doors admit through an arm above the ` +
          "platform kernel the RLS mirror is generated from. Not a failure: census 7 is empty, so " +
          "no policy built from that text decides a read. It becomes a failure the moment it is not.",
      );
    }

    // CENSUS 13 — every list-shaped door against `custom.read_record`, per (member, record),
    // live, in every organization the store is open in, under BOTH privacy settings. Then the
    // shape no live organization has: one Table in two Homes, built through the product's own
    // doors, censused at each setting, rolled back.
    // It CALLS every door for every (member, record) rather than reading a predicate, so it is
    // the slowest census here — ~57 s over the whole database today, against a server default
    // that is shorter. 🚨 IT SAYS SO INSIDE A TRANSACTION: this connection reaches the database
    // through the TRANSACTION pooler, where a bare `SET` is not guaranteed to still be on the
    // same server connection when the next statement runs — `set local` inside an explicit
    // transaction is the only form that holds. A census that dies on the clock reads as a crash
    // rather than as a verdict.
    const mark13 = Date.now();
    await client.query("begin");
    let listDoors: Row[];
    try {
      await client.query("set local statement_timeout = '900s'");
      listDoors = (await client.query<Row>(LIST_DOOR_CENSUS(null, null, exhaustive))).rows;
    } finally {
      await client.query("rollback").catch(() => undefined);
    }
    listDoors = [
      ...listDoors,
      ...(await t10Probe(client, "shared_only", null, exhaustive)),
      ...(await t10Probe(client, "all_records", null, exhaustive)),
    ];
    console.log(
      `[TIME] census 13 - every list-shaped door against custom.read_record` +
        `${exhaustive ? " (--exhaustive: the doors themselves, every row)" : ""}: ${since(mark13)}`,
    );

    // CENSUS 10 — the two seats, live, in a transaction that is always rolled back.
    const probe = await twoSeatProbe(client, "viewer", "shared_only");
    const twoSeat: Row[] = [
      ...probe.wroteAnyway.map((name) => ({
        function_name: name.replace(/^custom\./, ""),
        identity_args: "shared at viewer",
        why: "a person shared at VIEWER was allowed to write through this door - the Share dialog, "
          + "the Access tab and custom.share_access all say viewer, so the door has to as well",
      })),
      ...(probe.readAfterRevoke
        ? [{
            function_name: "read_record",
            identity_args: "share revoked",
            why: "the share was revoked and the record still opened for her, in an organization "
              + "whose custom/member_default_visibility is shared_only - a revoke that does not "
              + "take effect on the next call is not a revoke",
          }]
        : []),
    ];

    // CENSUS 14 AND 15 — THE ONE LADDER PLANS ONCE (lane LADDER-PERF, 2026-09-20).
    //
    // A door that decides on the one ladder is only as good as what the ladder costs, and the
    // ladder cost TEN TIMES the kernel it wraps for one reason: nothing in it kept a plan.
    // A non-inlined SQL-language function re-plans its body on EVERY CALL (its plan cache lives
    // for the calling query), and plpgsql's `EXECUTE` never caches one at all — so a question
    // about one (member, record) planned a sixteen-partition Append over `custom.record` half a
    // dozen times. Measured: 16.5 ms a call against 1.5 ms for `iam.has_access_for`, and
    // 7.24 ms -> 1.36 ms on `custom.carrying_edges_of` from moving the identical body into
    // plpgsql. These two censuses are what keep it closed: the first walks the ladder's own
    // call graph, the second says every PARTITIONED entity table still has its generated,
    // plan-cached row probe.
    const mark14 = Date.now();
    const replanners = (
      await client.query<Row>(
        `select f.fn as function_name, f.lang as identity_args, f.why || ' ' || f.remedy as why
           from custom.ladder_replanners() f order by f.fn`,
      )
    ).rows;
    const staleProbes = (
      await client.query<Row>(
        `select s.what as function_name, 'generated probe' as identity_args,
                s.detail || ' ' || s.remedy as why
           from platform.static_row_probes_stale() s order by s.what`,
      )
    ).rows;
    console.log(`[TIME] censuses 14+15 - the ladder plans once: ${since(mark14)}`);

    // CENSUS 16 — the live kernel bodies against the recorded fingerprint.
    const mark16 = Date.now();
    const kernelDrift = (await client.query<Row>(KERNEL_FINGERPRINT_CENSUS)).rows;
    console.log(`[TIME] census 16 - the kernel fingerprint against the live bodies: ${since(mark16)}`);

    const ok = [
      report("client doors taking an organization id that never decide the caller", callers),
      report("client doors that write a record without deciding that row", records),
      report("declared doors whose grant or signature does not match the live catalog", grants),
      report("doors deciding a row with a ladder of their own instead of the one function", ladder),
      report("declared client doors whose body never goes through the one ladder", declaredLadder),
      report("declared client doors that write a record without asking the store's switch", declaredSwitch),
      report("client roles holding a TABLE privilege in schema custom", tablePrivileges),
      report(
        "functions a client may execute in a declared-closed schema with no door row at all",
        closedSchemas,
        true,
      ),
      report("door rows whose stored signature is not what the catalog renders", rendering, true),
      report(
        "client-executable functions in schema custom that are SECURITY INVOKER",
        invokerDoors,
      ),
      report(
        "doors that took a write from somebody shared at viewer, or showed a revoked person the record",
        twoSeat,
      ),
      report(
        "shared_only organizations where the one ladder, the read door and the RLS policy text do not agree",
        sharedOnly,
      ),
      report(
        "(member, record) pairs a list-shaped door answers differently from custom.read_record",
        listDoors,
        true,
      ),
      report(
        "doors that refuse by telling the caller they may read a record the door never asked about",
        refusals,
      ),
      report(
        "functions the one ladder reaches that re-plan their body on every call",
        replanners,
        true,
      ),
      report(
        "partitioned entity or registry tables with no current plan-cached row probe",
        staleProbes,
        true,
      ),
      report(
        "the recorded access-kernel fingerprint disagreeing with the live kernel bodies",
        kernelDrift,
        true,
      ),
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
      // exitAfterDrain returns `never` (it always calls process.exit), so the `return`
      // that used to follow it here was unreachable — TS7027 caught it as dead code.
      exitAfterDrain(1);
    }
    if (unmeasured.length > 0) {
      // NOT a door being wrong, and NOT a clean run. Its own exit code (2), so a caller can
      // tell "something in the store is wrong" from "we could not look".
      console.error(
        `\n[NOT MEASURED - contention] ${unmeasured.length} census(es) could not be read:\n` +
          unmeasured.map((line) => `  - ${line}`).join("\n") +
          "\n  Every OTHER census above is green. This run proves nothing about the unmeasured" +
          "\n  one - it is not a pass - and it is not a door that decides nothing either. Run it" +
          "\n  again when the database is quieter.",
      );
      exitAfterDrain(2);
    }
    console.log(
      `\nEvery client door into the record store decides the caller and the row. (${since(started)})`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main();
