-- LANE HANDOVER — "ALL MY ORGANIZATIONS" ANSWERS IN ONE QUERY.
--
-- THE REAL USE CASE (admin@admin.com, the data home at /data, 2026-09-27): the owner of Cedar
-- Ridge Physical Therapy presses "All my organizations" to see every table she can open. She belongs
-- to 46 organizations. The door `custom.tables_i_can_open()` answered 500: its body ran one query per
-- organization and took 11.8 s, over the 8 s a signed-in request may run.
--
-- What must hold, from her seat:
--   A. the door answers inside the 8 s a request may run (it must take under 2 s here; the old body took 2.9 s on the idle clone and 11.8 s on production);
--   B. it answers exactly the rows the per-organization rule gives: every table of an organization
--      she is admitted to whose store is open, visible to her, not platform-owned.
--
-- RUN IT (clone or production; always rolled back):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/handover_all_my_organizations_answers_in_one_query.sql
-- ITS RED: on the body before the campaign file it fails at A (11.8 s on production, 2026-09-27).

\set ON_ERROR_STOP on
\timing off

\set suite 'handover_all_my_organizations_answers_in_one_query.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);

select clock_timestamp() as t0 \gset
create temp table _answer on commit drop as
  select * from custom.tables_i_can_open();
select extract(milliseconds from clock_timestamp() - :'t0'::timestamptz) as ms \gset

do $$
declare
  v_me     uuid := (select id from auth.users where email = 'admin@admin.com');
  v_kernel uuid := custom.table_kernel_id();
  v_want   int;
  v_got    int;
  v_diff   int;
begin
  -- B: the per-organization rule, asked organization by organization.
  create temp table _want on commit drop as
    select t.id
      from (select o.id from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me) o
      join custom.record t on t.organization_id = o.id and t.table_id = v_kernel and t.deleted_at is null
     where (iam.has_org_access(o.id) or custom.portal_admits(o.id))
       and custom.store_is_open(o.id)
       and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
       and t.id in (select v from custom.query_visible_ids(o.id, v_kernel) v);
  select count(*) into v_want from _want;
  select count(*) into v_got from _answer where member;
  select count(*) into v_diff from ((select id from _want) except (select table_id from _answer where member)) d;
  if v_got <> v_want or v_diff <> 0 then
    raise exception 'B FAILED: the door answered % member tables, the rule gives % (% missing)', v_got, v_want, v_diff;
  end if;
  raise notice 'B passed: % member tables, exactly the rule''s', v_got;
  -- C: an organization she is not in lists exactly the tables shared with her there.
  select count(*) into v_diff from (
    (select g.resource_id from iam.permissions g
       join custom.record t on t.id = g.resource_id and t.table_id = v_kernel and t.deleted_at is null
       join iam.organizations o on o.id = t.organization_id and o.archived_at is null
      where g.resource_type = 'record' and g.granted_to_user_id = v_me and g.status = 'active'
        and (g.expires_at is null or g.expires_at > now())
        and not coalesce((t.data ->> 'kept_by_the_app')::boolean, false)
        and not exists (select 1 from iam.organization_member m2 where m2.organization_id = o.id and m2.user_id = v_me))
    except (select table_id from _answer where not member)) d;
  if v_diff <> 0 then
    raise exception 'C FAILED: % table(s) shared with her in an organization she is not in are missing', v_diff;
  end if;
  raise notice 'C passed: % shared table(s) in organizations she is not in', (select count(*) from _answer where not member);
end $$;

select case when :ms < 2000 then 'A passed: ' || round(:ms) || ' ms'
            else 'A FAILED: ' || round(:ms) || ' ms (a signed-in request may run 8 s; the one-query body answers in under 1)' end as verdict \gset
\echo :verdict
select (:ms < 2000) as a_ok \gset
\if :a_ok
\else
  \echo 'RED'
  rollback;
  \quit 3
\endif
rollback;
\echo 'GREEN'
