-- STORE-ASOF (4 of 4) — THE CUTOVER DIFF TELLS THE TRUTH ABOUT ITS OWN DEPTH,
-- AND A PERSON CAN RUN IT (T1, rules 2 and 9).
--
-- T1 passed on the fourth pass WITH A STATED BLIND SPOT, and the blind spot was stated by the
-- verifier rather than by the tool: `custom.visibility_parity` excused every derived row deeper
-- than 8 with the reason `beyond_stored_ceiling`, and 8 was a LITERAL in the body. The deepest
-- path either side actually holds is 3 (`max(depth)` over `platform.reachability`, measured on
-- the main database 2026-09-19), so the diff was green above 8 only because both sides were
-- empty there — and it would have stayed green if a real path at depth 9 had appeared on one
-- side and not the other. A diff that can only be trusted by a person who has read its source
-- is not a cutover gate.
--
-- The second half: *"a person cannot run it"*. `custom.visibility_parity()` is SECURITY DEFINER
-- over `platform.reachability` and `custom.carrying_edges` for the WHOLE PLATFORM, so it is
-- rightly not something a signed-in caller may execute; the fourth pass got `permission denied
-- for function derive_visibility` and stopped. But the question it answers — "does what this
-- organization can see still match what the stored form says" — is an organization admin's
-- question about their own organization, and there was no door for it at all.
--
-- WHAT THIS FILE LANDS
--
--   · `custom.visibility_parity()` keeps its exact shape and every existing difference class,
--     and stops lying about depth:
--       - the ceiling it compares against is MEASURED (`max(depth)` over the stored closure),
--         never a literal, and the reason says the number it used;
--       - a derived row deeper than that ceiling is still reported as a DIFFERENCE, with the
--         depth on it, instead of being excused;
--       - two rows are always returned: `depth_measured`, naming the deepest derived path and
--         the deepest stored path, so the run states its own reach; and, when the walk actually
--         reached its 16-hop limit with edges still unfollowed, `depth_exceeded` — a row in the
--         result, so a caller that counts differences FAILS rather than passing blind. REC-N-4's
--         16 is the walk's limit and is not raised here: a real path that long is a finding, and
--         the finding is now reported instead of swallowed.
--
--   · `custom.query_visibility_parity(p_organization_id)` — the same diff, for ONE organization,
--     reachable by an owner or admin of it. It goes through the one ladder
--     (`custom.assert_client_may_reach`) and then the same audit threshold
--     `custom.visibility_as_of` uses, scopes every row to records of that organization, and
--     caps its own runtime at 20 seconds inside the function, so a person clicking it can never
--     be the reason somebody else's transaction waits. The set-based body finishes the whole
--     platform in ~260 ms (lane VIS-FIX, 2026-09-19), so one organization is far inside that.
--     It is reached by a declared door row and `custom.reopen_declared_doors()`, never a raw
--     GRANT.
--
-- ADDITIVE: one CREATE OR REPLACE of a campaign function, one new function, one new door row.
-- Nothing is dropped and nothing is revoked.
--
-- INVERSE: migrations/inverse/asof_the_cutover_diff_is_honest_and_a_person_can_run_it_down.sql

-- based-on: custom.visibility_parity() 641cdaceabafd912b7795dfe7c594cde19bd48a3d58bba97b2bb1d13ca7b2996

set lock_timeout = '5s';
set statement_timeout = '300s';

create or replace function custom.visibility_parity()
returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
              stored_level public.permission_level, derived_level public.permission_level, reason text)
