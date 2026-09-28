-- LANE DATA-HOME-2 — THE DATA HOME HONOURS ITS ORGANIZATION, IN THE DOOR.
--
-- THE REAL USE CASE (Arman, 2026-09-28 ~14:00 PT, live on www): with one organization chosen in the
-- data home's organization filter, the home still listed every organization. The door
-- custom.data_home_tables() took no organization, so no filter could reach it.
--
-- What must hold, from admin@admin.com's seat:
--   A. custom.data_home_tables(uuid) exists;
--   B. named ONE organization, the door answers exactly the rows the unnamed call answers for that
--      organization — every column, so every lane (Mine, My Orgs, Shared, Public) and every kind
--      agree — for EACH organization the unnamed call lists;
--   C. an organization the walk does not admit (an invented id) answers zero rows;
--   D. named nobody, the door answers what it always did (the call with no argument = named null);
--   E. the knob custom.data_home_default_organization defaults to "all" and has no organization or
--      user rung (switching the active organization must never change it);
--   F. custom.data_home_pages(org) — the forms and booking pages — answers, for EACH organization,
--      exactly what the store's own doors custom.forms(org) and custom.bookings(org) answer, each
--      row naming that organization; named nobody, it answers every organization's at once;
--   G. an organization the walk does not admit answers zero pages.
--
-- RUN IT (clone or production; always rolled back):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql
-- ITS RED: before datahome2_a/_b the one-argument door and the knob do not exist (A fails);
-- before datahome2_c the pages door does not exist (F fails).

\set ON_ERROR_STOP on
\timing off

\set suite 'datahome2_the_data_home_honors_its_organization.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);

select to_regprocedure('custom.data_home_tables(uuid)') is not null as door_exists \gset
\if :door_exists
\else
  \echo 'A FAILED: custom.data_home_tables(uuid) does not exist — the door takes no organization'
  \echo 'RED'
  rollback;
  \quit 3
\endif

select to_regprocedure('custom.data_home_pages(uuid)') is not null as pages_exist \gset
\if :pages_exist
\else
  \echo 'F FAILED: custom.data_home_pages(uuid) does not exist — forms and booking pages are one organization at a time'
  \echo 'RED'
  rollback;
  \quit 3
\endif

create temp table _all on commit drop as select * from custom.data_home_tables();

do $$
declare
  v_org   record;
  v_diff  int;
  v_orgs  int := 0;
  v_rows  int := 0;
  v_knob  record;
