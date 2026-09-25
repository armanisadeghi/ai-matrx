-- target: branch,production
-- additive: yes
--   It REPLACES two bodies, nothing else: `custom.view_declare(uuid, uuid, jsonb)` (VIEW-KEYS-SHEET's
--   S1 body, byte for byte, plus the three ORDER-FIX blocks) and `custom.view_record_order_set(uuid,
--   uuid, uuid[])` (G13's body plus two lines). CREATE OR REPLACE keeps every EXECUTE. No table,
--   trigger, policy, grant or stored row is touched (the one-row repair of a hand-ordered grid view
--   is its own chair step, migrations/inverse/orderfix_a_hand_ordered_view_opens_as_the_sheet.sql). The inverse is `migrations/inverse/orderfix_a_hand_set_order_is_the_views_sort_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
-- lane: ORDER-FIX
-- based-on: custom.view_declare(uuid, uuid, jsonb) e3cbe21fba7bf799e419c058154fc98f38b4a12f9e5bbabee3fe4340b5f5cd82
-- based-on: custom.view_record_order_set(uuid, uuid, uuid[]) 3904de2c6ccf9008b3bd7bdcf383b4c6a4a1041b90c8f20f4455601aac3f34a1
--
-- LANE ORDER-FIX. A VIEW'S ORDER IS ONE THING: ITS SORT, OR ITS HAND-SET ORDER — NEVER BOTH.
--
-- THE USE CASE. The owner keeps his Coding Accounts in the order he dragged them into; the mover
-- carried that order onto the table's default view (`order: "manual"`, positions on the view's
-- row). The table also says "Reset Date, ascending" as its saved sort, so the Sheet drew Reset
-- Date and the order he made was invisible. VERIFIER-19 (finding 2) walked the same thing on
-- admin's Rooms: `view_record_order_set` answered 200 with Kitchen first, and the Sheet kept
-- drawing Room A→Z after the save, after a reload and on the "Hand-set order" tab.
--
-- THE RULE (Airtable's): a manual order is a sort mode of the view. So in the store
--   · placing the rows (`custom.view_record_order_set`) makes the hand-set order the view's sort:
--     `definition.order = "manual"` and any `definition.sorts` is removed (the answer names the
--     sort it replaced, `replaced_sorts`, so the screen can say so);
--   · choosing a sort (`custom.view_declare` with a non-empty `sorts`) or saying `order: "sorted"`
--     replaces the hand-set order: `order` becomes "sorted". The positions stay on the row, so
--     placing the rows again starts from the last order kept. Any other `order` word from a
--     caller is refused by name (22023) — "manual" is written only by placing rows.
-- `custom.read_records_in_view_order` already reads positions only (it never read `sorts`), so
-- it needs no change; with this file a view that says manual carries no sort to lose to.
--
-- LOCKS. create or replace function + comment on only. Not window-class.

set local lock_timeout = '30s';
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.view_declare(p_organization_id uuid, p_table_id uuid, p_spec jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $fn$
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
$fn$;

comment on function custom.view_declare(uuid, uuid, jsonb) is
  'S1-PRIME VIEW-KEYS (on S0 ONE-SAVED-VIEW): THE one door that writes a record-store saved view (platform.saved_view, surface custom/records). VIEWER on the Table. Every definition key sent is judged by custom.view_keys_check against the registry custom.view_keys() (undeclared keys, archived or foreign Fields and wrong Field kinds are refused; Fields are stored by key), the question (where, filters) by custom.record_filter_sql(org, table, …); a Rule under filters is refused. With spec.view_id it MERGES: name only when sent, filters only when the key is sent, each spec.definition key replaces that key, a key sent as null is removed, grid merges one level, and table_id and moved_from are never taken from a caller. ORDER-FIX: a view is ordered by its sort OR by hand, never both — a non-empty sorts, or order "sorted" (the one order word a caller may send), replaces a hand-set order; "manual" is written only by custom.view_record_order_set, and any other order word is refused 22023. A swimlane is never the board''s column field; grouping is at most three levels. An update must name a view of this Table (23503 otherwise).';

CREATE OR REPLACE FUNCTION custom.view_record_order_set(p_organization_id uuid, p_view_id uuid, p_record_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $fn$
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
$fn$;

comment on function custom.view_record_order_set(uuid, uuid, uuid[]) is
  'GRID-PRIMITIVES G13 + ORDER-FIX: a hand-set row order for one saved view, which becomes the view''s sort (definition.order = manual, definition.sorts removed; the answer names replaced_sorts). The named records go first in the order given; rows the view had already placed and this call did not name keep their relative order after them; every position is re-spaced (1024, 2048, ...). Every named id must be a live record of the view''s table this person may see, or nothing changes. Whoever may open the table may, as for custom.view_declare.';
