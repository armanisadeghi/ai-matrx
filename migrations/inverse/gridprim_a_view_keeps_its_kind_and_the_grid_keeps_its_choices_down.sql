-- lock: custom
-- lane: GRID-PRIMITIVES
-- based-on: custom.view_declare(uuid, uuid, jsonb) 141383f285aea5c3b7d92e9e31f12e29a4b2c9e484283e8989f8ff0019b11f6e
-- based-on: custom.grid_layout(uuid, uuid, uuid) e0a3e19d1cfc2aabe46ed82d145a718de9383dd3a650664afd8c35bdee921bd4
-- chair-step: the inverse of gridprim_a_view_keeps_its_kind_and_the_grid_keeps_its_choices.sql.
-- It puts custom.view_declare and custom.grid_layout back to G1's bodies. WHAT THAT MEANS: a
-- view_declare carrying a layout KIND string ("kanban") is refused again, so matrx-records'
-- pipeline_propose fails — run it only with G1's own inverse right behind it. Views saved with
-- definition.grid keep it; G1's grid_layout no longer reads it.

set local lock_timeout = '2s';
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

  -- ── GRID-PRIMITIVES G1, 2026-09-22: A VIEW'S LAYOUT IS ONE THE GRID CAN HONOUR. ──────────
  -- `custom.grid_layout` reads `definition.layout` when the view is opened. A choice it does
  -- not know would be stored and then ignored on every opening, which is a setting that
  -- silently does nothing — so it is refused here, by name, before the view is kept.
  if v_def ? 'layout' then
    v_def := jsonb_set(v_def, '{layout}', custom.grid_layout_check(v_def -> 'layout', 'view'));
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
$function$

;

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
    select coalesce(v.definition -> 'layout', '{}'::jsonb) into v_view
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
$function$

;
