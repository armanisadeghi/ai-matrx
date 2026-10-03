-- chair-step: replaces three bodies (same signatures, security and grants): custom.table_sync (an outside-database source is refused from the client channel; one sync per source at a time; a refresh never duplicates an archived row; its own writes to the Table it syncs are marked transaction-locally; a column may carry a type — number, datetime, boolean), custom._field_write_door (a person's change to a Field with source 'synced', or a new row in a Table carrying sync_source, is refused 42501 in one sentence unless custom.table_sync is the writer), custom.data_home (each Table row gains synced_from). No table, column, trigger, policy, grant or row is touched. 0 synced Tables exist on production when written.
-- lane: VISION-REACH
-- based-on: custom.table_sync(uuid, uuid, jsonb) 1c219ebf7bb4a487d9fe350730ef970d7bead45c34d52e3839ca58d68f263a59
-- based-on: custom._field_write_door() 18767a20a010dbf4d95ff422aab462e5d1a47d8e57a18ac0538b225337dffd50
-- based-on: custom.data_home(uuid, text, boolean) 95c9f68104f80a88d2f97b4060106f9fb5b2f35c96738b83a07efe73ebc0c4c7
--
-- LANE 5 VISION-REACH, WAVE 3 — ONE OUTSIDE POSTGRES TABLE, READ-ONLY, WITH A SCREEN.
-- The person pastes a connection string on /data-v2/connect; the server (aidream
-- services/external_databases) tests it, keeps it SEALED in the organization's vault, reads the
-- picked table read-only and lands it through the live G10 door custom.table_sync (provider
-- 'postgres', external_id = the vault item id, tab_id = schema.table). This file makes that Table
-- honest: its synced columns and rows have one writer (the sync), the grid's refusal is one
-- sentence, and the data home can badge it Synced.
-- Inverse: migrations/inverse/visionreach_w6_an_outside_table_is_synced_and_read_only_down.sql

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

CREATE OR REPLACE FUNCTION custom._field_write_door()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me    uuid := auth.uid();
  v_level public.permission_level;
  v_key   text;
  v_field custom.record;
  v_old   jsonb := coalesce(case when tg_op = 'UPDATE' then old.data end, '{}'::jsonb);
  v_syncing boolean;
  v_synced  text;
begin
  -- THE FINAL SWITCH NEVER DEPENDS ON WHO PRESSED IT (PRESS-FENCE C): platform.final_switch_acting().
  if platform.final_switch_acting() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  -- WHO THIS SKIPS, AND WHY IT IS NOT THE ROLE. Every write door into this store is
  -- SECURITY DEFINER and every server lane runs as the role that OWNS custom.record, so a
  -- role test here would skip the only write path that exists and DOOR-3 would be a law
  -- nothing ever enforced. What matters is whether a PERSON is being acted for: when the
  -- request carries one, that person's field-level security binds the write, whichever
  -- door and whichever role it arrived through. A write carrying no person at all is the
  -- store's own housekeeping and has no field-level answer to give.
  if v_me is null then
    return new;
  end if;
  if new.table_id is null or new.table_id = custom.field_kernel_id() then
    return new;
  end if;

  -- CREATING is not editing somebody else's field. `platform._stamp_actor` has already run
  -- (it sorts ahead of this trigger), so `created_by` is the person, and VIS-25 makes the
  -- creator the owner and therefore the top level on what they just made. Without this arm
  -- nobody could ever write a confidential field's first value, including its author — and
  -- it is also why the ladder below is only ever asked about a row that already exists.
  -- SYNCED FROM OUTSIDE (lane VISION-REACH wave 3, REC-N-11 read-only first). A Table carrying
  -- sync_source (an outside database or a sheet tab) gets its rows and its synced columns from
  -- custom.table_sync alone, which marks its own writes to that Table transaction-locally. Anybody
  -- else — the grid, an import, an agent, the API — may add columns of their own and fill those,
  -- never add a row or change a synced value. Asked once per Table per statement (the memo).
  v_syncing := coalesce(current_setting('app.table_sync_writing', true), '') = new.table_id::text;
  if tg_op = 'INSERT' and new.data_class = 'record' and not v_syncing then
    v_synced := platform.memo_k_get('synced:' || new.table_id::text);
    if v_synced is null then
      select case when t.data ? 'sync_source' then '1' else '0' end into v_synced
        from custom.record t
       where t.organization_id = new.organization_id and t.id = new.table_id
         and t.table_id = custom.table_kernel_id();
      v_synced := coalesce(v_synced, '0');
      perform platform.memo_k_put('synced:' || new.table_id::text, v_synced);
    end if;
    if v_synced = '1' then
      raise exception 'This table''s rows are synced from outside AI Matrx, so a row can''t be added here.'
        using errcode = '42501',
              hint = 'Add the row where it lives, then press Refresh on the table. Nothing was written.';
    end if;
  end if;

  if tg_op = 'INSERT' and new.created_by = v_me then
    return new;
  end if;

  -- THE ONE LADDER'S LEVEL FORM. This used to be `iam.effective_level`, which is arm 2 of
  -- the one function rather than the one function: it cannot see the store's own carrying,
  -- so a person admitted to this record THROUGH its Table was masked out of every field on
  -- it. `custom.effective_level` is the same question the read door asks, so the fields a
  -- person may change are decided on the ladder that decided they may be here at all.
  v_level := custom.effective_level(v_me, new.organization_id, new.id, 'record');

  for v_key in
    select e.key from jsonb_each(coalesce(new.data, '{}'::jsonb)) e
     where left(e.key, 1) <> '_'
       and (v_old -> e.key) is distinct from e.value
  loop
    select f.* into v_field
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = new.table_id
       and f.data ->> 'key' = v_key;
    if not found then continue; end if;

    if v_field.data ->> 'source' = 'synced' and not v_syncing then
      raise exception '"%" is synced from outside AI Matrx, so it can''t be changed here.',
                      coalesce(v_field.data ->> 'label', v_key)
        using errcode = '42501',
              hint = 'Change it where it lives and press Refresh, or add a column of your own beside it. Nothing was written.';
    end if;

    if not iam.may_touch_field(v_me, v_field.id, new.organization_id, v_level, 'edit') then
      raise exception 'You can see this record, but "%" is not yours to change.',
                      coalesce(v_field.data ->> 'label', v_key)
        using errcode = '42501',
              hint = 'DOOR-3: the store refuses an edit to a field you may not edit, whichever door you came through. '
                     || 'It would take ' || iam.level_label('record',
                          iam.field_sensitivity_level(v_field.data ->> 'sensitivity', 'edit', new.organization_id))
                     || ', or a share of this one field with you.';
    end if;
  end loop;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.data_home(p_organization_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_include_app_tables boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- THE DATA HOME IN ONE CALL (lane DATA-HOME-2, chair ruling 2026-09-29). The page asked three doors —
-- custom.data_home_tables, custom.data_home_items, custom.data_home_changed_by — and each paid the
-- walk of which Tables she may open (custom.tables_seen_once_per_group). This door asks the walk ONCE, for all
-- the person's organizations (or the one named), and then calls those three doors in this same
-- statement: each finds its organizations already answered in the statement memo and does not walk
-- them again. The rows are therefore the three doors' own, unchanged:
--   tables      = custom.data_home_tables(p_organization_id), every column
--   items       = custom.data_home_items(p_organization_id), every column
--   changed_by  = custom.data_home_changed_by(asks) where asks names, per organization, every row
--                 the page shows who-changed-it for: Tables and dashboards, digests, checklists and
--                 boards as 'structure', forms and booking pages as 'form', portals as 'portal'
--                 (outside shares have none), at most 500 ids an ask and 200 asks a call.
-- SEARCHED (lane DATA-HOME-3B, 2026-10-01): p_search narrows those same rows to the ones that match and
-- ranks them (see the campaign file's header); unsearched, nothing below the walk changes.
-- APP TABLES (lane CHAIR-DOORS-2, v6 N-C8, 2026-10-02): a Table the app keeps out of every default
-- list (custom.table_kept_out_of_lists — today the outputs an agent lands, kept_for agent_output) is
-- not among the tables unless p_include_app_tables is true — the page's "Show app tables" switch.
-- It is handed to custom.data_home_tables as is; it narrows, never widens, and searched rows obey it.
declare
  v_me      uuid := custom.query_principal();
  v_q       text := nullif(btrim(coalesce(p_search, '')), '');
  v_qid     uuid;
  v_tables  jsonb;
  v_items   jsonb;
  v_asks    jsonb;
  v_changed jsonb := '[]'::jsonb;
  v_part    jsonb;
  v_n       integer;
  v_i       integer := 0;
begin
  -- THE DOOR DECIDES, FIRST, IN ITS OWN NAME: an organization named is one the caller may reach, or
  -- the call is refused here, naming this door. Named nobody, the doors below admit only
  -- organizations the caller reaches.
  if p_organization_id is not null then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.data_home');
  end if;
  if v_q is not null and length(v_q) > 200 then
    raise exception 'custom.data_home searches at most 200 characters; this search has %.', length(v_q)
      using errcode = '22023', hint = 'Search for a shorter phrase. Nothing was read.';
  end if;
  if v_me is null then
    return jsonb_build_object('tables', '[]'::jsonb, 'items', '[]'::jsonb, 'changed_by', '[]'::jsonb);
  end if;

  -- THE ONE WALK, for every organization of hers at once (the same organizations the three doors ask).
  perform count(*)
     from custom.tables_seen_once_per_group(v_me, array(
            select m.organization_id
              from iam.organization_member m
              join iam.organizations o on o.id = m.organization_id and o.archived_at is null
             where m.user_id = v_me
               and (p_organization_id is null or m.organization_id = p_organization_id)));

  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_tables
    from custom.data_home_tables(p_organization_id, p_include_app_tables) t;
  select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) into v_items
    from custom.data_home_items(p_organization_id) i;

  if v_q is not null then
    -- A WHOLE ID PASTED IN finds its row outright; any shorter run of hex never matches an id.
    if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      v_qid := v_q::uuid;
    end if;

    -- THE TABLES SHE MAY OPEN (above), ranked on title, description and Fields.
    with t as (
      select e as row_, (e ->> 'table_id')::uuid as id, (e ->> 'organization_id')::uuid as org,
             coalesce(e ->> 'table_name', '') as nm, (e ->> 'updated_at')::timestamptz as at
        from jsonb_array_elements(v_tables) e
    ), d as (
      -- the Table's own description, read from the very Table record listed above
      select r.id, nullif(btrim(r.data ->> 'description'), '') as descr
        from t
        join custom.record r
          on r.organization_id = t.org
         and r.id = t.id
         and r.table_id = custom.table_kernel_id()
    ), f as (
      -- its live Fields (custom.applicable_fields' own rule: data.entity_definition_id = the Table)
      select (fr.data ->> 'entity_definition_id') as tid,
             array_agg(coalesce(nullif(btrim(fr.data ->> 'label'), ''), fr.data ->> 'key')
                       order by (fr.data ->> 'sort') nulls last, fr.id) as labels,
             array_agg(coalesce(fr.data ->> 'key', '') order by (fr.data ->> 'sort') nulls last, fr.id) as keys
        from custom.record fr
       where fr.organization_id = any (array(select distinct t.org from t))
         and fr.table_id = custom.field_kernel_id()
         and fr.deleted_at is null
         and (fr.data ->> 'entity_definition_id') in (select t.id::text from t)
       group by 1
    ), s as (
      select t.row_, t.nm, t.at, d.descr, f.labels, f.keys,
             public.mtx_search_score(v_q, case when v_qid is not null then t.id end, t.nm, d.descr,
                                     null, null, coalesce(f.labels, '{}'), coalesce(f.keys, '{}')) as rank,
             (v_qid is not null and t.id = v_qid) as by_id
        from t
        left join d on d.id = t.id
        left join f on f.tid = t.id::text
    ), hit as (
      select s.*,
             case
               when s.by_id then 'id'
               when public.mtx_search_score(v_q, null, s.nm, null, null, null) > 0 then 'name'
               when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0 then 'description'
               when public.mtx_search_score(v_q, null, null, null, null, null, coalesce(s.labels, '{}'), coalesce(s.keys, '{}')) > 0 then 'field'
               -- several words spread over title, description and Fields: say where the first word is
               when position(split_part(lower(v_q), ' ', 1) in lower(s.nm)) > 0 then 'name'
               when position(split_part(lower(v_q), ' ', 1) in lower(coalesce(s.descr, ''))) > 0 then 'description'
               else 'field'
             end as matched_in
        from s
       where s.rank > 0
    )
    select coalesce(jsonb_agg(
             h.row_ || jsonb_build_object(
               'match_rank', h.rank,
               'matched_in', h.matched_in,
               'matched_field', case when h.matched_in = 'field' then
                  (select coalesce(l.label, k.key)
                     from unnest(coalesce(h.labels, '{}')) with ordinality as l(label, o)
                     full join unnest(coalesce(h.keys, '{}')) with ordinality as k(key, o) using (o)
                    where position(split_part(lower(v_q), ' ', 1) in lower(coalesce(l.label, ''))) > 0
                       or position(split_part(lower(v_q), ' ', 1) in lower(coalesce(k.key, ''))) > 0
                    -- the Field that holds the whole search first, then the first that holds its first word
                    order by (position(lower(v_q) in lower(coalesce(l.label, ''))) > 0) desc,
                             (position(lower(v_q) in lower(coalesce(k.key, ''))) > 0) desc,
                             o
                    limit 1) end)
             order by h.rank desc, length(h.nm), h.at desc nulls last, h.nm), '[]'::jsonb)
      into v_tables
      from hit h;

    -- THE REST THE HOME LISTS (forms, booking pages, portals, dashboards, digests, checklists,
    -- automations, outside shares), ranked on their own title and description.
    with i as (
      select e as row_,
             coalesce(e -> 'item_row' ->> 'title', e -> 'item_row' ->> 'name', e -> 'item_row' ->> 'label', '') as nm,
             nullif(btrim(e -> 'item_row' ->> 'description'), '') as descr,
             (e ->> 'item_id')::uuid as id
        from jsonb_array_elements(v_items) e
    ), s as (
      select i.*,
             public.mtx_search_score(v_q, case when v_qid is not null then i.id end, i.nm, i.descr, null, null) as rank,
             (v_qid is not null and i.id = v_qid) as by_id
        from i
    )
    select coalesce(jsonb_agg(
             s.row_ || jsonb_build_object(
               'match_rank', s.rank,
               'matched_in', case when s.by_id then 'id'
                                  when public.mtx_search_score(v_q, null, null, s.descr, null, null) > 0
                                   and public.mtx_search_score(v_q, null, s.nm, null, null, null) = 0 then 'description'
                                  else 'name' end,
               'matched_field', null)
             order by s.rank desc, length(s.nm), s.nm), '[]'::jsonb)
      into v_items
      from s
     where s.rank > 0;
  end if;

  -- THE MAKER, BY NAME (lane DATA-HOME-3B2, 2026-10-01). Every Table row gains created_by_name: the
  -- name custom.history_people gives its maker (created_by) in the Table's own organization — the
  -- same door that names who changed a row on this page (custom.hub_changed_by), so Owner and
  -- Changed by never disagree about a person's name. Only a member of that organization is named;
  -- a maker who is not one (left, or never was) is null and the page shows its dash. One
  -- history_people call per organization, after any search narrowing; row order is kept.
  with mk as (
    select (e ->> 'organization_id')::uuid as org, array_agg(distinct (e ->> 'created_by')::uuid) as ids
      from jsonb_array_elements(v_tables) e
     where e ->> 'created_by' is not null
     group by 1
  ), people as materialized (
    -- asked once per organization (materialized: never once per row)
    select mk.org, custom.history_people(mk.org, mk.ids) as m from mk
  )
  -- SYNCED FROM (lane VISION-REACH wave 3): every Table row also says where it syncs from — the
  -- provider of its sync_source ('postgres' for an outside database, 'google_sheets' for a sheet
  -- tab), null for a table of our own — read from the very Table record listed, so the home can
  -- badge it Synced.
  select coalesce(jsonb_agg(t.e || jsonb_build_object('created_by_name', p.m #>> array[t.e ->> 'created_by', 'name'],
                                                      'synced_from', tr.data -> 'sync_source' ->> 'provider')
                  order by t.o), '[]'::jsonb)
    into v_tables
    from jsonb_array_elements(v_tables) with ordinality as t(e, o)
    left join people p on p.org = (t.e ->> 'organization_id')::uuid
    left join custom.record tr
      on tr.organization_id = (t.e ->> 'organization_id')::uuid
     and tr.id = (t.e ->> 'table_id')::uuid
     and tr.table_id = custom.table_kernel_id();

  with ids as (
    select x.organization_id as org, 'structure'::text as k, x.table_id as id
      from jsonb_to_recordset(v_tables) as x(organization_id uuid, table_id uuid)
    union
    select x.organization_id,
           case x.kind when 'form' then 'form' when 'booking' then 'form' when 'portal' then 'portal'
                       else 'structure' end,
           x.item_id
      from jsonb_to_recordset(v_items) as x(kind text, organization_id uuid, item_id uuid)
     where x.kind <> 'share'
  ), chunked as (
    select org, k, id, (row_number() over (partition by org, k order by id) - 1) / 500 as c from ids
  )
  select jsonb_agg(jsonb_build_object('organization_id', org, 'kind', k, 'ids', ids) order by org, k, c)
    into v_asks
    from (select org, k, c, jsonb_agg(id order by id) as ids from chunked group by org, k, c) q;

  v_n := coalesce(jsonb_array_length(v_asks), 0);
  while v_i < v_n loop
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_part
      from custom.data_home_changed_by(
             (select jsonb_agg(e order by o) from jsonb_array_elements(v_asks) with ordinality as a(e, o)
               where o > v_i and o <= v_i + 200)) c;
    v_changed := v_changed || v_part;
    v_i := v_i + 200;
  end loop;

  if v_q is null then
    return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed);
  end if;
  return jsonb_build_object('tables', v_tables, 'items', v_items, 'changed_by', v_changed, 'search', v_q);
end;
$function$
;
