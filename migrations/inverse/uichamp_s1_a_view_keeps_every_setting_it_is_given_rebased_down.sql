-- chair-step: the CORRECTED inverse of uichamp_s1_a_view_keeps_every_setting_it_is_given.sql —
--   byte for byte uichamp_s1_a_view_keeps_every_setting_it_is_given_down.sql below its header,
--   with ONE line changed: its `-- based-on:` for custom.view_declare. The ledgered inverse
--   declares b6665956…, a body that never stood live: the up-file's own bytes produce e3cbe21f…
--   (measured 2026-09-25 on the clone, up-file's view_declare block alone in a rolled-back
--   transaction), and production and the clone both hold e3cbe21f… since 01:10Z. So the ledgered
--   inverse would be refused by DD-220 the one time it is needed. That file is ledgered on the
--   clone and is never edited; THIS is the inverse to run. Its up-file is not found by name — pass
--   `--up migrations/campaign/uichamp_s1_a_view_keeps_every_setting_it_is_given.sql`.
--   Lane BRANCH-REFRESH-4 (body-drift: an inverse whose based-on names a body no longer live).
--   What it does, as the ledgered inverse says — it puts
--   custom.view_declare back to lane S0's body byte for byte (6da4b50e…) and DROPS the three
--   functions that file added — custom.view_keys_check, custom._view_key_value,
--   custom._view_field_key — and custom.view_keys() (run the grant's inverse,
--   uichamp_s1_a_signed_in_person_may_read_the_view_keys_down.sql, first: it deletes the door row).
--   What it undoes: a saved view takes any key from anybody again — an undeclared key, a sort on an
--   archived column, a four-level grouping, a filter the board cannot ask are all stored and then
--   ignored by the screens. Views already saved keep what they hold; nothing is rewritten.
-- supersedes-inverse: uichamp_s1_a_view_keeps_every_setting_it_is_given_down.sql
-- lock: custom
-- lane: S1-PRIME-VIEW-KEYS
-- based-on: custom.view_declare(uuid, uuid, jsonb) e3cbe21fba7bf799e419c058154fc98f38b4a12f9e5bbabee3fe4340b5f5cd82

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
  v_name    text := nullif(btrim(p_spec ->> 'name'), '');
  v_filters jsonb := case when jsonb_typeof(p_spec -> 'filters') = 'object'
                          then p_spec -> 'filters' else '{}'::jsonb end;
  -- What the caller sent as the definition. Never the table and never the filters (both have
  -- their own place above), and never the hand-set order (custom.view_record_order_set's).
  v_in      jsonb := coalesce(case when jsonb_typeof(p_spec -> 'definition') = 'object'
                                   then (p_spec -> 'definition') - 'table_id'::text - 'filters'::text
                                        - 'order'::text
                              end, '{}'::jsonb);
  v_row     record;
  v_def     jsonb;
  v_cleared text[];
  v_set     jsonb;
  v_keys    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- ── GRID-PRIMITIVES G7: `layout` IS THE VIEW'S KIND; THE GRID'S CHOICES ARE `grid`. A settings
  -- OBJECT sent as `layout` (G1's shape) is moved under `grid` rather than refused.
  if jsonb_typeof(v_in -> 'layout') = 'object' then
    v_in := (v_in - 'layout'::text)
            || jsonb_build_object('grid', coalesce(case when jsonb_typeof(v_in -> 'grid') = 'object'
                                                        then v_in -> 'grid' end, '{}'::jsonb)
                                          || (v_in -> 'layout'));
  end if;

  -- A key sent as JSON null means "clear it"; every other key sent replaces that one key.
  select coalesce(array_agg(e.key) filter (where jsonb_typeof(e.value) = 'null'), '{}'::text[]),
         coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) <> 'null'), '{}'::jsonb)
    into v_cleared, v_set
    from jsonb_each(v_in) e;

  -- ONE HIDDEN-COLUMN LIST. A caller that names hidden columns by Field ID (`hidden_fields`, the
  -- mover's shape) has them written where the grid and the gallery read them —
  -- `presentation.hiddenFields`, by Field KEY; the ids stay only as provenance under
  -- `moved_from.hidden_fields` when the view was moved in. Two lists of one thing drift.
  if jsonb_typeof(v_set -> 'hidden_fields') = 'array' then
    select coalesce(jsonb_agg(distinct f.data ->> 'key'), '[]'::jsonb) into v_keys
      from jsonb_array_elements_text(v_set -> 'hidden_fields') x(fid)
      join custom.record f
        on f.organization_id = p_organization_id and f.id::text = x.fid
       and f.data_class = 'field' and f.data ->> 'key' is not null
       and f.data ->> 'entity_definition_id' = p_table_id::text;
    if jsonb_typeof(v_set -> 'moved_from') = 'object' then
      v_set := jsonb_set(v_set, '{moved_from,hidden_fields}', v_set -> 'hidden_fields', true);
    end if;
    v_set := jsonb_set(v_set - 'hidden_fields'::text, '{presentation}',
                       coalesce(case when jsonb_typeof(v_set -> 'presentation') = 'object'
                                     then v_set -> 'presentation' end, '{}'::jsonb)
                       || jsonb_build_object('hiddenFields', v_keys), true);
  end if;

  if v_id is not null then
    select sv.* into v_row
      from platform.saved_view sv
     where sv.id = v_id and sv.organization_id = p_organization_id and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
       for update;
    if v_row.id is null then
      raise exception 'There is no saved view % here.', v_id
        using errcode = '23503',
              hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).';
    end if;

    -- MERGE. What the caller did not send stays exactly as it was.
    v_def := coalesce(v_row.definition, '{}'::jsonb);
    v_set := v_set - 'moved_from'::text;
    v_cleared := array_remove(v_cleared, 'moved_from');
    if jsonb_typeof(v_set -> 'grid') = 'object' and jsonb_typeof(v_def -> 'grid') = 'object' then
      v_set := jsonb_set(v_set, '{grid}', (v_def -> 'grid') || (v_set -> 'grid'));
    end if;
    v_def := (v_def - v_cleared) || v_set;
    if p_spec ? 'filters' then
      v_def := jsonb_set(v_def, '{filters}', v_filters, true);
    end if;
    -- The table is the view's for life.
    v_def := jsonb_set(v_def, '{table_id}', to_jsonb(p_table_id), true);
    if not (v_def ? 'filters') then
      v_def := jsonb_set(v_def, '{filters}', '{}'::jsonb, true);
    end if;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;

    update platform.saved_view
       set name = coalesce(v_name, name), definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id;
    return v_id;
  end if;

  -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
  -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
  -- view saved here needs no translation before a subscription can be written over it.
  -- THE CASTS ARE NOT DECORATION (42725 without them: `jsonb - text` vs `jsonb - text[]`).
  v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters) || v_set;
  if v_def ? 'grid' then
    v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (coalesce(v_name, 'Saved view'), 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$;

comment on function custom.view_declare(uuid, uuid, jsonb) is
  'S0 ONE-SAVED-VIEW: THE one door that writes a record-store saved view (platform.saved_view, surface custom/records) — the view bar, board, calendar, gallery, digests, notify rules, the agent and the mover all save here. VIEWER on the Table. With spec.view_id it MERGES: name only when sent, filters only when the key is sent, each spec.definition key replaces that key, a key sent as null is removed, grid merges one level, and table_id / order / moved_from are never taken from a caller. An update must name a view of this Table (23503 otherwise, as for an invented id). Definition keys: table_id, filters, layout (kind), group_field, measure, date_field, image_field, sorts, rule_id, is_default, presentation, grid, order, moved_from.';

drop function if exists custom.view_keys_check(uuid, uuid, jsonb, jsonb);
drop function if exists custom._view_key_value(uuid, uuid, text, text, jsonb, jsonb);
drop function if exists custom._view_key_value(uuid, uuid, text, text, jsonb, text[]);
drop function if exists custom._view_field_key(uuid, uuid, text, text, jsonb, text[]);
drop function if exists custom.view_keys();
