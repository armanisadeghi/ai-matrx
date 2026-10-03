-- chair-step: undo visionreach_w7_read_only_includes_delete_and_refresh_repairs.sql — restores custom.table_sync and custom.record_delete as production held them before it. Reopens: a person may archive a synced row from any door, and a refresh leaves an archived row archived although the outside table still has it; the answer loses rows_restored / rows_total / warnings. Same signatures, security and grants; no table, column, trigger, policy, grant or row is touched.
-- lane: VISION-REACH
-- based-on: custom.table_sync(uuid, uuid, jsonb) c0313689522ed77a6e791d1d32a06b8c839f79bce1edef95e03dcaa8b41e8109
-- based-on: custom.record_delete(uuid, uuid) 3462f96414879daa0435878bb1b82fe12c5358d22c6671e2af4cfeaf0f6a9a11

CREATE OR REPLACE FUNCTION custom.table_sync(p_organization_id uuid, p_home_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_have     jsonb;
  v_hit      jsonb;
  v_kept     integer := 0;
  v_cspec    jsonb;
  v_type     text;
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

  -- AN OUTSIDE DATABASE IS SYNCED BY THE SERVER ONLY (lane VISION-REACH wave 3). Its rows come from
  -- a connection held sealed in the vault, read by the server; a client sending them would be
  -- writing "outside" values of its own choosing into columns nobody may edit. A sheet tab is still
  -- synced from a client (records grid.ts sheetSyncSpec), so this is the postgres provider only.
  if v_src ->> 'provider' = 'postgres' and platform.is_client_channel() then
    raise exception 'A table synced from an outside database is refreshed by AI Matrx, not from here.'
      using errcode = '42501', hint = 'Press Refresh on the table. Nothing was written.';
  end if;
  -- ONE SYNC OF ONE SOURCE AT A TIME: two people opening the table together must not both add the
  -- same new rows (this door looks rows up, then writes them).
  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || '|' || v_system, 0));

  -- 1 — the Table, found again by its source.
  select t.id into v_table from custom.record t
   where t.organization_id = p_organization_id and t.table_id = custom.table_kernel_id()
     and t.data_class = 'table' and t.deleted_at is null
     and t.data -> 'sync_source' ->> 'provider' = v_src ->> 'provider'
     and t.data -> 'sync_source' ->> 'external_id' = v_src ->> 'external_id'
     and coalesce(t.data -> 'sync_source' ->> 'tab_id', '') = coalesce(v_src ->> 'tab_id', '')
   limit 1;
  if v_table is null then
    -- a column is its name, or {name, type, config} (VISION-REACH wave 3: an outside database's types)
    v_key := regexp_replace(lower(btrim(coalesce(p_spec -> 'columns' -> 0 ->> 'name', p_spec -> 'columns' ->> 0))), '[^a-z0-9]+', '_', 'g');
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
  -- THE ONE WRITER OF SYNCED COLUMNS. custom._field_write_door refuses every other change to a Field
  -- with source 'synced' and every new row of a synced Table; this door's own writes to THIS Table
  -- pass. Transaction-local, set here and cleared before returning; set_config is no client door.
  perform set_config('app.table_sync_writing', v_table::text, true);

  -- 2 — the source's columns. A column the person added here is never touched.
  for v_cspec in select e from jsonb_array_elements(p_spec -> 'columns') e loop
    -- A column is its name (a sheet) or {name, type, config} (an outside database): number, datetime and
    -- boolean keep their type so the store can add, sort and date them; anything else is text.
    v_col := case when jsonb_typeof(v_cspec) = 'object' then v_cspec ->> 'name' else v_cspec #>> '{}' end;
    v_type := case when jsonb_typeof(v_cspec) = 'object' and v_cspec ->> 'type' in ('number', 'datetime', 'boolean')
                   then v_cspec ->> 'type' else 'text' end;
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
        'key', v_key, 'label', btrim(v_col), 'type', v_type, 'source', 'synced')
        || case when jsonb_typeof(v_cspec -> 'config') = 'object'
                then jsonb_build_object('config', v_cspec -> 'config') else '{}'::jsonb end);
      v_added := v_added + 1;
    end if;
  end loop;

  -- 3 — every row, found again by its reference (read once: a lookup per row is quadratic).
  select coalesce(jsonb_object_agg(q.ref, jsonb_build_object('id', q.id, 'archived', q.archived)), '{}'::jsonb)
    into v_have
    from (select distinct on (r.metadata ->> 'source_id') r.metadata ->> 'source_id' as ref, r.id,
                 (r.deleted_at is not null) as archived
            from custom.record r
           where r.organization_id = p_organization_id and r.table_id = v_table and r.data_class = 'record'
             and r.metadata ->> 'source_system' = v_system
           order by r.metadata ->> 'source_id', r.deleted_at nulls first, r.created_at) q;
  for v_row in select e from jsonb_array_elements(coalesce(p_spec -> 'rows', '[]'::jsonb)) e loop
    if nullif(v_row ->> 'ref', '') is null then
      raise exception 'A synced row says which row of the source it is.' using errcode = '22023',
        hint = 'rows[].ref is the source''s own row reference. Nothing was written.';
    end if;
    v_seen := v_seen || (v_row ->> 'ref');
    select coalesce(jsonb_object_agg(v_keys ->> k, x.v), '{}'::jsonb) into v_vals
      from jsonb_each(coalesce(v_row -> 'values', '{}'::jsonb)) x(k, v)
     where v_keys ? x.k;
    v_hit := v_have -> (v_row ->> 'ref');
    v_rid := (v_hit ->> 'id')::uuid;
    if v_rid is not null and (v_hit ->> 'archived')::boolean then
      -- ARCHIVED STAYS ARCHIVED: somebody archived this row (or the source dropped it once). A
      -- refresh never makes a second copy of it beside the archived one; Restore brings it back.
      v_kept := v_kept + 1;
    elsif v_rid is null then
      v_rid := custom.record_write(p_organization_id, v_table, v_vals);
      update custom.record set metadata = coalesce(metadata, '{}'::jsonb)
                                          || jsonb_build_object('source_system', v_system, 'source_id', v_row ->> 'ref')
       where organization_id = p_organization_id and id = v_rid;
      v_have := v_have || jsonb_build_object(v_row ->> 'ref', jsonb_build_object('id', v_rid, 'archived', false));
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

  perform set_config('app.table_sync_writing', '', true);
  return jsonb_build_object('table_id', v_table, 'created', v_created, 'fields_added', v_added,
    'rows_inserted', v_ins, 'rows_updated', v_upd, 'rows_archived', v_arch, 'rows_kept_archived', v_kept,
    'source_system', v_system);
