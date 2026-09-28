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
--   C. an organization the caller cannot reach (an invented id) is REFUSED (42501), naming the door;
--   D. named nobody, the door answers what it always did (the call with no argument = named null);
--   E. the knob custom.data_home_default_organization defaults to "all" and has no organization or
--      user rung (switching the active organization must never change it);
--   F. custom.data_home_items(org) — forms, booking pages, portals, dashboards, digests, checklists,
--      automations, outside shares — answers, for EACH organization, exactly what the store's own
--      list doors answer, each row naming that organization; named nobody, every organization's;
--   G. an organization the caller cannot reach is refused by it, naming it;
--   H. custom.data_home_changed_by answers who changed it for every organization in one call,
--      exactly as custom.hub_changed_by does per organization, and refuses an unreachable one.
--
-- RUN IT (clone or production; always rolled back):
--   psql "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/datahome2_the_data_home_honors_its_organization.sql
-- ITS RED: before datahome2_a/_b the one-argument door and the knob do not exist (A fails);
-- before datahome2_e the items and changed-by doors do not exist (F fails).

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
-- HER SEAT, NOT THE STORE OWNER'S: the doors are asked as `authenticated`, the way a browser asks.
set local role authenticated;

select to_regprocedure('custom.data_home_tables(uuid)') is not null as door_exists \gset
\if :door_exists
\else
  \echo 'A FAILED: custom.data_home_tables(uuid) does not exist — the door takes no organization'
  \echo 'RED'
  rollback;
  \quit 3
\endif

select to_regprocedure('custom.data_home_items(uuid)') is not null
   and to_regprocedure('custom.data_home_changed_by(jsonb)') is not null as items_exist \gset
\if :items_exist
\else
  \echo 'F FAILED: custom.data_home_items(uuid) / custom.data_home_changed_by(jsonb) do not exist — the home''s other listings are one organization at a time'
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

  begin
    select count(*) into v_diff from custom.data_home_tables('00000000-0000-4000-8000-00000000dead'::uuid);
    raise exception 'C FAILED: an organization the caller cannot reach answered % row(s) instead of a refusal', v_diff;
  exception when insufficient_privilege then
    if sqlerrm not like '%custom.data_home_tables%' then
      raise exception 'C FAILED: the refusal does not name custom.data_home_tables: %', sqlerrm;
    end if;
  end;
  raise notice 'C passed: an organization the caller cannot reach is refused, naming custom.data_home_tables';

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

  create temp table _items on commit drop as select * from custom.data_home_items();
  create temp table _store (kind text, organization_id uuid, item_id uuid) on commit drop;
  v_orgs := 0;
  for v_org in select distinct organization_id as id from _all loop
    insert into _store
      select 'form', v_org.id, x.form_id from custom.forms(v_org.id) x
      union all select 'booking', v_org.id, x.form_id from custom.bookings(v_org.id) x
      union all select 'portal', v_org.id, x.portal_id from custom.list_portals(v_org.id, 'active') x
      union all select 'dashboard', v_org.id, x.dashboard_id from custom.dashboards(v_org.id) x
      union all select 'digest', v_org.id, x.rule_id from custom.subscriptions(v_org.id) x
      union all select 'checklist', v_org.id, x.template_id from custom.checklist_templates(v_org.id) x
      union all select 'automation', v_org.id, x.table_id from custom.pipelines(v_org.id) x
      union all select 'share', v_org.id, x.invitation_id from custom.shares_outside(v_org.id) x;
    select count(*) into v_diff from (
      ((select i.kind, i.organization_id, i.item_id from custom.data_home_items(v_org.id) i)
        except all (select * from _store where organization_id = v_org.id))
      union all
      ((select * from _store where organization_id = v_org.id)
        except all (select i.kind, i.organization_id, i.item_id from custom.data_home_items(v_org.id) i))) d;
    if v_diff <> 0 then
      raise exception 'F FAILED: organization % — data_home_items and the store''s own list doors disagree on % row(s)', v_org.id, v_diff;
    end if;
    select count(*) into v_diff from (
      ((select * from _items where organization_id = v_org.id) except all (select * from custom.data_home_items(v_org.id)))
      union all
      ((select * from custom.data_home_items(v_org.id)) except all (select * from _items where organization_id = v_org.id))) d;
    if v_diff <> 0 then
      raise exception 'F FAILED: organization % — named alone and named nobody disagree on % row(s)', v_org.id, v_diff;
    end if;
    v_orgs := v_orgs + 1;
  end loop;
  if (select count(distinct organization_id) from _items) < 2 then
    raise exception 'F CANNOT BE JUDGED: listings in fewer than two organizations';
  end if;
  raise notice 'F passed: % organizations, each named alone answers exactly what its own list doors answer — %',
    v_orgs, (select string_agg(k, ', ') from (select format('%s %s in %s orgs', count(*), kind, count(distinct organization_id)) k
                                               from _items group by kind order by kind) q);

  begin
    select count(*) into v_diff from custom.data_home_items('00000000-0000-4000-8000-00000000dead'::uuid);
    raise exception 'G FAILED: an organization the caller cannot reach answered % row(s) instead of a refusal', v_diff;
  exception when insufficient_privilege then
    if sqlerrm not like '%custom.data_home_items%' then
      raise exception 'G FAILED: the refusal does not name custom.data_home_items: %', sqlerrm;
    end if;
  end;
  raise notice 'G passed: an organization the caller cannot reach is refused, naming custom.data_home_items';

  -- H. WHO CHANGED IT, for every organization shown, in one call: the same answer custom.hub_changed_by
  -- gives organization by organization.
  create temp table _asks on commit drop as
    select organization_id, 'structure'::text as kind, array_agg(table_id) as ids
      from (select organization_id, table_id, row_number() over (partition by organization_id order by table_id) n from _all) q
     where n <= 50 group by organization_id;
  select count(*) into v_diff from (
    ((select c.organization_id, c.id, c.at, c.who
        from custom.data_home_changed_by((select jsonb_agg(jsonb_build_object('organization_id', organization_id, 'kind', kind, 'ids', to_jsonb(ids))) from _asks)) c)
      except all
     (select a.organization_id, h.id, h.at, h.who from _asks a cross join lateral custom.hub_changed_by(a.organization_id, a.kind, a.ids) h))
    union all
    ((select a.organization_id, h.id, h.at, h.who from _asks a cross join lateral custom.hub_changed_by(a.organization_id, a.kind, a.ids) h)
      except all
     (select c.organization_id, c.id, c.at, c.who
        from custom.data_home_changed_by((select jsonb_agg(jsonb_build_object('organization_id', organization_id, 'kind', kind, 'ids', to_jsonb(ids))) from _asks)) c))) d;
  if v_diff <> 0 then
    raise exception 'H FAILED: data_home_changed_by and hub_changed_by disagree on % row(s)', v_diff;
  end if;
  begin
    perform * from custom.data_home_changed_by(jsonb_build_array(jsonb_build_object(
      'organization_id', '00000000-0000-4000-8000-00000000dead', 'kind', 'structure', 'ids', '[]'::jsonb)));
    raise exception 'H FAILED: who-changed-it answered for an organization the caller cannot reach';
  exception when insufficient_privilege then
    if sqlerrm not like '%custom.data_home_changed_by%' then
      raise exception 'H FAILED: the refusal does not name custom.data_home_changed_by: %', sqlerrm;
    end if;
  end;
  raise notice 'H passed: who changed it answers for % organizations in one call, exactly as hub_changed_by does, and refuses an unreachable one',
    (select count(*) from _asks);
end $$;

rollback;
\echo 'GREEN'
