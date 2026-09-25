-- target: branch,production
-- additive: yes
--   REPLACES two bodies — `custom.view_declare(uuid, uuid, jsonb)` (VIEW-SWITCH's, byte for byte,
--   plus the VIEW-LOOK gate) and `custom.view_record_order_set(uuid, uuid, uuid[])` (GRID-MANUAL's,
--   byte for byte, plus the same gate) — and ADDS two client doors, `custom.view_look_read(uuid,
--   uuid)` and `custom.view_look_set(uuid, uuid, uuid, jsonb)`, declared in
--   platform.client_callable_door before they are granted. No table, trigger, policy, index or
--   stored row changes; a look is a row of the one saved-view store (`platform.saved_view`,
--   surface `custom/records/look`). Inverse:
--   migrations/inverse/viewlook_a_look_at_a_view_is_yours_until_you_save_it_down.sql.
-- guard: custom/system_enabled
-- lock: custom,platform
-- lane: VIEW-STATE-PERSONAL
-- based-on: custom.view_declare(uuid, uuid, jsonb) 461727a75335ec67773ca4dd69b447048dcaa4f5dcb97cd4c245fb0a4a70731f
-- based-on: custom.view_record_order_set(uuid, uuid, uuid[]) 95230e86dbbd6b4127617357b944aabd4219adea1214945719b4d94bd58aaef5
--
-- LANE VIEW-STATE-PERSONAL. A LOOK AT A VIEW IS YOURS UNTIL YOU SAVE IT.
--
-- THE USE CASE (VERIFIER-23 item 1, production, 2026-09-25). Harbor Street Duplex's maintenance
-- requests open as a Grid for the owner and the tenant liaison. The owner looked at the board
-- grouped by Status; the liaison opened the table next and her board came up already grouped by
-- Status, because the pick was `view_declare {view_id: <the default view>, definition:
-- {group_field: "status"}}` and this door (VIEWER, by design) merged it onto the one view
-- everybody opens. VIEW-SWITCH closed the layout; this is the same class one level down.
--
-- THE RULE (Airtable and Notion): how you are looking at a shared view — its grouping, its date
-- field, its sort, its filter, its hidden columns, its widths, its layout — is YOUR look until you
-- press "Save to view". The view row changes only through that explicit save (someone who may EDIT
-- the table), "Save as new view", or the designate door for the default.
--   · `custom.view_look_set` / `custom.view_look_read` (VIEWER): one look per (person, view),
--     judged by the view-keys registry like the view itself; null goes back to the view.
--   · `custom.view_declare` on an EXISTING view: editor on the table, or the view is the caller's
--     own and is not the table's default. A new view is unchanged (viewer).
--   · `custom.view_record_order_set`: editor on the table — a hand-set order is the view's sort.
-- The store's owner (the mover, a repair, the server's own lanes) is unchanged.
--
-- LOCKS. create or replace function + comments + two declaration rows. Not window-class.

