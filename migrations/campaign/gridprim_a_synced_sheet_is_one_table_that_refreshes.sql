-- target: branch,production
-- additive: yes
--   It ADDS `custom.table_sync` and its `platform.client_callable_door` row, and one knob row
--   (`custom/table_sync_rows_max`). Nothing existing is replaced, dropped or revoked; no table,
--   column, trigger, policy or grant is touched. Every write goes through the store's own doors.
--   The inverse is `migrations/inverse/gridprim_a_synced_sheet_is_one_table_that_refreshes_down.sql`.
-- guard: custom/system_enabled
-- lock: custom,platform
--
-- LANE GRID-PRIMITIVES, G10 (CUTOVER-PLAN.md row A3) — A SYNCED SHEET IS ONE TABLE THAT REFRESHES.
--
-- aidream `services/google_sync/records.py import_sheet_dataset` keeps a Google Sheet tab as one
-- older-store dataset: found again by its `sync_source` {external_id, tab_id}, the sheet's
-- columns added (a column the person added in Matrx is never touched), each sheet row found
-- again by its row reference and updated, a new one inserted, one gone from the sheet ARCHIVED —
-- never destroyed. The record store had nowhere to keep the sync source and no way to find a
-- record again by the row it came from, so the import could not move.
--
-- `custom.table_sync(org, home, spec)` is that whole refresh, in ONE transaction, through the
-- store's doors (custom.table_declare, field_declare, record_write, record_update, record_delete):
--   spec = {"source": {"provider": "google_sheets", "external_id": "<sheet id>", "tab_id": "<tab>",
--                      "synced_at": "<iso>", …anything else the importer keeps},
--           "table_name": "…", "columns": ["Header", …],
--           "rows": [{"ref": "<row ref>", "values": {"Header": value, …}}, …]}
-- The Table carries `sync_source` (the whole `source`); each record carries the platform's own
-- reserved metadata keys `source_system` (`sync:<provider>:<external id>:<tab>`) and `source_id`
-- (its row reference) — `*:source_system` / `*:source_id` in platform.metadata_reserved_keys.
--
-- LOCKS. create function / insert / comment on only. Not window-class.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, label, description,
   set_by, basis, review_due, overridable_by, override_direction, propagation, public_read, ui)
