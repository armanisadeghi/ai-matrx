-- lock: custom
-- lane: S0-ONE-SAVED-VIEW
-- based-on: custom.view_declare(uuid, uuid, jsonb) 6da4b50ef46ab429857bd9a226dcc20135994e4391f9d84724c7e352196308e7
-- The inverse of oneview_a_saved_view_keeps_what_it_was_not_sent.sql. It puts custom.view_declare
-- back to G7's body byte-for-byte (production's, hash 141383f285aea5c3…): an update rebuilds the
-- whole definition from what the caller sent again, so G13's order, the mover's provenance and any
-- key a caller did not resend are dropped on every update. Views already saved keep what they hold.
-- Run it only together with the records-ui release before S0 (which saved whole views), never
-- under a records-ui that saves one changed key at a time.

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
$function$
;

comment on function custom.view_declare(uuid, uuid, jsonb) is
  'DOOR-18: save a view of a Table — its name and its filters — at the VIEWER rung, because writing down a question about a Table is not changing it. The definition is written in the one shape the notifier already admits records against, so a subscription can be written over it with no translation.';
