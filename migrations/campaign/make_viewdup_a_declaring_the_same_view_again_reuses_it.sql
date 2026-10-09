-- chair-step: replaces custom.view_declare(uuid, uuid, jsonb) (no table, column, index, policy or grant touched). Reinstalling a /make template into a reused table re-declared its saved views, so one table held "Approval board" four times; declaring a view that is identical to a live one on the same table (same name, same definition apart from the default flag) now answers that view's id.
-- lock: custom
-- lane: MAKE-VIEWS-DEDUPE
-- based-on: custom.view_declare(uuid, uuid, jsonb) 108578c326baa4ec87d4540341a4f5e868222bc41a2057177a4e3eb79303f173
--
-- The inverse is `migrations/inverse/make_viewdup_a_declaring_the_same_view_again_reuses_it_down.sql`.
--
CREATE OR REPLACE FUNCTION custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_dup uuid;
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
  v_stray   text;
  v_def     jsonb;
  v_cleared text[];
  v_set     jsonb;
  v_keys    jsonb;
  v_levels  integer;
  v_old     jsonb := '{}'::jsonb;
  -- VIEW-SWITCH: whether the view being written IS the table's default (its designation).
  v_was_default boolean := false;
  -- ORDER-FIX: the one order word a caller may send. A hand-set order is written by placing
  -- the rows (custom.view_record_order_set); a caller may only turn it off ("sorted").
  v_order_in text := case when jsonb_typeof(p_spec -> 'definition') = 'object'
                          then nullif(p_spec -> 'definition' ->> 'order', '') end;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_declare');
  perform custom.assert_store_door(p_organization_id, 'custom.view_declare');
  -- VIEWER, not editor. Writing down a question about a Table is not changing it.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_declare');

  if p_table_id is null then
    raise exception 'A saved view is a view OF something — name the table.'
      using errcode = '22004';
  end if;

  -- ── NOTION-SMALL-4 (law 4): A KEY THIS DOOR DOES NOT READ IS REFUSED BY NAME, NEVER DROPPED. The
  -- door reads exactly four top-level keys (view_id, name, filters, definition); everything a view
  -- keeps (where, sorts, layout, group_field...) lives INSIDE definition. A top-level  used to
  -- be ignored without a word and the person's filter simply never stuck.
  if jsonb_typeof(p_spec) is distinct from 'object' then
    raise exception 'A saved view is asked for as an object: {name, filters, definition}.'
      using errcode = '22023', hint = 'Nothing was written.';
  end if;
  if exists (select 1 from jsonb_object_keys(p_spec) k
              where k not in ('view_id', 'name', 'filters', 'definition')) then
    select k into v_stray from jsonb_object_keys(p_spec) k
     where k not in ('view_id', 'name', 'filters', 'definition') order by k limit 1;
    raise exception 'A saved view is asked for as {name, filters, definition}, and "%" is not one of those, so it was not saved.', v_stray
      using errcode = '22023',
            hint = case when exists (select 1 from custom.view_keys() r where r.path = v_stray)
                        then format('"%s" is a setting of the view: send it inside definition, as definition.%s. Nothing was written.', v_stray, v_stray)
                        else 'The settings a view keeps are listed by custom.view_keys() and go inside definition. Nothing was written.' end;
  end if;

  -- ── ORDER-FIX: A VIEW'S ORDER IS ITS SORT OR ITS HAND-SET ORDER, NEVER BOTH. A caller may say
  -- "sorted" (stop using the hand-set order); "manual" is written only by placing the rows.
  if v_order_in is not null and v_order_in <> 'sorted' then
    raise exception 'A view is put in a hand-set order by placing its rows, not by naming the word "%".', v_order_in
      using errcode = '22023',
            hint = 'Place the rows with custom.view_record_order_set; send order "sorted" (or a sort) to go back to a sort. Nothing was written.';
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

  -- ── S1-PRIME VIEW-KEYS: A KEY CLEARED MUST BE A KEY. Clearing a setting no view has is the same
  -- misspelling as setting one.
  if exists (select 1 from unnest(v_cleared) c(k)
              where not exists (select 1 from custom.view_keys() r where r.path = c.k)) then
    raise exception 'A saved view has no setting called "%", so there is nothing to clear.',
                    (select c.k from unnest(v_cleared) c(k)
                      where not exists (select 1 from custom.view_keys() r where r.path = c.k) limit 1)
      using errcode = '22023', hint = 'The settings a view keeps are listed by custom.view_keys(). Nothing was written.';
  end if;

  -- ONE HIDDEN-COLUMN LIST. A caller that names hidden columns by Field ID (`hidden_fields`, the
  -- mover's shape) has them written where the grid and the gallery read them —
  -- `presentation.hiddenFields`, by Field KEY; the ids stay only as provenance under
  -- `moved_from.hidden_fields` when the view was moved in. Two lists of one thing drift.
  if jsonb_typeof(v_set -> 'hidden_fields') = 'array' then
    select coalesce(jsonb_agg(distinct f.data ->> 'key'), '[]'::jsonb) into v_keys
      from jsonb_array_elements_text(v_set -> 'hidden_fields') x(fid)
      join custom.record f
        on f.organization_id = p_organization_id and f.id = platform.uuid_or_null(x.fid)
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
      raise exception 'There is no such saved view here.' using errcode = '23503',
              hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).',
            detail = jsonb_build_object('id', v_id)::text;
    end if;
    v_old := coalesce(v_row.definition, '{}'::jsonb);
  end if;

  -- ── S1-PRIME VIEW-KEYS: EVERY KEY SENT IS JUDGED BY THE REGISTRY, AND THE FILTER BY THE ONE
  -- COMPILER, BEFORE ANYTHING IS WRITTEN. `moved_from` is the server's and is not judged here.
  v_set := (custom.view_keys_check(p_organization_id, p_table_id, v_set - 'moved_from'::text,
                                   v_old))
           || coalesce(case when v_set ? 'moved_from' then jsonb_build_object('moved_from', v_set -> 'moved_from') end, '{}'::jsonb);
  -- ── VIEW-SWITCH-NOT-DESIGNATION (VERIFIER-21, 2026-09-25): LOOKING AT A TABLE IS NOT DECIDING
  -- HOW IT OPENS. The table's default view — its `is_default` and its `layout` — is the
  -- table's DESIGNATION: how it opens for everyone. It is changed by one deliberate act, by someone
  -- who may edit the table: `custom.view_designate`. This door (VIEWER on the table) keeps every
  -- other setting of every view, but never the designation, so pressing Kanban or Calendar can
  -- never again open a member's table in the owner's last look.
  if v_id is not null then
    v_was_default := coalesce(v_row.is_default, false) or (v_old -> 'is_default') = 'true'::jsonb;
    if v_was_default
       and ((v_set ? 'layout' and (v_set ->> 'layout') is distinct from coalesce(v_old ->> 'layout', 'grid'))
            or 'layout' = any(v_cleared)) then
      raise exception 'Looking at this table as a % does not change how it opens for everyone, so it was not saved onto its default view.',
                      coalesce(v_set ->> 'layout', 'grid')
        using errcode = '22023',
              hint = 'The table''s default layout is changed only by "Make this the default" (custom.view_designate), by someone who can edit the table. Nothing was written.';
    end if;
    if (v_set ? 'is_default' and (v_set -> 'is_default') is distinct from to_jsonb(v_was_default))
       or ('is_default' = any(v_cleared) and v_was_default) then
      raise exception 'Which view a table opens on is chosen with "Make this the default", not by saving a view.'
        using errcode = '22023',
              hint = 'Use custom.view_designate, by someone who can edit the table. Nothing was written.';
    end if;
  elsif (v_set -> 'is_default') = 'true'::jsonb
        and exists (select 1 from platform.saved_view sv
                     where sv.organization_id = p_organization_id and sv.deleted_at is null
                       and sv.surface_key = 'custom/records'
                       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
                       and (sv.is_default or (sv.definition -> 'is_default') = 'true'::jsonb)) then
    raise exception 'This table already has a default view, so a new view cannot be saved as it.'
      using errcode = '22023',
            hint = 'Save the view, then use "Make this the default" (custom.view_designate), by someone who can edit the table. Nothing was written.';
  end if;

  -- ── VIEW-LOOK (VERIFIER-23 item 1, 2026-09-25): A LOOK IS YOURS UNTIL YOU SAVE IT. A saved view
  -- is how everybody who opens it sees the table; choosing a board's grouping, a calendar's date
  -- field, a sort, a filter, a hidden column or a width while looking is the person's OWN look
  -- (custom.view_look_set) until someone who may EDIT the table saves it onto the view. So a
  -- change to a view that already exists needs editor on the table — or the view is the caller's
  -- own and is not the table's default. Saving a NEW view is unchanged (viewer).
  if v_id is not null then
    if not custom.query_is_store_owner()
       and custom.query_principal() is not null
       and not (v_row.created_by is not distinct from custom.query_principal() and not v_was_default)
       and not custom.has_visibility(custom.query_principal(), 'record', p_table_id, 'editor'::public.permission_level) then
      raise exception 'Only someone who can edit this table saves a change onto its view "%" for everyone, so your change was not saved onto it.', v_row.name
        using errcode = '42501',
              hint = 'Your own look at this view is kept for you alone (custom.view_look_set) and "Reset to view" returns to it; someone who can edit the table presses "Save to view". Nothing was written.';
    end if;
  end if;

  -- `filters` is the FLAT map the digests and the notifier read (custom.agg_view_admits); a Rule
  -- expression there would be refused by name the first time a subscription asks it, so it is
  -- refused here, with where it belongs.
  if p_spec ? 'filters' and v_filters <> '{}'::jsonb then
    if custom.filter_is_rule(v_filters) then
      raise exception 'A view''s filters are the flat Field-to-value map, and this is a Rule expression.'
        using errcode = '22023', hint = 'Send a nested question as definition.where (S2-PRIME); the digests and the notifier read filters. Nothing was written.';
    end if;
    perform custom.record_filter_sql(p_organization_id, p_table_id, v_filters);
  end if;

  if v_id is not null then
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
  else
    -- THE ONE SHAPE THE NOTIFIER READS. `custom.agg_view_admits` and
    -- `custom.agg_view_admits_state` both take `{"table_id": …, "filters": {…}}`, so a
    -- view saved here needs no translation before a subscription can be written over it.
    -- THE CASTS ARE NOT DECORATION (42725 without them: `jsonb - text` vs `jsonb - text[]`).
    v_def := jsonb_build_object('table_id', p_table_id, 'filters', v_filters) || v_set;
    if v_def ? 'grid' then
      v_def := jsonb_set(v_def, '{grid}', custom.grid_layout_check(v_def -> 'grid', 'view'));
    end if;
  end if;

  -- ── ORDER-FIX: CHOOSING A SORT REPLACES THE HAND-SET ORDER (Airtable's rule: a manual order is
  -- one of a view's sorts, and picking a column sort replaces it). The positions stay on the
  -- view's row, so placing the rows again starts from the order the person last kept.
  if v_def ->> 'order' = 'manual'
     and (v_order_in = 'sorted'
          or (jsonb_typeof(v_set -> 'sorts') = 'array' and jsonb_array_length(v_set -> 'sorts') > 0)) then
    v_def := jsonb_set(v_def, '{order}', '"sorted"'::jsonb, true);
  end if;

  -- ── S1-PRIME VIEW-KEYS: THE KEYS THAT MUST AGREE, ASKED OF THE VIEW AS IT WILL BE STORED.
  if nullif(v_def ->> 'swimlane_field', '') is not null
     and v_def ->> 'swimlane_field' = v_def ->> 'group_field' then
    raise exception 'The swimlanes and the columns are both %, so every lane would hold one column.', v_def ->> 'swimlane_field'
      using errcode = '22023', hint = 'A swimlane cuts the board by a second field. Nothing was written.';
  end if;
  v_levels := case when jsonb_typeof(v_def -> 'presentation' -> 'grouping') = 'object'
                   then 1 + coalesce(case when jsonb_typeof(v_def -> 'presentation' -> 'grouping' -> 'then') = 'array'
                                          then jsonb_array_length(v_def -> 'presentation' -> 'grouping' -> 'then') end, 0)
                   else 0 end;
  if v_levels > 3 then
    raise exception 'A view groups at most three levels deep, and this one would group %.', v_levels
      using errcode = '22023', hint = 'Nothing was written.';
  end if;

  if v_id is not null then
    update platform.saved_view
       set name = coalesce(v_name, name), definition = v_def, updated_at = now(), version = version + 1
     where id = v_id and organization_id = p_organization_id;
    return v_id;
  end if;

  -- MAKE-VIEWDUP: declaring the same view again (same table, same name, same definition apart from
  -- which view is the default) answers the live one already there instead of storing a copy; a
  -- template installed twice into a reused table keeps one "Approval board", not four.
  select sv.id into v_dup from platform.saved_view sv
   where sv.organization_id = p_organization_id and sv.deleted_at is null
     and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id
     and sv.name = coalesce(v_name, 'Saved view')
     and (sv.definition - 'is_default'::text) = (v_def - 'is_default'::text)
   order by sv.created_at limit 1;
  if v_dup is not null then
    return v_dup;
  end if;

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (coalesce(v_name, 'Saved view'), 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$