language sql
stable
security definer
set search_path to ''
as $fn$
  with recursive edges as materialized (
    select e.container_type, e.container_id, e.item_type, e.item_id, e.conveys_max
      from custom.carrying_edges e
  ), roots as (
    select distinct r.container_type as ct, r.container_id as ci from platform.reachability r
  ), walk as (
    select r.ct as root_type, r.ci as root_id, e.item_type, e.item_id,
           1 as depth, e.conveys_max as max_level,
           array[r.ct || ':' || r.ci::text, e.item_type || ':' || e.item_id::text] as path
      from roots r
      join edges e on e.container_type = r.ct and e.container_id = r.ci
    union all
    select w.root_type, w.root_id, e.item_type, e.item_id, w.depth + 1,
           least(w.max_level, e.conveys_max),                                 -- VIS-3
           w.path || (e.item_type || ':' || e.item_id::text)
      from walk w
      join edges e on e.container_type = w.item_type and e.container_id = w.item_id
     where w.depth < 16                                                       -- REC-N-4
       and not (e.item_type || ':' || e.item_id::text) = any (w.path)         -- VIS-4
  ), derived as (
    select w.root_type as container_type, w.root_id as container_id, w.item_type, w.item_id,
           min(w.depth) as depth, max(w.max_level) as max_level               -- VIS-2
      from walk w
     group by 1, 2, 3, 4
  ), measured as (
    -- THE CEILING IS MEASURED, NEVER A LITERAL. `stored_max` is how deep the stored closure
    -- actually goes; `derived_max` is how deep this run walked. Both are reported below.
    select (select coalesce(max(r.depth), 0) from platform.reachability r) as stored_max,
           (select coalesce(max(d.depth), 0) from derived d)               as derived_max
  ), at_the_limit as (
    -- A REAL PATH THAT REACHED THE WALK'S LIMIT WITH SOMEWHERE LEFT TO GO. If this is not
    -- empty, everything below depth 16 is unmeasured and the run must say so rather than
    -- return green.
    select count(*) as n
      from walk w
      join edges e on e.container_type = w.item_type and e.container_id = w.item_id
     where w.depth = 16
       and not (e.item_type || ':' || e.item_id::text) = any (w.path)
  )
  select 'cache_only', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, null::public.permission_level, 'stored row the associations do not produce'
  from platform.reachability r
  left join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.item_id is null
  union all
  select 'level_differs', r.container_type, r.container_id, r.item_type, r.item_id,
         r.max_level, d.max_level, 'same pair, different level'
  from platform.reachability r
  join derived d
    on  d.container_type = r.container_type and d.container_id = r.container_id
    and d.item_type = r.item_type and d.item_id = r.item_id
  where d.max_level is distinct from r.max_level
  union all
  select 'derived_only', d.container_type, d.container_id, d.item_type, d.item_id,
         null::public.permission_level, d.max_level,
         format('derived row the stored closure does not hold (depth %s; the deepest path the stored closure holds anywhere is %s)',
                d.depth, m.stored_max)
  from derived d
  cross join measured m
  left join platform.reachability r
    on  r.container_type = d.container_type and r.container_id = d.container_id
    and r.item_type = d.item_type and r.item_id = d.item_id
  where r.item_id is null
  union all
  -- THE RUN STATES ITS OWN REACH. Always one row, never a difference on its own.
  select 'depth_measured', null, null, null, null, null, null,
         format('deepest derived path measured: %s; deepest stored path: %s; the walk''s own limit is 16 hops (REC-N-4)',
                m.derived_max, m.stored_max)
  from measured m
  union all
  -- AND WHEN IT COULD NOT REACH FAR ENOUGH, THAT IS A DIFFERENCE. Returned as a row so a
  -- caller counting differences fails instead of passing blind.
  select 'depth_exceeded', null, null, null, null, null, null,
         format('%s edge(s) leave a path that had already used all 16 hops, so anything beyond depth 16 is UNMEASURED and this comparison is not a clean bill of health. Raise the walk limit in custom.visibility_parity and re-run, or shorten the containment chain.',
                l.n)
  from at_the_limit l
  where l.n > 0;
$fn$;

comment on function custom.visibility_parity() is
  'T1: the cutover diff between the stored closure and what the associations derive. Its depth ceiling is measured rather than assumed, it reports the deepest path it actually walked, and a path that outruns the walk comes back as a difference rather than as silence.';

-- ═══════════════ THE SAME DIFF, FOR ONE ORGANIZATION, BY SOMEBODY WHO RUNS ONE
create or replace function custom.query_visibility_parity(p_organization_id uuid)
returns table(side text, container_type text, container_id uuid, item_type text, item_id uuid,
              stored_level public.permission_level, derived_level public.permission_level, reason text)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_me uuid := custom.query_principal();
begin
  -- THE WALL, on the one ladder, before anything is read.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_visibility_parity');
  -- Then the same audit threshold `custom.visibility_as_of` applies: a cutover diff names
  -- records across the whole organization, so it is an owner's or an admin's question.
  if not (custom.query_is_store_owner()
          or (v_me is not null and public.is_org_admin_for(v_me, p_organization_id))) then
    raise exception 'Only an owner or admin of this organization can compare what it can see against the stored form.'
      using errcode = '42501',
            hint = 'T1: this answers about every record in the organization at once. A member can ask what THEY can see (custom.query_can_see).';
  end if;

  -- A BOUNDED RUN, decided here rather than hoped for. The set-based body finishes the whole
  -- platform in about a quarter of a second; twenty seconds is a ceiling nothing healthy
  -- reaches, and a person clicking this is never the reason somebody else waits.
  set local statement_timeout = '20s';

  return query
    select p.side, p.container_type, p.container_id, p.item_type, p.item_id,
           p.stored_level, p.derived_level, p.reason
      from custom.visibility_parity() p
     where p.side in ('depth_measured', 'depth_exceeded')
        -- and every row that names a record of THIS organization, either end.
        or exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id
                      and (r.id = p.container_id or r.id = p.item_id));
end;
$fn$;

comment on function custom.query_visibility_parity(uuid) is
  'T1 / REC-9: the cutover diff for ONE organization, for an owner or admin of it. Same comparison as custom.visibility_parity, scoped to records of that organization, bounded at 20 seconds.';

-- THE DOOR, declared in data. The grant is a consequence of the row, never a decision of its
-- own: `platform.door_body_must_decide` refuses a row whose function does not decide, and
-- `custom.reopen_declared_doors()` makes the catalogue match the declaration.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', p.proname, pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), true, false,
       'migrations/campaign/asof_the_cutover_diff_is_honest_and_a_person_can_run_it.sql (lane STORE-ASOF)',
       'T1''s cutover diff for one organization. An owner or admin can check for themselves that what their organization can see still matches the stored form, instead of taking a builder''s word for it. It decides the organization wall on the one ladder and then the same audit threshold as custom.visibility_as_of, and bounds its own runtime.'
  from pg_proc p
 where p.pronamespace = 'custom'::regnamespace
   and p.proname = 'query_visibility_parity'
on conflict (schema_name, function_name, identity_argtypes) do nothing;

select custom.reopen_declared_doors();