end
$function$
;


CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
  v_first boolean;
  v_depth integer;
  v_prev  text;
  -- STORE-TAILS-3: THE ARCHIVE EVENT this call belongs to, and what it took.
  v_event     uuid;
  v_own_event boolean := false;
  v_took      uuid[];
  v_class     text;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- HOW DEEP THIS HAS GONE. A cascade that nests past 64 is a cycle somebody built, and
  -- saying so beats recursing until the server runs out of stack.
  v_depth := coalesce(nullif(current_setting('custom.delete_depth', true), '')::integer, 0);
  if v_depth > 64 then
    raise exception 'this delete reaches through more than 64 levels of containment, which is a loop rather than a hierarchy'
      using errcode = '54001',
            hint = 'REC-12: something contains one of its own containers. Break that link and delete again.';
  end if;

  -- STORE-TAILS-3: THE TOP OF ONE ARCHIVE. Everything this call and its cascade take is written
  -- down, in order, so the restore can bring back exactly this set. A Table's archive opens its
  -- event HERE, before the first row moves, so every History version this statement writes
  -- carries the event's id; `custom.table_archive` opens one for all of its chunks and says so
  -- in `custom.archive_event`.
  if v_depth = 0 then
    perform set_config('custom.archive_took', '', true);
    v_event := nullif(current_setting('custom.archive_event', true), '')::uuid;
    select r.data_class into v_class
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
    if v_event is null
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_record_id
                      and r.table_id = custom.table_kernel_id() and r.data_class <> 'kernel'
                      and r.deleted_at is null) then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   'STORE-TAILS-3: a table archived as one unit — its fields, saved views, rules and records with it; restoring the table brings back exactly this set.');
      v_own_event := true;
    end if;
  end if;
  perform set_config('custom.delete_depth', (v_depth + 1)::text, true);

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a Table whose fields something outside still reads, a
  -- relation set to refuse), detaches the set_null edges, and hands back everything this
  -- delete has to take with it.
  v_plan  := custom.delete_rule(p_organization_id, p_record_id, true);
  v_first := coalesce((v_plan ->> 'contents_first')::boolean, false);

  -- A TABLE FIRST TAKES WHAT IS IN IT. Its records, its saved views, its Rules and then its
  -- Fields all go while the Table is still there, so every guard on custom.record still has
  -- the Table and the Fields it validates against in front of it. Nothing is switched off.
  if v_first then
    -- THE WHOLE SET, SAID OUT LOUD BEFORE THE FIRST ROW GOES. REC-18 refuses a Field something
    -- still reads; inside this table, what reads it is going too, so it is not something that
    -- still reads it. Transaction-local, and put back exactly as it was afterwards.
    v_prev := coalesce(current_setting('custom.delete_set', true), '');
    perform set_config('custom.delete_set',
      v_prev || ',' || p_record_id::text || ',' ||
      coalesce((select string_agg(x #>> '{}', ',')
                  from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x), ''),
      true);
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if v_child <> p_record_id
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
    perform set_config('custom.delete_set', v_prev, true);
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no such record in this organization.' using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;

  -- STORE-TAILS-3: this row is part of what this archive took, in the order it went.
  perform set_config('custom.archive_took',
                     coalesce(current_setting('custom.archive_took', true), '') || p_record_id::text || ',',
                     true);

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  if not v_first then
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
  end if;

  perform set_config('custom.delete_depth', v_depth::text, true);

  -- STORE-TAILS-3: THE BOTTOM OF ONE ARCHIVE. Write down what it took. A single row that took
  -- nothing with it needs no event (bringing it back was always exact); anything more — a table,
  -- a record that took what it contained, a row archived inside a table's chunked archive —
  -- is written to its event, each row with the exact moment it was archived.
  if v_depth = 0 then
    v_took := coalesce(string_to_array(rtrim(coalesce(current_setting('custom.archive_took', true), ''), ','), ',')::uuid[],
                       '{}'::uuid[]);
    perform set_config('custom.archive_took', '', true);
    if v_event is null and cardinality(v_took) > 1 then
      v_event := history.migration_record(p_organization_id, 'archive', coalesce(v_class, 'record'), p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   format('STORE-TAILS-3: archived with %s row(s) it contained or cascaded to; restoring it brings back exactly this set.',
                          cardinality(v_took) - 1));
      v_own_event := true;
    end if;
    if v_event is not null and cardinality(v_took) > 0 then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'also', coalesce(m.inverse -> 'also', '[]'::jsonb)
                       || coalesce((select jsonb_agg(t.x::text order by t.o)
                                      from unnest(v_took) with ordinality as t(x, o)
                                     where t.x::text is distinct from m.inverse ->> 'record_id'), '[]'::jsonb),
               'took', coalesce(m.inverse -> 'took', '[]'::jsonb)
                       || (select jsonb_agg(jsonb_build_array(t.x::text, v_at) order by t.o)
                             from unnest(v_took) with ordinality as t(x, o)),
               'open', case when v_own_event then 'false'::jsonb else coalesce(m.inverse -> 'open', 'true'::jsonb) end,
               'archived_at', case when v_own_event then to_jsonb(v_at) else m.inverse -> 'archived_at' end)
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;
  return v_at;
end
$function$

;