begin
  if (select count(distinct organization_id) from _all) < 2 then
    raise exception 'B CANNOT BE JUDGED: admin@admin.com lists tables in fewer than two organizations';
  end if;

  for v_org in select distinct organization_id as id from _all loop
    create temp table _one on commit drop as select * from custom.data_home_tables(v_org.id);
    select count(*) into v_diff from (
      ((select * from _one) except all (select * from _all where organization_id = v_org.id))
      union all
      ((select * from _all where organization_id = v_org.id) except all (select * from _one))) d;
    if v_diff <> 0 then
      raise exception 'B FAILED: organization % — the named door and the unnamed door disagree on % row(s)', v_org.id, v_diff;
    end if;
    select count(*) into v_diff from _one where organization_id <> v_org.id;
    if v_diff <> 0 then
      raise exception 'B FAILED: organization % — % row(s) from another organization', v_org.id, v_diff;
    end if;
    v_orgs := v_orgs + 1;
    v_rows := v_rows + (select count(*) from _one);
    drop table _one;
  end loop;
  raise notice 'B passed: % organizations, each named alone answers exactly its own % rows in total', v_orgs, v_rows;

  select count(*) into v_diff from custom.data_home_tables('00000000-0000-4000-8000-00000000dead'::uuid);
  if v_diff <> 0 then
    raise exception 'C FAILED: an organization nobody admits answered % row(s)', v_diff;
  end if;
  raise notice 'C passed: an organization the walk does not admit answers nothing';

  select count(*) into v_diff from (
    ((select * from _all) except all (select * from custom.data_home_tables(null)))
    union all
    ((select * from custom.data_home_tables(null)) except all (select * from _all))) d;
  if v_diff <> 0 then
    raise exception 'D FAILED: named nobody, the door disagrees with itself on % row(s)', v_diff;
  end if;
  raise notice 'D passed: named nobody, % rows across every organization', (select count(*) from _all);

  select default_value, overridable_by into v_knob from platform.feature_knob
   where feature = 'custom' and key = 'data_home_default_organization';
  if v_knob.default_value is distinct from '"all"'::jsonb then
    raise exception 'E FAILED: custom.data_home_default_organization default is %, not "all"', coalesce(v_knob.default_value::text, 'absent');
  end if;
  if coalesce(cardinality(v_knob.overridable_by), 0) <> 0 then
    raise exception 'E FAILED: custom.data_home_default_organization may be overridden at % — a rung keyed by the active organization', v_knob.overridable_by;
  end if;
  raise notice 'E passed: a new person opens on All Orgs, whatever organization is active';

  create temp table _pages on commit drop as select * from custom.data_home_pages();
  v_orgs := 0; v_rows := 0;
  for v_org in select distinct organization_id as id from _all loop
    select count(*) into v_diff from (
      ((select p.kind, p.page_id, p.page_row from custom.data_home_pages(v_org.id) p)
        except all
       (select 'form', f.form_id, to_jsonb(f) from custom.forms(v_org.id) f
        union all
        select 'booking', b.form_id, to_jsonb(b) from custom.bookings(v_org.id) b))
      union all
      ((select 'form', f.form_id, to_jsonb(f) from custom.forms(v_org.id) f
        union all
        select 'booking', b.form_id, to_jsonb(b) from custom.bookings(v_org.id) b)
        except all
       (select p.kind, p.page_id, p.page_row from custom.data_home_pages(v_org.id) p))) d;
    if v_diff <> 0 then
      raise exception 'F FAILED: organization % — the pages door and custom.forms/custom.bookings disagree on % row(s)', v_org.id, v_diff;
    end if;
    select count(*) into v_diff from custom.data_home_pages(v_org.id) p where p.organization_id <> v_org.id;
    if v_diff <> 0 then
      raise exception 'F FAILED: organization % — % page(s) from another organization', v_org.id, v_diff;
    end if;
    select count(*) into v_diff from (
      ((select * from _pages where organization_id = v_org.id) except all (select * from custom.data_home_pages(v_org.id)))
      union all
      ((select * from custom.data_home_pages(v_org.id)) except all (select * from _pages where organization_id = v_org.id))) d;
    if v_diff <> 0 then
      raise exception 'F FAILED: organization % — named alone and named nobody disagree on % page(s)', v_org.id, v_diff;
    end if;
    v_orgs := v_orgs + 1;
    v_rows := v_rows + (select count(*) from _pages where organization_id = v_org.id);
  end loop;
  if (select count(distinct organization_id) from _pages) < 2 then
    raise exception 'F CANNOT BE JUDGED: pages in fewer than two organizations';
  end if;
  raise notice 'F passed: % organizations, each named alone answers exactly its forms and booking pages (% in total, % forms, % booking pages, in % organizations)',
    v_orgs, v_rows, (select count(*) from _pages where kind = 'form'), (select count(*) from _pages where kind = 'booking'),
    (select count(distinct organization_id) from _pages);

  select count(*) into v_diff from custom.data_home_pages('00000000-0000-4000-8000-00000000dead'::uuid);
  if v_diff <> 0 then
    raise exception 'G FAILED: an organization nobody admits answered % page(s)', v_diff;
  end if;
  raise notice 'G passed: an organization the walk does not admit answers no pages';
end $$;

rollback;
\echo 'GREEN'
