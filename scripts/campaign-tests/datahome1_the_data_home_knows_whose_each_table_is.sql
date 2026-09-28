-- LANE DATA-HOME-1 — THE DATA HOME KNOWS WHOSE EACH TABLE IS.
--
-- THE REAL USE CASE (admin@admin.com, the data home at /data-v2, 2026-09-27): the owner of Cedar
-- Ridge Physical Therapy opens the data home and presses Mine. It must show every table she MADE,
-- in every one of her organizations — not 0 because the home opened on one organization.
--
-- What must hold, from her seat:
--   A. custom.data_home_tables() answers exactly the tables custom.tables_i_can_open() answers
--      (the same walk) PLUS the tables the app keeps, in under 2 s;
--   E. every table the app keeps says a kind other than "table", every other says "table"
--      (Arman 21:40 PT: the home hides nothing, and says what each thing is);
--   B. mine is true exactly where the Table record's created_by is her;
--   C. shared_with_me is true exactly where a live grant names her and somebody else gave it;
--   D. the knobs custom.data_home_default_scope and custom.data_home_default_kind default to "all".
--
-- RUN IT (clone or production; always rolled back):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/datahome1_the_data_home_knows_whose_each_table_is.sql
-- ITS RED: before the campaign files the function and the knob do not exist (A and D fail).

\set ON_ERROR_STOP on
\timing off

\set suite 'datahome1_the_data_home_knows_whose_each_table_is.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);

select to_regprocedure('custom.data_home_tables()') is not null as door_exists \gset
\if :door_exists
\else
  \echo 'A FAILED: custom.data_home_tables() does not exist'
  \echo 'RED'
  rollback;
  \quit 3
\endif

select clock_timestamp() as t0 \gset
create temp table _home on commit drop as select * from custom.data_home_tables();
select extract(milliseconds from clock_timestamp() - :'t0'::timestamptz) as ms \gset
create temp table _open on commit drop as select * from custom.tables_i_can_open();

do $$
declare
  v_me   uuid := (select id from auth.users where email = 'admin@admin.com');
  v_diff int;
  v_knob jsonb;
begin
  select count(*) into v_diff from (
    ((select table_id from _home where not kept_by_the_app) except (select table_id from _open))
    union all
    ((select table_id from _open) except (select table_id from _home where not kept_by_the_app))) d;
  if v_diff <> 0 then
    raise exception 'A FAILED: the home and tables_i_can_open disagree on % table(s)', v_diff;
  end if;
  raise notice 'A passed: % tables, the same walk, plus % the app keeps',
    (select count(*) from _home where not kept_by_the_app), (select count(*) from _home where kept_by_the_app);

  select count(*) into v_diff from _home
   where (kept_by_the_app and kind = 'table') or (not kept_by_the_app and kind <> 'table') or kind is null;
  if v_diff <> 0 then
    raise exception 'E FAILED: % row(s) name the wrong kind', v_diff;
  end if;
  raise notice 'E passed: kinds %', (select string_agg(distinct kind, ', ') from _home);

  select count(*) into v_diff
    from _home h join custom.record t on t.id = h.table_id
   where h.mine is distinct from (t.created_by = v_me);
  if v_diff <> 0 then
    raise exception 'B FAILED: % row(s) say mine where created_by says otherwise', v_diff;
  end if;
  raise notice 'B passed: % of them are hers', (select count(*) from _home where mine);

  select count(*) into v_diff
    from _home h
   where h.shared_with_me is distinct from exists (
     select 1 from iam.permissions g
      where g.resource_type = 'record' and g.resource_id = h.table_id
        and g.granted_to_user_id = v_me and g.status = 'active'
        and (g.expires_at is null or g.expires_at > now())
        and g.created_by is distinct from v_me);
  if v_diff <> 0 then
    raise exception 'C FAILED: % row(s) disagree with her live grants', v_diff;
  end if;
  raise notice 'C passed: % shared with her', (select count(*) from _home where shared_with_me);

  select default_value into v_knob from platform.feature_knob
   where feature = 'custom' and key = 'data_home_default_scope';
  if v_knob is distinct from '"all"'::jsonb then
    raise exception 'D FAILED: custom.data_home_default_scope default is %, not "all"', coalesce(v_knob::text, 'absent');
  end if;
  select default_value into v_knob from platform.feature_knob
   where feature = 'custom' and key = 'data_home_default_kind';
  if v_knob is distinct from '"all"'::jsonb then
    raise exception 'D FAILED: custom.data_home_default_kind default is %, not "all"', coalesce(v_knob::text, 'absent');
  end if;
  raise notice 'D passed: the home opens on All, every kind';
end $$;

select case when :ms < 2000 then 'A timing passed: ' || round(:ms) || ' ms'
            else 'A FAILED: ' || round(:ms) || ' ms' end as verdict \gset
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
