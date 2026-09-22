-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- SUITES-TIDY-2 — A REFUSAL NAMES THE DOOR THE PERSON CALLED, AND A CENSUS SAYS SO FOR EVER.
--
-- THE DEFECT, as lane SUITES-TIDY reported it against `doorsdecide3_green.sql`:
-- `custom.portals` was a one-line wrapper — `return query select * from
-- custom.list_portals(p_organization_id, 'active')` — and the wall it borrowed lives inside
-- `custom.list_portals`, which names ITSELF. So a person who called `custom.portals` was told
--
--     "You are not a member of that organization, so custom.list_portals has nothing to do there."
--
-- — a function she never called, cannot execute, and has no way to look up. DOORS-DECIDE-3 fixed
-- that ONE door on 2026-09-22 07:58Z (`doorsdecide3_two_doors_ask_the_wall_in_their_own_body.sql`)
-- by giving it the assert under its own name. THIS FILE CLOSES THE CLASS.
--
-- THE CENSUS OF THE SIBLINGS, run against the live catalogue of the main database 2026-09-22:
-- every client-executable function in schema `custom` was read for both halves of the defect —
-- a door that hands a LITERAL door name to the organization wall which is not its own, and a
-- door that names itself to NO custom.assert_* at all and delegates the decision to a sibling
-- that does. After DOORS-DECIDE-3 the answer is ZERO on both arms. What is left is this census,
-- so the class cannot come back the next time somebody writes a convenience wrapper.
--
-- WHAT IT ACCEPTS, AND WHY EACH ONE IS NOT THE DEFECT:
--   * BOTH SPELLINGS of a door's own name. Five share doors say `'share_grant'` where the rest
--     of the store says `'custom.share_grant'`. Through PostgREST the person called `share_grant`,
--     so that sentence names the door she actually knocked on; it is an inconsistency of house
--     style, not a refusal pointing at a stranger, and rewriting five live bodies to tidy a
--     prefix is not worth a body replacement.
--   * A DOOR-NAME PARAMETER. A helper handed `p_door` by its caller is asserting under the OUTER
--     door's name, which is the correct answer to this whole question (`custom.page_size`,
--     `custom.dashboard_block_normalize`).
--   * A DOOR WITH NO ORGANIZATION ARGUMENT. `custom.portal_invite_accept(p_token)` and
--     `custom.realtime_topic_admits(p_topic)` resolve the organization from what they are handed;
--     there is no organization to assert against on their first line, so the arm does not apply.
--   * STRING LITERALS, in arm B. The delegate scan reads CODE, not prose: every quoted string is
--     blanked first, so a hint that mentions another door by name (as `custom.page_size`'s
--     does) can never be read as a call to it.
--
-- PROVED RED THEN GREEN, 2026-09-22, on the nightly dev clone: with `custom.portals`'s
-- pre-DOORS-DECIDE-3 body planted inside a rolled-back transaction the census names
-- `portals … delegates to custom.list_portals, whose refusal names a door the person never
-- called`; with the landed body it names nothing.
--
-- This file adds ONE function and touches no table, column, grant, door row, kernel row or
-- existing body. The inverse is `drop function custom.doors_refusing_in_another_doors_name()`.

-- A NEW function, not a replacement: nothing on this database is called this, so there
-- is no live body to declare a `-- based-on:` hash for. `CREATE FUNCTION` (not OR REPLACE)
-- is what says that, and the additive judge reads it that way.
CREATE FUNCTION custom.doors_refusing_in_another_doors_name()
 RETURNS TABLE(function_name text, identity_args text, why text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with body as (
    select p.proname::text as nm,
           pg_get_function_identity_arguments(p.oid) as args,
           -- THE CODE, NOT THE PROSE: `--` comments are stripped, so a comment quoting the old
           -- sentence can never fail this census and a comment promising the fix can never
           -- pass it.
           regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g') as src,
           -- ARM B READS CODE WITH EVERY STRING LITERAL BLANKED, so a hint that names another
           -- door in prose is not mistaken for a call to it.
           regexp_replace(
             regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g'),
             '''[^'']*''', '''''', 'g') as code,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as client
      from pg_proc p
     where p.pronamespace = 'custom'::regnamespace
       and p.prokind = 'f'
  ),
  -- A DOOR NAMES ITSELF when some custom.assert_* call in its body carries its own name —
  -- either spelling — or carries the door-name parameter its caller handed it.
  namer as (
    select nm from body
     where src ~ ('custom\.assert_[a-z_]+\s*\([^;]*''(custom\.)?' || nm || '''')
        or src ~ 'custom\.assert_[a-z_]+\s*\([^;]*\mp_door\M'
  )
  -- ARM A — the wall is asked under a name that is not this door's, in either spelling.
  select nm, args,
         ('asks the organization wall under the name ' || quote_literal(m[1]) ||
          ', so a person who called custom.' || nm || ' is refused in the name of something else')::text
    from body,
         lateral regexp_matches(src, 'custom\.assert_client_may_reach\s*\(\s*[^,()]+,\s*''([^'']+)''', 'g') m
   where client and m[1] <> 'custom.' || nm and m[1] <> nm
  union all
  -- ARM B — the door never names itself at all and hands the decision to a sibling that does.
  -- This is exactly the custom.portals shape.
  select b.nm, b.args,
         ('never names itself to any custom.assert_* and delegates to custom.' || d.nm ||
          ', whose refusal names a door the person never called')::text
    from body b
    join lateral (select n.nm from namer n
                   where b.code ~ ('custom\.' || n.nm || '\s*\(') and n.nm <> b.nm
                   limit 1) d on true
   where b.client
     and b.nm not in (select nm from namer)
     and b.args ~ '\mp_organization_id uuid\M'
  order by 1, 3;
$function$;

comment on function custom.doors_refusing_in_another_doors_name() is
  'DOOR REFUSALS: every client-executable door in schema custom whose refusal would name a function the person never called — either because it hands the organization wall a literal that is not its own name, or because it names itself to no custom.assert_* at all and borrows the decision from a sibling that does. SUITES-TIDY-2, 2026-09-22, after custom.portals refused a caller in custom.list_portals'' name. Zero rows is the contract.';
