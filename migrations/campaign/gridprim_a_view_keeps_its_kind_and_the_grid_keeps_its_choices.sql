-- target: branch,production
-- additive: yes
--   It REPLACES two bodies G1 wrote (gridprim_a_table_wears_its_colors_and_its_layout.sql), each
--   declared below with the body it was written against: `custom.view_declare` keeps
--   `definition.layout` as the view's KIND string and judges the grid's choices under
--   `definition.grid`; `custom.grid_layout` reads them from there. Nothing is added, dropped or
--   revoked; no table, trigger, policy or grant is touched; no stored view is rewritten.
--   MUST be applied IMMEDIATELY AFTER G1, in the same window.
--   The inverse is `migrations/inverse/gridprim_a_view_keeps_its_kind_and_the_grid_keeps_its_choices_down.sql`.
-- guard: custom/system_enabled
-- lock: custom
-- based-on: custom.view_declare(uuid, uuid, jsonb) 6c879ed99be5ae2ff4c6e4974de958a0e6fc752c7c94841012bd4d91f5e87695
-- based-on: custom.grid_layout(uuid, uuid, uuid) f08ae7880a71706e0bf385201b3595b871f18307267be58c3eee105395096d0f
--
-- LANE GRID-PRIMITIVES, G7 (found by RECORDS-SUITE-3, 2026-09-23) — THE CLASS: TWO MEANINGS, ONE KEY.
--
-- `platform.saved_view.definition.layout` had an owner before G1: SCR-6's view kind — `grid`,
-- `kanban`, `calendar`, `gallery` — which custom.views hands back whole
-- (pipelines_a_saved_view_answers_what_it_stores.sql) and which matrx-records' pipeline_propose
-- writes as "kanban" for every board it makes. G1 made the same key the grid's settings object
-- and refused the string, so every board proposal failed on the branch and the clone.
--
-- CENSUS of every writer of saved_view `definition.layout` (2026-09-23, origin/main of both repos
-- + pg_proc on production, the clone and the branch):
--   · aidream packages/matrx-records/matrx_records/store/client.py pipeline_propose →
--     custom.view_declare {"layout": "kanban", "group_field": …}              the KIND
--   · custom.view_declare (this function) — the one door that writes custom/records views
--   · the older grid's `matrx-user/data-tables` views (features/data-tables/saved-views) write
--     their own `layout` STRING ("scroll", "default") through the saved_view_* doors, never
--     through view_declare, and are views of older tables custom.grid_layout never opens
--   · @ai-matrx/records-ui views are records of a system table (views.ts), not saved_view rows
--   · no other pg_proc body on any of the three databases names `'layout'` but custom.owning_table
--     and custom.table_contents, which do not touch saved_view
-- So the key keeps its first meaning and nobody else changes: the grid's choices move to their
-- own key, `definition.grid`, and a G1-shaped object sent as `layout` is moved there, never
-- refused. Refusing the older meaning (G1) or re-shaping it into an object (which would change
-- what custom.views hands every reader and what matrx-records' own suite asserts) are both a
-- second contract on one key; one key, one meaning is the fix.
--
-- LOCKS. create or replace function / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id      uuid := nullif(p_spec ->> 'view_id', '')::uuid;
  v_name    text := coalesce(nullif(btrim(p_spec ->> 'name'), ''), 'Saved view');
  v_filters jsonb := case when jsonb_typeof(p_spec -> 'filters') = 'object'
                          then p_spec -> 'filters' else '{}'::jsonb end;
  v_def     jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
  -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
  -- view saved here needs no translation before a subscription can be written over it.
  -- THE CASTS ARE NOT DECORATION. Without them PostgreSQL cannot choose between
  -- `jsonb - text` and `jsonb - text[]` for a bare literal and refuses the whole
  -- function at RUN time with 42725 — which is exactly how the first seat suite found
  -- this: every call to this door raised `operator is not unique: unknown - unknown`,
  -- so no saved view could be written by anybody.
  v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters)
           || coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                            then (p_spec -> 'definition') - 'table_id'::text - 'filters'::text
                       end, '{}'::jsonb);

  -- ── GRID-PRIMITIVES G7, 2026-09-23: `layout` IS THE VIEW'S KIND; THE GRID'S CHOICES ARE `grid`.
  -- `definition.layout` already meant something before G1 touched it: SCR-6's view kind — the
  -- word `grid`, `kanban`, `calendar` or `gallery` that custom.views hands back and that
  -- matrx-records' pipeline_propose writes as "kanban" for every board it makes. G1 judged that
  -- key as the grid's settings object and refused the string, so every board proposal failed.
  -- The kind stays exactly as every writer and reader has it. The grid's own choices (mode, row
  -- height, freeze, wrap, widths) live under `definition.grid`, judged here, before the view is
  -- kept. A settings OBJECT sent as `layout` (G1's shape, only ever on a rehearsal copy) is moved
  -- under `grid` rather than refused.
  if jsonb_typeof(v_def -> 'layout') = 'object' then
    v_def := (v_def - 'layout'::text)
             || jsonb_build_object('grid', coalesce(case when jsonb_typeof(v_def -> 'grid') = 'object'
                                                         then v_def -> 'grid' end, '{}'::jsonb)
                                           || (v_def -> 'layout'));
  end if;
  if v_def ? 'grid' then
    v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
  end if;

  if v_id is not null then
    update platform.saved_view
       set name = v_name, definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id and deleted_at is null;
    if not found then
      raise exception 'There is no saved view % here.', v_id
        using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
    end if;
    return v_id;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (v_name, 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.grid_layout(p_organization_id uuid, p_table_id uuid, p_view_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_platform jsonb;
  v_org      jsonb;
  v_view     jsonb := '{}'::jsonb;
  v_layout   jsonb;
  v_source   jsonb := '{}'::jsonb;
  v_refused  jsonb := '[]'::jsonb;
  e          record;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.grid_layout');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.grid_layout');

  select k.value into v_platform from platform.feature_knob k where k.feature = 'custom' and k.key = 'grid_layout';
  v_platform := coalesce(v_platform,
    '{"mode":"auto","fit_max_columns":8,"row_height":"normal","freeze_first_column":false,"wrap":false}'::jsonb);
  v_org := platform.knob_resolve('custom', 'grid_layout', p_organization_id);

  v_layout := v_platform;
  for e in select key from jsonb_object_keys(v_platform) key loop
    v_source := v_source || jsonb_build_object(e.key, 'platform');
  end loop;

  -- The organization's own default, choice by choice. A choice that is not one the grid can
  -- honour is left at the platform's and NAMED — an organization's setting is never
  -- silently ignored.
  if jsonb_typeof(v_org) = 'object' then
    for e in select key, value from jsonb_each(v_org) loop
      begin
        v_layout := v_layout || custom.grid_layout_check(jsonb_build_object(e.key, e.value), 'organization');
        if (v_platform -> e.key) is distinct from e.value then
          v_source := v_source || jsonb_build_object(e.key, 'organization');
        end if;
      exception when invalid_parameter_value then
        v_refused := v_refused || jsonb_build_array(jsonb_build_object('from', 'organization', 'choice', e.key,
                       'value', e.value, 'says', sqlerrm));
      end;
    end loop;
  end if;

  if p_view_id is not null then
    -- G7: the grid's choices are `definition.grid`; `definition.layout` is the view's kind
    -- (grid / kanban / calendar / gallery) and is not a grid setting. A G1-shaped object under
    -- `layout` is still read, so no rehearsal view goes silent.
    select coalesce(case when jsonb_typeof(v.definition -> 'grid') = 'object' then v.definition -> 'grid' end,
                    case when jsonb_typeof(v.definition -> 'layout') = 'object' then v.definition -> 'layout' end,
                    '{}'::jsonb)
      into v_view
      from platform.saved_view v
     where v.id = p_view_id
       and v.organization_id = p_organization_id
       and v.subject_id = p_table_id
       and v.deleted_at is null;
    if v_view is null then
      raise exception 'There is no saved view % of this table.', p_view_id
        using errcode = '23503',
              hint = 'It may have been removed, or it is a view of another table. The organization''s own layout still applies.';
    end if;
    if jsonb_typeof(v_view) = 'object' then
      for e in select key, value from jsonb_each(v_view) loop
        begin
          v_layout := v_layout || custom.grid_layout_check(jsonb_build_object(e.key, e.value), 'view');
          v_source := v_source || jsonb_build_object(e.key, 'view');
        exception when invalid_parameter_value then
          v_refused := v_refused || jsonb_build_array(jsonb_build_object('from', 'view', 'choice', e.key,
                         'value', e.value, 'says', sqlerrm));
        end;
      end loop;
    end if;
  end if;

  return jsonb_build_object('layout', v_layout, 'source', v_source, 'view_id', p_view_id,
                            'refused', v_refused);
end;
$function$;

comment on function custom.grid_layout(uuid, uuid, uuid) is
  'GRID-PRIMITIVES G1/G7: the layout a Table''s grid opens with — the platform default, the organization''s custom/grid_layout knob over it, and the saved view''s own definition.grid over that — with `source` naming where each choice came from and `refused` naming any stored choice the grid cannot honour. definition.layout is the view''s kind (grid / kanban / calendar / gallery), not a grid setting.';
