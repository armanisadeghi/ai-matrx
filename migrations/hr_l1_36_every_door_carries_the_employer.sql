-- hr_l1_36_every_door_carries_the_employer.sql
--
-- Two failures in `hr.clock_state`, and one lesson about how I verified the first one.
--
-- 🚨 A THIRD DEAD DOOR SURVIVED hr_l1_34, AND MY OWN VERIFY IS WHY.
-- hr_l1_34 fixed the two doors I had actually READ, and its verify then asserted that
-- those two paths were absent. Asserting the absence of a string you already know about
-- proves nothing about the strings you never looked for. This function emits FOUR doors;
-- the `no_position_assignment` branch pointed at a self-service profile route that does
-- not exist, and it was dead the entire time. The verify below ENUMERATES every path the
-- function emits and checks each against the routes that exist, which is the only shape
-- of check that could have caught it.
--
-- 🚨 AND EVERY DOOR WAS ORG-LESS. HR is per-employer. A door with no `org` lands the
-- person on "Which employer?" instead of the thing they clicked — so even the live doors
-- were, in effect, doors to a chooser. All four now carry `v_em.organization_id`.
--
-- Proven live: the contractor's blocked state returns
--   /hr/me?tab=job&org=2643e470-…  → HTTP 200
-- and the route it replaced returns 404.
--
-- Applied live 2026-08-28 and ledgered. Run after hr_l1_34.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr.clock_state(uuid)'::regprocedure);
  if position('EVERY DOOR CARRIES THE EMPLOYER' in v_def) > 0 then
    raise notice 'hr_l1_36: already applied'; return;
  end if;

  v_new := replace(v_def,
$a1$        'door', '/hr/me/profile'));$a1$,
$r1$        -- 🚨 EVERY DOOR CARRIES THE EMPLOYER, AND EVERY DOOR IS A ROUTE THAT EXISTS.
        -- Two failures were live here at once. This branch pointed at a self-service
        -- profile route that was never built (404) — a THIRD dead door in this one
        -- function, which survived hr_l1_34 because that migration fixed the two doors
        -- I had actually read and never enumerated the rest. Checking that a path I
        -- already knew about was gone proved nothing about the ones I had not looked for.
        -- And every door here was org-less, so even the live ones dropped the employer
        -- and landed the person on "Which employer?" instead of the thing they clicked.
        -- HR is per-employer: a door without an org is a door to a chooser.
        'door', '/hr/me?tab=job&org=' || v_em.organization_id));$r1$);
  if v_new = v_def then raise exception 'hr_l1_36: profile door anchor not found'; end if;

  v_new := replace(v_new,
$a2$       'door', '/hr/me?tab=job'));$a2$,
$r2$       'door', '/hr/me?tab=job&org=' || v_em.organization_id));$r2$);
  v_new := replace(v_new,
$a3$        'door', '/hr/me?tab=job'));$a3$,
$r3$        'door', '/hr/me?tab=job&org=' || v_em.organization_id));$r3$);
  v_new := replace(v_new,
$a4$        'door', '/hr/settings/time-rules'));$a4$,
$r4$        'door', '/hr/settings/time-rules?org=' || v_em.organization_id));$r4$);

  execute v_new;
end $mig$;

-- 🚨 THE VERIFY ENUMERATES. This is the whole point of the migration.
do $verify$
declare v_src text; v_path text; v_live text[] := array['/hr/me', '/hr/settings/time-rules'];
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'clock_state';

  for v_path in
    select distinct split_part(split_part(m[1], '?', 1), '&', 1)
      from regexp_matches(v_src, '''(/hr[a-z0-9/?=_&|.-]*)''', 'g') m
  loop
    if not (v_path = any(v_live)) then
      raise exception 'hr_l1_36: clock_state emits %, which is not a route that exists', v_path;
    end if;
  end loop;

  if v_src !~ 'org='' \|\| v_em\.organization_id' then
    raise exception 'hr_l1_36: doors are not carrying the employer';
  end if;
  if v_src !~ 'Contractors do not clock in' then
    raise exception 'hr_l1_36: blocked message lost';
  end if;
end $verify$;

update hr.function_contract set is_active = false
 where function_name = 'clock_state' and home_migration = 'hr_l1_34_no_painted_on_doors.sql';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values ('hr', 'clock_state', 'hr_l1_36_every_door_carries_the_employer.sql',
        array['org='' || v_em.organization_id', 'Contractors do not clock in', '/hr/me?tab=job&org='],
        array['/hr/me/engagement', '/hr/me/employment', '/hr/me/profile'],
        'Every door this function emits must be a route that EXISTS and must carry the '
        || 'employer, or it lands the person on the employer chooser instead of the thing '
        || 'they clicked. The three paths in must_not_contain were never built. Supersedes '
        || 'the hr_l1_34 row, which listed only the two dead doors known at the time and so '
        || 'could not catch the third.')
on conflict do nothing;