set local lock_timeout = '30s';
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
  if v_id is not null
     and not custom.query_is_store_owner()
     and custom.query_principal() is not null
     and not (v_row.created_by is not distinct from custom.query_principal() and not v_was_default)
     and not custom.has_visibility(custom.query_principal(), 'record', p_table_id, 'editor'::public.permission_level) then
    raise exception 'Only someone who can edit this table saves a change onto its view "%" for everyone, so your change was not saved onto it.', v_row.name
      using errcode = '42501',
            hint = 'Your own look at this view is kept for you alone (custom.view_look_set) and "Reset to view" returns to it; someone who can edit the table presses "Save to view". Nothing was written.';
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

  insert into platform.saved_view
    (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
  values (coalesce(v_name, 'Saved view'), 'custom/records', p_table_id, v_def, p_organization_id,
          custom.query_principal(), 'internal'::platform.visibility)
  returning id into v_id;
  return v_id;
end;
$function$
;

comment on function custom.view_declare(uuid, uuid, jsonb) is
  'Save a view of a Table: a NEW view (viewer), or a change onto an existing one (editor on the table, or the caller''s own view that is not the default) — "Save to view". MERGES only the keys sent. Never the designation (custom.view_designate). A person''s look while looking is custom.view_look_set (VIEW-LOOK, 2026-09-25).';

CREATE OR REPLACE FUNCTION custom.view_record_order_set(p_organization_id uuid, p_view_id uuid, p_record_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_view   record;
  v_table  uuid;
  v_max    integer := coalesce((platform.knob_resolve('custom', 'view_record_order_max', p_organization_id) #>> '{}')::integer, 20000);
  v_named  integer := coalesce(cardinality(p_record_ids), 0);
  v_bad    integer;
  v_pos    jsonb;
  v_total  integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_record_order_set');
  perform custom.assert_store_door(p_organization_id, 'custom.view_record_order_set');

  select * into v_view from platform.saved_view
   where id = p_view_id and organization_id = p_organization_id
     and surface_key = 'custom/records' and deleted_at is null;
  if v_view.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;
  v_table := coalesce(v_view.subject_id, nullif(v_view.definition ->> 'table_id', '')::uuid);
  perform custom.assert_client_may_open(p_organization_id, v_table, 'custom.view_record_order_set');
  -- ── VIEW-LOOK (VERIFIER-23 item 1): A HAND-SET ORDER IS THE VIEW'S SORT, SO IT IS SAVED FOR
  -- EVERYBODY WHO OPENS THE VIEW — by someone who may EDIT the table, the same rule as "Save to
  -- view" (custom.view_declare). Looking at the rows in another order is the person's own.
  if not custom.query_is_store_owner()
     and custom.query_principal() is not null
     and not custom.has_visibility(custom.query_principal(), 'record', v_table, 'editor'::public.permission_level) then
    raise exception 'Only someone who can edit this table puts its view "%" in an order by hand for everyone, so the order was not saved.', v_view.name
      using errcode = '42501',
            hint = 'Sort the rows for yourself with a column sort (your own look); someone who can edit the table saves a hand-set order. Nothing was changed.';
  end if;

  if v_named = 0 then
    raise exception 'Name the records in the order you want them.' using errcode = '22023',
      hint = 'custom.view_record_order_set takes the record ids of this view''s table, first to last. Nothing was changed.';
  end if;
  if v_named > v_max then
    raise exception 'This order names % records; a view holds a hand-set order for at most %.', v_named, v_max
      using errcode = '54000', hint = 'The ceiling is the organization knob custom/view_record_order_max. Nothing was changed.';
  end if;
  if (select count(distinct x) from unnest(p_record_ids) x) <> v_named then
    raise exception 'The same record is named twice in this order.' using errcode = '22023',
      hint = 'Each record takes one place. Nothing was changed.';
  end if;

  select count(*) into v_bad
    from unnest(p_record_ids) x(id)
   where x.id not in (select v from custom.query_visible_ids(p_organization_id, v_table, 'viewer') v);
  if v_bad > 0 then
    raise exception '% of the records named are not rows of this view''s table that you can see.', v_bad
      using errcode = '22023', hint = 'Order only the rows the view shows you. Nothing was changed.';
  end if;

  -- The named first, in the order given; then the rows the view had already placed and this
  -- call did not name, in their old order (only while they still live in the Table); re-spaced.
  with named as (
    select x.id, x.n::numeric as k from unnest(p_record_ids) with ordinality x(id, n)
  ),
  kept as (
    select (e.key)::uuid as id, (e.value #>> '{}')::numeric as old
      from jsonb_each(coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb)) e
     where (e.key)::uuid not in (select id from named)
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = (e.key)::uuid
                      and r.table_id = v_table and r.deleted_at is null)
  ),
  ordered as (
    select id, row_number() over (order by grp, k, id) as n
      from (select id, 0 as grp, k from named
            union all
            select id, 1 as grp, old from kept) u
  )
  select jsonb_object_agg(id::text, n * 1024), count(*) into v_pos, v_total from ordered;

  update platform.saved_view
     set metadata = jsonb_set(coalesce(metadata, '{}'::jsonb), '{record_positions}', v_pos, true),
         -- ORDER-FIX: the hand-set order IS the view's sort, so the sort it replaces goes.
         definition = (definition - 'sorts'::text) || jsonb_build_object('order', 'manual'),
         updated_at = now()
   where id = p_view_id and organization_id = p_organization_id;

  return jsonb_build_object('view_id', p_view_id, 'table_id', v_table, 'order', 'manual',
                            'named', v_named, 'positioned', v_total,
                            'replaced_sorts', coalesce(v_view.definition -> 'sorts', '[]'::jsonb));
end
$function$
;

comment on function custom.view_record_order_set(uuid, uuid, uuid[]) is
  'Put a saved view''s rows in a hand-set order (editor on the table): the order becomes the view''s sort for everybody who opens it (GRID-MANUAL; VIEW-LOOK 2026-09-25).';

-- ── THE LOOK DOORS. One row per (person, view) in the ONE saved-view store: surface
-- `custom/records/look`, subject = the view it is a look at, created_by = the person, visibility
-- personal. Nothing else reads that surface; `custom.views` lists `custom/records` only.

CREATE OR REPLACE FUNCTION custom.view_look_read(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me  uuid := custom.query_principal();
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_look_read');
  perform custom.assert_store_door(p_organization_id, 'custom.view_look_read');
  -- VIEWER: anyone who may open the table keeps a look at its views.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_look_read');
  if p_table_id is null then
    raise exception 'A look is a look at the views OF a table — name the table.' using errcode = '22004';
  end if;
  if v_me is null then
    return '{}'::jsonb;
  end if;
  -- Only the caller's own looks, and only at views of this table that still stand. The look row's
  -- own organization is not asked: a table that moved takes its views with it, and a look follows
  -- the view it names.
  select coalesce(jsonb_object_agg(v.id::text,
                                   jsonb_build_object('look', l.definition, 'updated_at', l.updated_at)),
                  '{}'::jsonb)
    into v_out
    from platform.saved_view v
    join platform.saved_view l
      on l.subject_id = v.id and l.surface_key = 'custom/records/look'
     and l.created_by = v_me and l.deleted_at is null
   where v.organization_id = p_organization_id and v.deleted_at is null
     and v.surface_key = 'custom/records'
     and coalesce(v.subject_id, nullif(v.definition ->> 'table_id', '')::uuid) = p_table_id;
  return v_out;
end;
$function$;

comment on function custom.view_look_read(uuid, uuid) is
  'The caller''s own look at each saved view of a Table (viewer): {"<view id>": {"look": {...}, "updated_at": ...}}. A look is how ONE person is looking at a shared view until an editor saves it onto the view (VIEW-LOOK, VERIFIER-23 item 1, 2026-09-25).';

CREATE OR REPLACE FUNCTION custom.view_look_set(p_organization_id uuid, p_table_id uuid, p_view_id uuid, p_look jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- The settings a person may hold as her own look. Never the view's designation (is_default),
  -- its Rule, the flat filters the digests read, or what only the server writes.
  c_keys  constant text[] := array['layout', 'where', 'group_field', 'swimlane_field', 'collapsed_columns',
                                   'measure', 'date_field', 'image_field', 'sorts', 'presentation', 'grid'];
  v_me    uuid := custom.query_principal();
  v_view  record;
  v_look  record;
  v_bad   text;
  v_set   jsonb;
  v_null  jsonb;
  v_doc   jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.view_look_set');
  perform custom.assert_store_door(p_organization_id, 'custom.view_look_set');
  -- VIEWER, and it writes nothing anybody else reads.
  perform custom.assert_client_may_open(p_organization_id, p_table_id, 'custom.view_look_set');

  if p_table_id is null or p_view_id is null then
    raise exception 'Name the table and the view this look is a look at.' using errcode = '22004';
  end if;
  if v_me is null then
    raise exception 'A look is kept for a signed-in person, and nobody is signed in.'
      using errcode = '42501', hint = 'Sign in; a look is kept per person. Nothing was written.';
  end if;

  select sv.* into v_view
    from platform.saved_view sv
   where sv.id = p_view_id and sv.organization_id = p_organization_id and sv.deleted_at is null
     and sv.surface_key = 'custom/records'
     and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id;
  if v_view.id is null then
    raise exception 'There is no saved view % here.', p_view_id
      using errcode = '23503',
            hint = 'It may have been removed, it may be a view of another table, or it may belong to another organization — organizations are hard walls (REC-29).';
  end if;

  -- One look per person per view: two tabs pressing at once never make two.
  perform pg_advisory_xact_lock(hashtextextended('custom.view_look:' || v_me::text || ':' || p_view_id::text, 0));
  select l.* into v_look
    from platform.saved_view l
   where l.subject_id = p_view_id and l.surface_key = 'custom/records/look'
     and l.created_by = v_me and l.deleted_at is null
   order by l.updated_at desc
   limit 1
   for update;

  -- RESET TO VIEW: no look (or an empty one) — the view as it is saved, again. Archived, never deleted.
  if p_look is null or jsonb_typeof(p_look) = 'null' or p_look = '{}'::jsonb then
    update platform.saved_view l
       set deleted_at = now(), updated_at = now()
     where l.subject_id = p_view_id and l.surface_key = 'custom/records/look'
       and l.created_by = v_me and l.deleted_at is null;
    return null;
  end if;
  if jsonb_typeof(p_look) <> 'object' then
    raise exception 'A look is the settings of a view, as an object.' using errcode = '22023',
      hint = 'Send {"group_field": "status"} and the like; send null to go back to the view. Nothing was written.';
  end if;

  select k into v_bad from jsonb_object_keys(p_look) k where not (k = any (c_keys)) limit 1;
  if v_bad is not null then
    raise exception 'A look keeps how you are looking at a view, and "%" is not one of those settings.', v_bad
      using errcode = '22023',
            hint = 'A look may hold: layout, where, group_field, swimlane_field, collapsed_columns, measure, date_field, image_field, sorts, presentation, grid. Whether a view is the default is custom.view_designate; the rest is saved onto the view. Nothing was written.';
  end if;

  -- A setting cleared in the look (JSON null) HIDES the view's own ("no grouping, for me"). Every
  -- other key is judged by the one registry, exactly as the view would judge it.
  select coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) <> 'null'), '{}'::jsonb),
         coalesce(jsonb_object_agg(e.key, e.value) filter (where jsonb_typeof(e.value) = 'null'), '{}'::jsonb)
    into v_set, v_null
    from jsonb_each(p_look) e;
  v_set := custom.view_keys_check(p_organization_id, p_table_id, v_set, coalesce(v_view.definition, '{}'::jsonb));
  if v_set ? 'grid' then
    v_set := jsonb_set(v_set, '{grid}', custom.grid_layout_check(v_set -> 'grid', 'view'));
  end if;
  v_doc := v_set || v_null;

  if v_look.id is not null then
    update platform.saved_view
       set definition = v_doc, updated_at = now(), version = version + 1
     where id = v_look.id;
  else
    insert into platform.saved_view
      (name, surface_key, subject_id, definition, organization_id, created_by, visibility)
    values (coalesce(v_view.name, 'Saved view'), 'custom/records/look', p_view_id, v_doc,
            p_organization_id, v_me, 'personal'::platform.visibility);
  end if;
  return v_doc;
end;
$function$;

comment on function custom.view_look_set(uuid, uuid, uuid, jsonb) is
  'Keep the caller''s own look at a saved view (viewer): the settings she chose while looking, judged by custom.view_keys(); null goes back to the view (the look is archived). The shared view row is never written — that is "Save to view" (custom.view_declare, editor) (VIEW-LOOK, VERIFIER-23 item 1, 2026-09-25).';

revoke all on function custom.view_look_read(uuid, uuid) from public, anon;
revoke all on function custom.view_look_set(uuid, uuid, uuid, jsonb) from public, anon;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'custom', p.proname, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/viewlook_a_look_at_a_view_is_yours_until_you_save_it.sql (lane VIEW-STATE-PERSONAL)',
       case p.proname
         when 'view_look_read' then 'The table page reads the signed-in person''s own look at each view of a table she may open (custom.assert_client_may_open). It answers only rows she wrote herself (created_by = the caller), inside the caller''s organization.'
         else 'The table page keeps the signed-in person''s own look at a view of a table she may open (custom.assert_client_may_open). It writes only her own look row (created_by = the caller, visibility personal); the shared view is never written.'
       end,
       true
  from pg_proc p
 where p.oid in ('custom.view_look_read(uuid, uuid)'::regprocedure,
                 'custom.view_look_set(uuid, uuid, uuid, jsonb)'::regprocedure)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- Declared first, then granted: the DDL guard takes back a client grant on an undeclared definer.
grant execute on function custom.view_look_read(uuid, uuid) to authenticated, service_role;
grant execute on function custom.view_look_set(uuid, uuid, uuid, jsonb) to authenticated, service_role;