values
  ('custom', 'table_sync_rows_max', '20000'::jsonb, '20000'::jsonb, 'integer',
   'Most rows one sheet refresh may carry',
   'The ceiling on the rows custom.table_sync writes in one transaction (a Google Sheet tab refresh). Past it the importer refreshes in parts.',
   'agent', 'Lane GRID-PRIMITIVES 2026-09-23: a working sheet is a few thousand rows; twenty thousand is one refresh of a large one.',
   date '2026-12-23', '{organization}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create function custom.table_sync(p_organization_id uuid, p_home_id uuid, p_spec jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_src      jsonb := p_spec -> 'source';
  v_system   text;
  v_table    uuid;
  v_created  boolean := false;
  v_col      text;
  v_key      text;
  v_keys     jsonb := '{}'::jsonb;      -- header -> field key
  v_added    integer := 0;
  v_row      jsonb;
  v_vals     jsonb;
  v_rid      uuid;
  v_ins      integer := 0;
  v_upd      integer := 0;
  v_arch     integer := 0;
  v_seen     text[] := '{}';
  v_max      integer := coalesce((platform.knob_resolve('custom', 'table_sync_rows_max', p_organization_id) #>> '{}')::integer, 20000);
  v_old      record;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_sync');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_sync');

  if jsonb_typeof(v_src) is distinct from 'object' or nullif(v_src ->> 'provider', '') is null
     or nullif(v_src ->> 'external_id', '') is null then
    raise exception 'A synced table says where it comes from: a provider and the source''s own id.'
      using errcode = '22023', hint = 'spec.source = {"provider": "google_sheets", "external_id": "<sheet id>", "tab_id": "<tab>"}. Nothing was written.';
  end if;
  if jsonb_typeof(p_spec -> 'columns') is distinct from 'array' or jsonb_array_length(p_spec -> 'columns') = 0 then
    raise exception 'A synced table needs the source''s columns.' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_spec -> 'rows', '[]'::jsonb)) > v_max then
    raise exception 'This refresh carries % rows; one refresh carries at most %.', jsonb_array_length(p_spec -> 'rows'), v_max
      using errcode = '54000', hint = 'Refresh in parts. The ceiling is the organization knob custom/table_sync_rows_max. Nothing was written.';
  end if;
  v_system := format('sync:%s:%s:%s', v_src ->> 'provider', v_src ->> 'external_id', coalesce(v_src ->> 'tab_id', ''));

  -- 1 — the Table, found again by its source.
  select t.id into v_table from custom.record t
   where t.organization_id = p_organization_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null
     and t.data -> 'sync_source' ->> 'provider' = v_src ->> 'provider'
     and t.data -> 'sync_source' ->> 'external_id' = v_src ->> 'external_id'
     and coalesce(t.data -> 'sync_source' ->> 'tab_id', '') = coalesce(v_src ->> 'tab_id', '')
   limit 1;
  if v_table is null then
    v_key := regexp_replace(lower(btrim(p_spec -> 'columns' ->> 0)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
    v_table := custom.table_declare(p_organization_id, jsonb_build_object(
      'name', coalesce(nullif(btrim(p_spec ->> 'table_name'), ''), 'Synced sheet'),
      'slug', 'sync_' || left(md5(v_system), 12),
      'type', 'entity', 'display', 'list', 'weight', 'light', 'ordered', true, 'row_order', 'sorted',
      'label_singular', 'Row', 'label_plural', 'Rows', 'title_field', v_key,
      'agent_writable', true, 'retention_days', 3650,
      'default_sort', jsonb_build_array(jsonb_build_object('field', v_key, 'direction', 'asc')),
      'parent_id', p_home_id::text,
      'fields', jsonb_build_array(jsonb_build_object('name', v_key))));
    v_created := true;
  else
    perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.table_sync',
                                            'editor'::public.permission_level, 'table');
  end if;
  update custom.record set data = jsonb_set(data, '{sync_source}', v_src, true)
   where organization_id = p_organization_id and id = v_table and table_id = custom.table_kernel_id();

  -- 2 — the source's columns. A column the person added here is never touched.
  for v_col in select jsonb_array_elements_text(p_spec -> 'columns') loop
    v_key := regexp_replace(lower(btrim(v_col)), '[^a-z0-9]+', '_', 'g');
    v_key := regexp_replace(v_key, '^_+|_+$', '', 'g');
    if v_key !~ '^[a-z]' then v_key := 'f_' || v_key; end if;
    v_key := left(v_key, 48);
    v_keys := v_keys || jsonb_build_object(v_col, v_key);
    if not exists (select 1 from custom.record f
                    where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
                      and f.data_class = 'field' and f.deleted_at is null
                      and f.data ->> 'entity_definition_id' = v_table::text and f.data ->> 'key' = v_key
                      and not coalesce((f.data ->> 'declared_with_table')::boolean, false)) then
      perform custom.field_declare(p_organization_id, v_table, jsonb_build_object(
        'key', v_key, 'label', btrim(v_col), 'type', 'text', 'source', 'synced'));
      v_added := v_added + 1;
    end if;
  end loop;

  -- 3 — every row, found again by its reference.
  for v_row in select e from jsonb_array_elements(coalesce(p_spec -> 'rows', '[]'::jsonb)) e loop
    if nullif(v_row ->> 'ref', '') is null then
      raise exception 'A synced row says which row of the source it is.' using errcode = '22023',
        hint = 'rows[].ref is the source''s own row reference. Nothing was written.';
    end if;
    v_seen := v_seen || (v_row ->> 'ref');
    select coalesce(jsonb_object_agg(v_keys ->> k, x.v), '{}'::jsonb) into v_vals
      from jsonb_each(coalesce(v_row -> 'values', '{}'::jsonb)) x(k, v)
     where v_keys ? x.k;
    select r.id into v_rid from custom.record r
     where r.organization_id = p_organization_id and r.table_id = v_table and r.data_class = 'record'
       and r.deleted_at is null and r.metadata ->> 'source_system' = v_system
       and r.metadata ->> 'source_id' = v_row ->> 'ref'
     limit 1;
    if v_rid is null then
      v_rid := custom.record_write(p_organization_id, v_table, v_vals);
      update custom.record set metadata = coalesce(metadata, '{}'::jsonb)
                                          || jsonb_build_object('source_system', v_system, 'source_id', v_row ->> 'ref')
       where organization_id = p_organization_id and id = v_rid;
      v_ins := v_ins + 1;
    else
      perform custom.record_update(p_organization_id, v_rid, v_vals);
      v_upd := v_upd + 1;
    end if;
  end loop;

  -- 4 — a row gone from the source is ARCHIVED, never destroyed: somebody may have written a
  --     note against it, and custom.record_restore brings it back.
  for v_old in
    select r.id from custom.record r
     where r.organization_id = p_organization_id and r.table_id = v_table and r.data_class = 'record'
       and r.deleted_at is null and r.metadata ->> 'source_system' = v_system
       and not ((r.metadata ->> 'source_id') = any (v_seen))
  loop
    perform custom.record_delete(p_organization_id, v_old.id);
    v_arch := v_arch + 1;
  end loop;

  return jsonb_build_object('table_id', v_table, 'created', v_created, 'fields_added', v_added,
    'rows_inserted', v_ins, 'rows_updated', v_upd, 'rows_archived', v_arch, 'source_system', v_system);
end
$fn$;

comment on function custom.table_sync(uuid, uuid, jsonb) is
  'GRID-PRIMITIVES G10: refresh one synced source (a Google Sheet tab) as ONE record-store Table in one transaction — found again by its sync_source, the source''s columns added (a column made here is never touched), each row found again by its reference (metadata source_system / source_id) and updated or inserted, a row gone from the source archived, never destroyed. Every write through the store''s own doors.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_sync', 'p_organization_id uuid, p_home_id uuid, p_spec jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach first. A new Table is made through custom.table_declare (which judges p_home_id as the parent the caller may place it in); an existing one is asked custom.assert_client_may_change at editor before anything changes; every column, row and archive goes through custom.field_declare, record_write, record_update and record_delete, which decide for themselves. It reads and writes only this organization''s one Table the source names.',
        'gridprim_a_synced_sheet_is_one_table_that_refreshes.sql', null, true, false,
        jsonb_build_object('version', 1, 'declared_by', 'gridprim_a_synced_sheet_is_one_table_that_refreshes.sql',
          'declared_at', '2026-09-23 lane GRID-PRIMITIVES',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-23 lane GRID-PRIMITIVES — written with this body'),
            'p_home_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'passed only to custom.table_declare as parent_id, which decides whether the caller may place a table there.',
              'foreign', jsonb_build_object('sqlstate', '23514', 'same_as_invented', true),
              'verified', '2026-09-23 lane GRID-PRIMITIVES — written with this body'))))
on conflict do nothing;
