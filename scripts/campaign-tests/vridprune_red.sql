-- VRID-PRUNE — THE RED TWIN. Every claim vridprune_green.sql makes, made FALSE again, inside ONE
-- transaction that is ROLLED BACK. A guard you cannot show failing is not a guard.
--
--   R1  THE PRE-FIX BODY IS BACK (the bytes of the inverse, run with \i — which also proves the
--       inverse is valid SQL against this catalogue). The door still returns the full walk's ids —
--       the fix never changed an answer — but it asks custom.visible_set once for EVERY
--       (organization, Table) pair on the database: V2's claim is false. R1 is GREEN only when that
--       defect is present.
--   R2  A WRONG PRUNE IS PLANTED — "a person only sees her own organizations and the system ones",
--       the obvious shortcut, which forgets every other foothold (a row she created elsewhere, a
--       share, a carrying edge). V1's comparison against the full walk names the ids it loses.
--       R2 is GREEN only when V1's check catches it — which is what makes V1 the guard that says a
--       new ladder arm needs a wider organization set.
--
-- RUN IT exactly like the green suite (~2-3 min; the full walk runs twice on purpose):
--   psql "<dsn>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/vridprune_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'vridprune_red.sql'
\set requires 'function:custom.visible_record_ids'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '900s';
set local lock_timeout = '3s';
set local track_functions = 'all';

-- The knob is READ, never written (see vridprune_green.sql).
select coalesce(platform.knob_resolve('custom', 'accessible_entity_ids_guard', null)::text::boolean, false)
         as vrid_knob_on,
       (select u.id from auth.users u where u.email = 'test@test.com') as vrid_person
\gset
\if :vrid_knob_on
\else
  \echo 'vridprune_red.sql: SKIPPED — custom/accessible_entity_ids_guard resolves false'
  rollback;
  \quit
\endif
select set_config('vrid.person', coalesce(:'vrid_person', ''), true);

-- ══ THE ORACLE: the full walk (the same inline definition vridprune_green.sql uses).
do $oracle$
declare
  v_person uuid := nullif(current_setting('vrid.person'), '')::uuid;
  v_pair   record;
  v_pred   text;
  v_ids    uuid[] := '{}';
  v_more   uuid[];
  v_pairs  integer := 0;
begin
  if v_person is null then
    raise exception 'RED CANNOT RUN — test@test.com does not exist on this database';
  end if;
  for v_pair in
    select r.organization_id as org, r.table_id as tbl
      from custom.record r where r.deleted_at is null
     group by r.organization_id, r.table_id
  loop
    v_pairs := v_pairs + 1;
    v_pred := custom.visible_predicate_sql(v_person, v_pair.org, v_pair.tbl, 'viewer', 'r');
    execute format('select coalesce(array_agg(r.id), ''{}'') from custom.record r'
                   || ' where r.organization_id = %L::uuid and r.table_id is not distinct from %L::uuid'
                   || '   and r.deleted_at is null and (%s)', v_pair.org, v_pair.tbl, v_pred)
      into v_more;
    v_ids := v_ids || v_more;
  end loop;
  perform set_config('vrid.oracle', coalesce((select array_agg(distinct x order by x) from unnest(v_ids) x), '{}')::text, true),
          set_config('vrid.pairs', v_pairs::text, true);
  raise notice 'ORACLE — the full walk: % pairs, % ids', v_pairs, coalesce(array_length(v_ids, 1), 0);
end $oracle$;

-- ══ R1: THE PRE-FIX BODY, from the inverse's own bytes.
\i migrations/inverse/vridprune_a_person_is_asked_only_about_organizations_they_have_a_way_into_down.sql

select set_config('vrid.calls_before',
         coalesce((select calls from pg_stat_xact_user_functions
                    where schemaname = 'custom' and funcname = 'visible_set'), 0)::text, true);
select set_config('request.jwt.claims',
                  json_build_object('sub', :'vrid_person', 'role', 'authenticated')::text, true);
set local role authenticated;
select set_config('vrid.door',
         coalesce((select array_agg(distinct x order by x)
                     from unnest(iam.accessible_entity_ids('record', 'viewer', 0, true)) x), '{}')::text, true);
reset role;

do $r1$
declare
  v_pairs integer := current_setting('vrid.pairs')::integer;
  v_calls integer := coalesce((select calls from pg_stat_xact_user_functions
                                where schemaname = 'custom' and funcname = 'visible_set'), 0)
                     - current_setting('vrid.calls_before')::integer;
begin
  if current_setting('vrid.door') <> current_setting('vrid.oracle') then
    raise exception 'R1 BROKEN — the pre-fix body no longer returns the full walk; the oracle itself is wrong';
  end if;
  if v_calls < v_pairs then
    raise exception 'R1 NOT RED — with the pre-fix body back the door asked custom.visible_set only % times for % pairs; V2 would pass on the defect',
      v_calls, v_pairs;
  end if;
  raise notice 'R1 RED AS EXPECTED — the pre-fix body asks custom.visible_set % times for % pairs (V2 fails on it)',
    v_calls, v_pairs;
end $r1$;

-- ══ R2: A WRONG PRUNE — her own organizations and the system ones, nothing else.
CREATE OR REPLACE FUNCTION custom.visible_record_ids(p_user_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS TABLE(id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pair record;
  v_pred text;
begin
  if p_user_id is null then return; end if;
  for v_pair in
    select r.organization_id as org, r.table_id as tbl
      from custom.record r
     where r.deleted_at is null
       and (r.organization_id in (select om.organization_id from iam.organization_member om
                                   where om.user_id = p_user_id)
            or r.organization_id in (select so.organization_id from iam.system_orgs so))
     group by r.organization_id, r.table_id
  loop
    v_pred := custom.visible_predicate_sql(p_user_id, v_pair.org, v_pair.tbl, p_required, 'r');
    return query execute format(
      'select r.id from custom.record r where r.organization_id = %L::uuid'
      || ' and r.table_id is not distinct from %L::uuid and r.deleted_at is null and (%s)',
      v_pair.org, v_pair.tbl, v_pred);
  end loop;
end;
$function$;

set local role authenticated;
select set_config('vrid.door',
         coalesce((select array_agg(distinct x order by x)
                     from unnest(iam.accessible_entity_ids('record', 'viewer', 0, true)) x), '{}')::text, true);
reset role;

do $r2$
declare
  v_oracle uuid[] := current_setting('vrid.oracle')::uuid[];
  v_door   uuid[] := current_setting('vrid.door')::uuid[];
  v_lost   integer;
begin
  select count(*) into v_lost from (select unnest(v_oracle) except select unnest(v_door)) x;
  if v_lost = 0 then
    raise exception 'R2 NOT RED — a prune that forgets every foothold but membership lost nothing for test@test.com; V1 cannot tell a wrong prune from a right one with this person';
  end if;
  raise notice 'R2 RED AS EXPECTED — the wrong prune loses % of the full walk''s ids (V1 fails on it)', v_lost;
end $r2$;

rollback;
