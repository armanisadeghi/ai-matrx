-- chair-step: lane OLDER-DOORS-AFTER-SWITCH. After an owner presses Data tables → new system the older tables are archived, but the older doors ignored deleted_at: any client calling them directly (the older grid, the server's dataset tool, the extension, workflow steps, imports) could still read AND WRITE a table nothing reads any more; and the press left the organization's older pick lists live beside their copies. ADDS workbench.older_table_moved_to(uuid) (the mark an older read carries: the copy's address and one sentence), the private platform._older_list_moved_by_switch(uuid), the trigger workbench._moved_older_table_takes_no_writes on udt_datasets, udt_dataset_rows, udt_dataset_fields, udt_dataset_row_versions, udt_structured_lists and udt_structured_list_items (a moved older table or list refuses every write from every door, naming its copy; Switch back lifts it), and the switch's own list doors workbench.udt_structured_list_archive / _unarchive. REPLACES platform._cutover_seam_apply (the press archives the older pick lists with the same pointer; Switch back restores them — same transaction) and the older reads public.get_full_table, public.get_user_table_data_paginated_v2, public.get_user_table_data_paginated, public.get_user_table_complete, public.get_user_list_with_items, public._d31_impl_get_user_list_with_items, public.get_structured_list_for_selection (same rows, plus moved_to), and the two older row-update doors public.update_data_row_in_user_table and public.udt_upsert_row (a patch MERGES into the row instead of replacing it — VERIFIER-26 watched a one-cell patch wipe a row's other cells).
-- based-on: public.get_full_table(jsonb) e1ced80eaa3580041065877b107db1240c005172aae9f414f8844d1add6277ff
-- based-on: public.get_user_table_data_paginated_v2(uuid, integer, integer, text, text, text) 823be7caaf3545567d5940f3f9425ed543dfddaedc274377ead7faad315664ce
-- based-on: public.get_user_table_data_paginated(uuid, integer, integer, text, text, text) 1ca16bd319beff4c59f1e20b06464b3ae1c124349829314bc7e1b56dedac2460
-- based-on: public.get_user_table_complete(uuid, text, text) 62a0831bb3098d7542c27e8ec559eb9adfe8dc4c710a5191b18f0f5bc3e3876d
-- based-on: public.get_user_list_with_items(uuid) 0b8fa9c6bd192716f04a37f2cafb4e50a6ff60da4ebcd8252721bcfd72eba93e
-- based-on: public._d31_impl_get_user_list_with_items(uuid) 03efb274ec1149ba4f7d4730936ea00f5bc4d136bdb49a11c1eafc4f7657f1fd
-- based-on: public.get_structured_list_for_selection(uuid) 680775220e0ea5edda5d7e9848d6fd47e04e3f2cc72c8d271d627138536b7c76
-- based-on: platform._cutover_seam_apply(text, uuid, text, uuid, uuid) 488a54335f748bdb627ced4f7b2dd129285394562197af18991115c4fc84958b
-- based-on: public.update_data_row_in_user_table(uuid, jsonb) f78bbffc4e3f544dbed986cdcaf810039e4c69e5f729cfc83f1dbb839bd32cf0
-- based-on: public.udt_upsert_row(uuid, uuid, jsonb) 7e663104246e59de1b3b8691011c6fb458bd2d3a6eadfd23b2a766a2880f20fd
-- lane: OLDER-DOORS-AFTER-SWITCH
-- INVERSE: migrations/inverse/olderdoors_a_moved_older_table_reads_marked_and_refuses_writes_down.sql

-- ── 1. WAS THIS OLDER PICK LIST MOVED BY ITS ORGANIZATION'S SWITCH? ───────────────────────────
create or replace function platform._older_list_moved_by_switch(p_list_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select coalesce((
    select l.deleted_at is not null
       and l.metadata ? 'moved_to'
       and l.organization_id is not null
       and (platform._cutover_seam_last_done('older_tables', l.organization_id)).direction = 'new'
      from workbench.udt_structured_lists l
     where l.id = p_list_id), false);
$$;

comment on function platform._older_list_moved_by_switch(uuid) is
  'OLDER-DOORS-AFTER-SWITCH: true when the older pick list <id> is archived with a moved_to pointer and its organization''s Data tables switch is on the new system — it moved with the switch and comes back only with Switch back. Private: asked by the older list reads and the write guard.';

revoke all on function platform._older_list_moved_by_switch(uuid) from public, anon, authenticated;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'platform', '_older_list_moved_by_switch', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/olderdoors_a_moved_older_table_reads_marked_and_refuses_writes.sql (lane OLDER-DOORS-AFTER-SWITCH)',
       'p_list_id is only looked up (workbench.udt_structured_lists by primary key); an unknown id answers false. It returns one boolean.',
       'server_only: called only from inside the older list reads (public.get_user_list_with_items, public._d31_impl_get_user_list_with_items, public.get_structured_list_for_selection), workbench.older_table_moved_to and the trigger workbench._moved_older_table_takes_no_writes (all SECURITY DEFINER); EXECUTE is revoked from every client role.',
       false, false
  from pg_proc p where p.oid = 'platform._older_list_moved_by_switch(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;


-- ── 2. WHERE DID IT GO? (the mark an older read carries) ──────────────────────────────────────
-- Null for every live older table or list. For one that moved with its organization's Data
-- tables switch: where its copy lives and one sentence an older client can show as it is.
-- Answers only a caller who can see that table or list (iam.has_access viewer; the server's
-- service role), and even then names neither the table nor the organization.
create or replace function workbench.older_table_moved_to(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  select case
    -- The access decision comes first, so a foreign id and an invented one both answer null.
    when not ((select auth.role()) = 'service_role'
              or coalesce(iam.has_access('dataset', p_id, 'viewer'::public.permission_level), false)
              or coalesce(iam.has_access('structured_list', p_id, 'viewer'::public.permission_level), false)) then null
    when platform._older_table_moved_by_switch(p_id) then (
      select jsonb_build_object(
               'moved', true, 'kind', 'table', 'store', 'custom.record',
               'table_id', coalesce(d.metadata #>> '{moved_to,table_id}', p_id::text),
               'address', '/data/' || coalesce(d.metadata #>> '{moved_to,table_id}', p_id::text),
               'says', 'This table moved to the new system when its organization switched its Data tables. It is read-only here; its copy at /data/'
                       || coalesce(d.metadata #>> '{moved_to,table_id}', p_id::text)
                       || ' is the live table (same table, same address).')
        from workbench.udt_datasets d where d.id = p_id)
    when platform._older_list_moved_by_switch(p_id) then (
      select jsonb_build_object(
               'moved', true, 'kind', 'list', 'store', 'custom.record',
               'table_id', coalesce(l.metadata #>> '{moved_to,table_id}', p_id::text),
               'address', '/data/' || coalesce(l.metadata #>> '{moved_to,table_id}', p_id::text),
               'says', 'This list moved to the new system when its organization switched its Data tables. It is read-only here; its copy at /data/'
                       || coalesce(l.metadata #>> '{moved_to,table_id}', p_id::text)
                       || ' is the live list (same list, same id).')
        from workbench.udt_structured_lists l where l.id = p_id)
  end;
$$;

comment on function workbench.older_table_moved_to(uuid) is
  'OLDER-DOORS-AFTER-SWITCH: null for a live older table or pick list; for one that moved with its organization''s Data tables switch, {moved, kind, store, table_id, address, says} — where its copy lives and the sentence an older client shows. The older reads (get_full_table, get_user_table_data_paginated[_v2], get_user_table_complete, the list reads) carry it as moved_to.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, signed_in_callers)
select 'workbench', 'older_table_moved_to', iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/olderdoors_a_moved_older_table_reads_marked_and_refuses_writes.sql (lane OLDER-DOORS-AFTER-SWITCH)',
       'Decides access first (iam.has_access dataset / structured_list at viewer, or the service role; anyone else gets null for every id). Answers only whether that older table or list moved with its organization''s switch, with its copy''s address (the same id) and a fixed sentence. Names no table, no organization, no row. Granted to authenticated because the SECURITY INVOKER older reads (get_full_table, get_user_table_data_paginated[_v2]) call it in the caller''s seat.',
       true
  from pg_proc p where p.oid = 'workbench.older_table_moved_to(uuid)'::regprocedure
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- the door is declared first, then the grant (§6d-4); PUBLIC's default EXECUTE was cleared at birth.
grant execute on function workbench.older_table_moved_to(uuid) to authenticated, service_role;


-- ── 3. A MOVED OLDER TABLE OR LIST TAKES NO WRITES, THROUGH ANY DOOR ──────────────────────────
-- The decision sits on the tables themselves, so every door decides it the same way: the older
-- RPCs (udt_upsert_cell, udt_bulk_write, append_rows_to_user_table, add_column_to_user_table,
-- update_user_table_config, …), PostgREST writes on the tables, the server's ORM, workflow steps,
-- imports and the browser extension. Switch back lifts it (the tables come back live).
create or replace function workbench._moved_older_table_takes_no_writes()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_ids  uuid[];
  v_id   uuid;
  v_list boolean := tg_table_name in ('udt_structured_lists', 'udt_structured_list_items');
  v_to   text;
begin
  if tg_table_name in ('udt_dataset_rows', 'udt_dataset_fields', 'udt_dataset_row_versions') then
    if tg_op = 'INSERT' then v_ids := array[new.table_id];
    elsif tg_op = 'DELETE' then v_ids := array[old.table_id];
    else v_ids := array[old.table_id, new.table_id];
    end if;
  elsif tg_table_name = 'udt_structured_list_items' then
    if tg_op = 'INSERT' then v_ids := array[new.list_id];
    elsif tg_op = 'DELETE' then v_ids := array[old.list_id];
    else v_ids := array[old.list_id, new.list_id];
    end if;
  elsif tg_table_name = 'udt_datasets' then
    -- Bringing it back (deleted_at cleared) is decided by
    -- workbench._moved_older_table_restores_with_switch_back: only Switch back's own door.
    if tg_op = 'UPDATE' and new.deleted_at is null then
      return new;
    end if;
    v_ids := array[old.id];
  elsif tg_table_name = 'udt_structured_lists' then
    if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null then
      -- Switch back's own door (workbench.udt_structured_list_unarchive) stamps unarchived_at.
      if (new.metadata ->> 'unarchived_at') is distinct from (old.metadata ->> 'unarchived_at') then
        return new;
      end if;
      if platform._older_list_moved_by_switch(old.id) then
        raise exception '"%" moved to the new system when this organization switched its Data tables, so it is not restored on its own. Switch back restores all of them together: organization settings, Data, Switch back.',
                        coalesce(nullif(btrim(old.list_name), ''), 'This older list')
          using errcode = '23514',
                hint = 'Its copy in the new system is the live list (same id). To go back to the older lists, press Switch back on /organizations/' || old.organization_id || '/settings#data.';
      end if;
      return new;
    end if;
    v_ids := array[old.id];
  else
    raise exception 'workbench._moved_older_table_takes_no_writes is bound to %, which it does not know', tg_table_name;
  end if;

  foreach v_id in array v_ids loop
    continue when v_id is null;
    if (not v_list and platform._older_table_moved_by_switch(v_id))
       or (v_list and platform._older_list_moved_by_switch(v_id)) then
      v_to := coalesce(
        case when v_list then (select l.metadata #>> '{moved_to,table_id}' from workbench.udt_structured_lists l where l.id = v_id)
             else (select d.metadata #>> '{moved_to,table_id}' from workbench.udt_datasets d where d.id = v_id) end,
        v_id::text);
      raise exception '%',
        case when v_list
             then 'This list moved to the new system when its organization switched its Data tables, so it no longer takes changes here. Make the change in its copy at /data/' || v_to || ' (same list, same id).'
             else 'This table moved to the new system when its organization switched its Data tables, so it no longer takes changes here. Make the change in its copy at /data/' || v_to || ' (same table, same address).' end
        using errcode = '23514',
              detail = 'moved_to=/data/' || v_to,
              hint = 'Switch back on the organization''s settings page (Data) makes the older ' || case when v_list then 'lists' else 'tables' end || ' writable again.';
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

comment on function workbench._moved_older_table_takes_no_writes() is
  'OLDER-DOORS-AFTER-SWITCH: refuses every insert, update and delete on an older table (udt_datasets, its rows, fields and row history) or pick list (udt_structured_lists, its items) that moved with its organization''s Data tables switch, naming the copy''s address. Bound to all six tables so every door — RPC, PostgREST, the server''s ORM — decides it once. Switch back''s own doors (udt_dataset_unarchive, udt_structured_list_unarchive) still bring them back.';

revoke all on function workbench._moved_older_table_takes_no_writes() from public, anon, authenticated;

create or replace trigger _0_moved_older_table_takes_no_writes
  before insert or update or delete on workbench.udt_dataset_rows
  for each row execute function workbench._moved_older_table_takes_no_writes();
create or replace trigger _0_moved_older_table_takes_no_writes
  before insert or update or delete on workbench.udt_dataset_fields
  for each row execute function workbench._moved_older_table_takes_no_writes();
create or replace trigger _0_moved_older_table_takes_no_writes
  before insert or update on workbench.udt_dataset_row_versions
  for each row execute function workbench._moved_older_table_takes_no_writes();
create or replace trigger _0_moved_older_table_takes_no_writes
  before update or delete on workbench.udt_datasets
  for each row execute function workbench._moved_older_table_takes_no_writes();
create or replace trigger _0_moved_older_table_takes_no_writes
  before update or delete on workbench.udt_structured_lists
  for each row execute function workbench._moved_older_table_takes_no_writes();
create or replace trigger _0_moved_older_table_takes_no_writes
  before insert or update or delete on workbench.udt_structured_list_items
  for each row execute function workbench._moved_older_table_takes_no_writes();


-- ── 4. ARCHIVE AND BRING BACK AN OLDER PICK LIST (the switch's own doors) ─────────────────────
create or replace function workbench.udt_structured_list_archive(p_list_id uuid, p_moved_to_table_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_org        uuid;
  v_name       text;
  v_deleted    timestamptz;
  v_moved_to   text;
  v_in_store   boolean;
  v_items      bigint;
  v_in_store_n bigint;
begin
  select l.organization_id, l.list_name, l.deleted_at, l.metadata #>> '{moved_to,table_id}'
    into v_org, v_name, v_deleted, v_moved_to
    from workbench.udt_structured_lists l
   where l.id = p_list_id;

  if v_org is null then
    raise exception 'there is no pick list with the id % in an organization, so there is nothing to archive', p_list_id
      using errcode = '02000';
  end if;
  if v_deleted is not null and v_moved_to = p_moved_to_table_id::text then
    return jsonb_build_object('list_id', p_list_id, 'archived', false, 'already_archived_at', v_deleted, 'moved_to', p_moved_to_table_id);
  end if;
  if v_deleted is not null then
    raise exception 'the pick list % is already archived and says it became %, not %',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text), coalesce(v_moved_to, 'nothing'), p_moved_to_table_id
      using errcode = '23514';
  end if;

  -- Never archive a list whose copy is not there: the copy is a Table of choices, same id.
  select true into v_in_store
    from custom.record r
   where r.organization_id = v_org and r.id = p_moved_to_table_id
     and r.data_class = 'table' and r.deleted_at is null;
  if v_in_store is not true then
    raise exception 'the pick list % has not arrived in the new system yet, so it is not being archived',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text)
      using errcode = '23514',
            hint = 'Copy again on the organization''s settings page (Data) copies it; then press the switch again.';
  end if;
  select count(*) into v_items
    from workbench.udt_structured_list_items i where i.list_id = p_list_id and i.deleted_at is null;
  select count(*) into v_in_store_n
    from custom.record r
   where r.organization_id = v_org and r.table_id = p_moved_to_table_id
     and r.data_class = 'record' and r.deleted_at is null;
  if v_in_store_n < v_items then
    raise exception 'the pick list % has % live choices and only % of them are in the new system, so it is not being archived',
                    coalesce(nullif(btrim(v_name), ''), p_list_id::text), v_items, v_in_store_n
      using errcode = '23514',
            hint = 'Nothing was archived. Copy again on the organization''s settings page (Data) copies what is missing.';
  end if;

  update workbench.udt_structured_lists
     set deleted_at = now(),
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'moved_to', jsonb_build_object(
             'store', 'custom.record', 'table_id', p_moved_to_table_id, 'at', now(), 'items', v_items,
             'reason', coalesce(nullif(btrim(p_reason), ''), 'moved into the unified record store as a Table of choices; the choices kept their own identifiers')))
   where id = p_list_id;

  return jsonb_build_object('list_id', p_list_id, 'archived', true, 'moved_to', p_moved_to_table_id, 'items', v_items);
end;
$$;

create or replace function workbench.udt_structured_list_unarchive(p_list_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_deleted timestamptz;
  v_found   boolean;
begin
  select l.deleted_at, true into v_deleted, v_found from workbench.udt_structured_lists l where l.id = p_list_id;
  if v_found is not true then
    raise exception 'there is no pick list with the id %, so there is nothing to bring back', p_list_id using errcode = '02000';
  end if;
  if v_deleted is null then
    return jsonb_build_object('list_id', p_list_id, 'unarchived', false, 'why', 'it was not archived');
  end if;
  update workbench.udt_structured_lists
     set deleted_at = null,
         metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('unarchived_at', clock_timestamp())
   where id = p_list_id;
  return jsonb_build_object('list_id', p_list_id, 'unarchived', true);
end;
$$;

comment on function workbench.udt_structured_list_archive(uuid, uuid, text) is
  'OLDER-DOORS-AFTER-SWITCH: the Data tables switch''s own door for an older pick list — archives it with a moved_to pointer to its same-id copy (a Table of choices), refusing when the copy or any live choice is not in the store. Idempotent.';
comment on function workbench.udt_structured_list_unarchive(uuid) is
  'OLDER-DOORS-AFTER-SWITCH: Switch back''s own door for an older pick list — clears deleted_at and stamps metadata.unarchived_at (the write guard lets only this restore through).';

revoke all on function workbench.udt_structured_list_archive(uuid, uuid, text) from public, anon, authenticated;
revoke all on function workbench.udt_structured_list_unarchive(uuid) from public, anon, authenticated;
grant execute on function workbench.udt_structured_list_archive(uuid, uuid, text) to service_role;
grant execute on function workbench.udt_structured_list_unarchive(uuid) to service_role;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason, non_client_lane, signed_in_callers, anonymous_callers)
select 'workbench', x.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       'migrations/campaign/olderdoors_a_moved_older_table_reads_marked_and_refuses_writes.sql (lane OLDER-DOORS-AFTER-SWITCH)',
       x.why,
       'server_only: called only from platform._cutover_seam_apply (the owner''s press of the Data tables switch, and Switch back); EXECUTE is revoked from every client role.',
       false, false
  from (values
    ('udt_structured_list_archive', 'workbench.udt_structured_list_archive(uuid,uuid,text)'::regprocedure,
     'p_list_id is looked up by primary key and archived only when its same-id copy and every live choice are in the store; p_moved_to_table_id must name a Table record of the same organization; p_reason is free text stored on the pointer.'),
    ('udt_structured_list_unarchive', 'workbench.udt_structured_list_unarchive(uuid)'::regprocedure,
     'p_list_id is looked up by primary key; an unknown id is refused, a live list is a no-op.')
  ) as x(fn, oid, why)
  join pg_proc p on p.oid = x.oid
on conflict (schema_name, function_name, identity_argtypes) do nothing;


-- ── 5. THE OLDER READS: SAME ROWS, MARKED MOVED ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_full_table(ref jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_table_id uuid;
  v_table_name text;
  j jsonb;
BEGIN
  v_table_id := (ref->>'table_id')::uuid;
  v_table_name := ref->>'table_name';

  IF NOT EXISTS (
    SELECT 1 FROM workbench.udt_datasets t
    WHERE t.id = v_table_id
      AND (v_table_name IS NULL OR t.table_name = v_table_name)
  ) THEN
    perform platform.refuse_not_found(format('dataset %s is not available to this account — it may not exist, the table_name may not match, or your access may not reach it', v_table_id));
  END IF;

  j := jsonb_build_object(
    -- Full row. row_ordering_config in particular is load-bearing: it carries
    -- default_sort, which the dataset viewer applies on first load.
    'table',
    (
      SELECT to_jsonb(t)
      FROM workbench.udt_datasets t
      WHERE t.id = v_table_id
    ),
    -- Full field rows, in field_order. validation_rules and default_value are
    -- needed by export and by any column-editing surface.
    'columns',
    (
      SELECT COALESCE(
               jsonb_agg(to_jsonb(tf) ORDER BY tf.field_order, tf.created_at),
               '[]'::jsonb)
      FROM workbench.udt_dataset_fields tf
      WHERE tf.table_id = v_table_id
    ),
    -- COUNT(*), not the length of a materialized row array. This is the whole
    -- reason to call this instead of get_user_table_complete.
    'row_count',
    (
      SELECT COUNT(*)::int
      FROM workbench.udt_dataset_rows d
      WHERE d.table_id = v_table_id
    ),
    -- lane OLDER-DOORS-AFTER-SWITCH: a table that moved with its organization's Data tables
    -- switch answers with the same rows, marked moved (null for every live table).
    'moved_to',
    workbench.older_table_moved_to(v_table_id)
  );

  RETURN j;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated_v2(p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_data JSONB;
    v_total_count INT;
    v_field_name TEXT;
    v_field_data_type TEXT;
    v_query TEXT;
    v_sort_expr TEXT;
BEGIN
    IF p_sort_field IS NOT NULL THEN
        SELECT tf.field_name, tf.data_type::text
        INTO v_field_name, v_field_data_type
        FROM workbench.udt_dataset_fields tf
        WHERE tf.table_id = p_table_id
          AND (tf.field_name = p_sort_field OR tf.display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND data::text ILIKE '%' || p_search_term || '%';
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id;
    END IF;

    v_query := 'SELECT id, data, created_at, updated_at FROM workbench.udt_dataset_rows WHERE table_id = $1';

    IF p_search_term IS NOT NULL THEN
        v_query := v_query || ' AND (data::text ILIKE ''%' || replace(p_search_term, '''', '''''') || '%'')';
    END IF;

    IF v_field_name IS NOT NULL THEN
        v_field_name := replace(v_field_name, '''', '''''');

        IF v_field_data_type IN ('integer', 'number') THEN
            v_sort_expr := format(
                'CASE WHEN data->>''%s'' ~ ''^-?[0-9]+\.?[0-9]*$'' THEN (data->>''%s'')::numeric ELSE NULL END',
                v_field_name, v_field_name
            );
        ELSIF v_field_data_type IN ('date', 'datetime') THEN
            v_sort_expr := format(
                'CASE WHEN data->>''%s'' IS NOT NULL AND data->>''%s'' <> '''' THEN (data->>''%s'')::timestamptz ELSE NULL END',
                v_field_name, v_field_name, v_field_name
            );
        ELSE
            v_sort_expr := format('LOWER(data->>''%s'')', v_field_name);
        END IF;

        v_query := v_query || ' ORDER BY ' || v_sort_expr;

        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC NULLS LAST';
        ELSE
            v_query := v_query || ' ASC NULLS LAST';
        END IF;
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ', id';
    ELSE
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ' ORDER BY created_at DESC, id';
    END IF;

    v_query := v_query || ' LIMIT $2 OFFSET $3';

    EXECUTE 'SELECT jsonb_agg(t) FROM (' || v_query || ') t'
    USING p_table_id, p_limit, p_offset
    INTO v_data;

    v_result := jsonb_build_object(
        'success', true,
        'data', COALESCE(v_data, '[]'::jsonb),
        'pagination', jsonb_build_object(
            'total_count', v_total_count,
            'page_count', CEIL(v_total_count::float / p_limit),
            'current_page', (p_offset / p_limit) + 1,
            'limit', p_limit,
            'offset', p_offset
        ),
        -- lane OLDER-DOORS-AFTER-SWITCH: the same rows, marked moved when the table moved with
        -- its organization's Data tables switch (null for every live table).
        'moved_to', workbench.older_table_moved_to(p_table_id)
    );

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_data_paginated(p_table_id uuid, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text, p_search_term text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_data JSONB;
    v_total_count INT;
    v_field_name TEXT;
    v_query TEXT;
BEGIN
    IF p_sort_field IS NOT NULL THEN
        SELECT field_name INTO v_field_name
        FROM workbench.udt_dataset_fields
        WHERE table_id = p_table_id
          AND (field_name = p_sort_field OR display_name = p_sort_field)
        LIMIT 1;
    END IF;

    IF p_search_term IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id
          AND (data::text ILIKE '%' || p_search_term || '%');
    ELSE
        SELECT COUNT(*) INTO v_total_count
        FROM workbench.udt_dataset_rows
        WHERE table_id = p_table_id;
    END IF;

    v_query := 'SELECT id, data, created_at, updated_at FROM workbench.udt_dataset_rows WHERE table_id = $1';

    IF p_search_term IS NOT NULL THEN
        v_query := v_query || ' AND (data::text ILIKE ''%'' || $4 || ''%'')';
    END IF;

    IF v_field_name IS NOT NULL THEN
        v_query := v_query || format(' ORDER BY (data->>%L)', v_field_name);
        IF p_sort_direction = 'desc' THEN
            v_query := v_query || ' DESC';
        ELSE
            v_query := v_query || ' ASC';
        END IF;
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ', id';
    ELSE
        -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
        v_query := v_query || ' ORDER BY created_at DESC, id';
    END IF;

    v_query := v_query || ' LIMIT $2 OFFSET $3';

    EXECUTE 'SELECT jsonb_agg(t) FROM (' || v_query || ') t'
    USING p_table_id, p_limit, p_offset, p_search_term
    INTO v_data;

    v_result := jsonb_build_object(
        'success', true,
        'data', COALESCE(v_data, '[]'::jsonb),
        'pagination', jsonb_build_object(
            'total_count', v_total_count,
            'page_count', CEIL(v_total_count::float / p_limit),
            'current_page', (p_offset / p_limit) + 1,
            'limit', p_limit,
            'offset', p_offset
        ),
        -- lane OLDER-DOORS-AFTER-SWITCH: the same rows, marked moved when the table moved with
        -- its organization's Data tables switch (null for every live table).
        'moved_to', workbench.older_table_moved_to(p_table_id)
    );

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_table_complete(p_table_id uuid, p_sort_field text DEFAULT NULL::text, p_sort_direction text DEFAULT 'asc'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if workbench.udt_dataset_access(p_table_id, 'viewer') is not true then
    raise exception 'viewer access required for dataset %', p_table_id using errcode = '42501';
  end if;
  -- lane OLDER-DOORS-AFTER-SWITCH: the same answer, marked moved when the table moved with its
  -- organization's Data tables switch (null for every live table).
  return public._d31_impl_get_user_table_complete(p_table_id, p_sort_field, p_sort_direction)
         || jsonb_build_object('moved_to', workbench.older_table_moved_to(p_table_id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if (
    auth.role() = 'service_role'
    or exists (
      select 1 from workbench.udt_structured_lists l
      where l.id = p_list_id
        -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
        and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
        and (l.is_public or l.public_read or l.user_id = (select auth.uid()))
    )
    or coalesce(iam.has_access('structured_list', p_list_id, 'viewer'::public.permission_level), false)
  ) is not true then
    raise exception 'viewer access required for list %', p_list_id using errcode = '42501';
  end if;
  return public._d31_impl_get_user_list_with_items(p_list_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public._d31_impl_get_user_list_with_items(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_result jsonb;
    v_is_editor boolean := false;
begin
    select (l.user_id = (select auth.uid())
            or iam.has_access('structured_list', l.id, 'editor'::public.permission_level))
      into v_is_editor
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));

    select jsonb_build_object(
        'list_id', l.id, 'list_name', l.list_name, 'description', l.description,
        'created_at', l.created_at, 'updated_at', l.updated_at,
        'is_public', l.is_public, 'public_read', l.public_read,
        -- lane OLDER-DOORS-AFTER-SWITCH: marked moved when the list moved with the switch.
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id, 'label', i.label,
                        'description', case when v_is_editor then i.description else null end,
                        'help_text', i.help_text
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id));
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_structured_list_for_selection(p_list_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
    select jsonb_build_object(
        'list_id', l.id,
        'list_name', l.list_name,
        'description', l.description,
        'is_public', l.is_public,
        'public_read', l.public_read,
        'moved_to', workbench.older_table_moved_to(l.id),
        'items_grouped', (
            select jsonb_object_agg(coalesce(group_name, 'Ungrouped'), items)
            from (
                select
                    group_name,
                    jsonb_agg(jsonb_build_object(
                        'id', i.id,
                        'label', i.label,
                        'help_text', i.help_text,
                        'group_name', i.group_name,
                        'icon_name', i.icon_name
                    ) order by i.created_at) as items
                from workbench.udt_structured_list_items i
                where i.list_id = l.id
                  and i.deleted_at is null
                group by group_name
            ) as grouped_items
        )
    )
    into v_result
    from workbench.udt_structured_lists l
    where l.id = p_list_id
      -- lane OLDER-DOORS-AFTER-SWITCH: a list that moved with the switch still reads (marked moved).
      and (l.deleted_at is null or platform._older_list_moved_by_switch(l.id))
      -- 🚨 THE GATE (DD-169 batch 3). Mirrors udt_structured_lists' std_select + pub_read.
      and (l.created_by = (select auth.uid())
        or l.visibility = 'public'::platform.visibility
        or iam.has_access('structured_list', l.id, 'viewer'::public.permission_level));
    return v_result;
end;
$function$;

-- ── 6. THE PRESS ARCHIVES THE OLDER PICK LISTS; SWITCH BACK RESTORES THEM ─────────────────────
CREATE OR REPLACE FUNCTION platform._cutover_seam_apply(p_seam text, p_org uuid, p_to text, p_actor uuid, p_press uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_feature text; v_key text;
  v_before jsonb;
  v_last platform.cutover_seam_press;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_w jsonb;
  v_t record;
  v_rekeyed jsonb := '[]'::jsonb;
  v_cfg jsonb;
  v_resynced jsonb := '[]'::jsonb;
  v_lists uuid[] := '{}';
  v_note text := format('switched %s on the organization''s settings page (press %s)', p_to, p_press);
begin
  if p_seam = 'older_tables' then
    v_feature := 'data_tables'; v_key := 'older_tables_moved';
  elsif p_seam = 'agent_context' then
    v_feature := 'custom'; v_key := 'agent_context_reads_the_copy';
  else
    raise exception 'the switch % has no press step', p_seam using errcode = '22023';
  end if;

  select o.value into v_before from platform.knob_override o
   where o.feature = v_feature and o.key = v_key and o.scope_kind = 'organization'
     and o.scope_id = p_org and o.organization_id = p_org;

  if p_to = 'new' then
    if p_seam = 'older_tables' then
      -- THE COPY IS RE-SYNCED FROM THE OLDER TABLE FIRST (COPY-WRITABLE, chair ruling 2026-09-25):
      -- the older table is the truth at this moment, so every test edit people made on a copy is
      -- put back and every row they added is archived, with a log row per table. Then the flip.
      v_resynced := platform._cutover_copy_resync(p_org, p_press, p_actor);
      for v_id in
        select d.id from workbench.udt_datasets d
         where d.organization_id = p_org and d.deleted_at is null
         order by d.id
      loop
        perform workbench.udt_dataset_archive(v_id, v_id, v_note);
        v_ids := v_ids || v_id;
      end loop;
      -- PICK LISTS MOVE WITH THE TABLES (lane OLDER-DOORS-AFTER-SWITCH). The mover copied each
      -- older list into the store as a Table of choices under the same id; the press archives
      -- the older list with the same pointer (its copy refused if it is not there), so an
      -- organization never has a live older list beside its copy. Switch back restores them.
      for v_id in
        select l.id from workbench.udt_structured_lists l
         where l.organization_id = p_org and l.deleted_at is null
         order by l.id
      loop
        perform workbench.udt_structured_list_archive(v_id, v_id, v_note);
        v_lists := v_lists || v_id;
      end loop;
      -- "WHEN A ROW CHANGES, RUN AN AGENT" FOLLOWS THE TABLE (CUTOVER-PLAN D8). An automation on
      -- an older table listens for older row events, which stop the moment the table is archived;
      -- it is re-keyed to the copy's record events (same table id, same column keys — the mover
      -- keeps them; row.deleted becomes record.archived, the store's own word). Its config before
      -- is kept on the press and on the automation, so Switch back puts it back exactly.
      for v_t in
        select t.id, t.config from scheduler.sch_trigger t
         where t.organization_id = p_org and t.deleted_at is null and t.type = 'event'
           and t.config ->> 'entity_type' = 'user_table_row'
           and (t.config ->> 'table_id')::uuid = any (v_ids)
         order by t.id
         for update
      loop
        v_cfg := v_t.config
          || jsonb_build_object('entity_type', 'record:' || (v_t.config ->> 'table_id'))
          || case when v_t.config ? 'actions' then jsonb_build_object('actions', (
               select coalesce(jsonb_agg(distinct case a when 'row.deleted' then 'record.archived'
                                                     else regexp_replace(a, '^row\.', 'record.') end), '[]'::jsonb)
                 from jsonb_array_elements_text(v_t.config -> 'actions') a)) else '{}'::jsonb end;
        update scheduler.sch_trigger
           set config = v_cfg,
               metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cutover_rekeyed',
                 jsonb_build_object('press', p_press, 'at', clock_timestamp(), 'config_before', v_t.config)),
               updated_at = now(), updated_by = p_actor
         where id = v_t.id;
        v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.id, 'config_before', v_t.config, 'config_now', v_cfg);
      end loop;
    end if;
    v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                         'true'::jsonb, v_note, p_actor);
    if not coalesce((v_w ->> 'ok')::boolean, false) then
      raise exception 'the setting %.% could not be written: %', v_feature, v_key, v_w::text using errcode = '22023';
    end if;
    return jsonb_build_object('archived', to_jsonb(v_ids), 'archived_lists', to_jsonb(v_lists),
                              'rekeyed', v_rekeyed,
                              'resynced', v_resynced,
                              'setting', v_feature || '.' || v_key,
                              'setting_before', coalesce(v_before, 'null'::jsonb), 'setting_now', true);
  end if;

  -- p_to = 'old': undo exactly what the last switch to new did.
  v_last := platform._cutover_seam_last_done(p_seam, p_org);
  if p_seam = 'older_tables' and v_last.id is not null then
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived', '[]'::jsonb)))::uuid loop
      perform workbench.udt_dataset_unarchive(v_id);
      v_ids := v_ids || v_id;
    end loop;
    -- The pick lists that press archived come back with them (lane OLDER-DOORS-AFTER-SWITCH).
    for v_id in select (jsonb_array_elements_text(coalesce(v_last.did -> 'archived_lists', '[]'::jsonb)))::uuid loop
      perform workbench.udt_structured_list_unarchive(v_id);
      v_lists := v_lists || v_id;
    end loop;
    -- Every automation the switch re-keyed listens to its older table again, exactly as before.
    for v_t in select * from jsonb_array_elements(coalesce(v_last.did -> 'rekeyed', '[]'::jsonb)) as r(x) loop
      update scheduler.sch_trigger
         set config = v_t.x -> 'config_before',
             metadata = coalesce(metadata, '{}'::jsonb) - 'cutover_rekeyed',
             updated_at = now(), updated_by = p_actor
       where id = (v_t.x ->> 'id')::uuid and deleted_at is null;
      v_rekeyed := v_rekeyed || jsonb_build_object('id', v_t.x ->> 'id', 'config_now', v_t.x -> 'config_before');
    end loop;
  end if;
  v_before := case when v_last.id is null then null
                   when v_last.did -> 'setting_before' = 'null'::jsonb then null
                   else v_last.did -> 'setting_before' end;
  v_w := platform._knob_override_write(v_feature, v_key, 'organization', p_org, p_org,
                                       v_before, v_note, p_actor);
  if not coalesce((v_w ->> 'ok')::boolean, false) then
    raise exception 'the setting %.% could not be put back: %', v_feature, v_key, v_w::text using errcode = '22023';
  end if;
  return jsonb_build_object('unarchived', to_jsonb(v_ids), 'unarchived_lists', to_jsonb(v_lists),
                            'rekeyed_back', v_rekeyed,
                            'setting', v_feature || '.' || v_key,
                            'setting_restored_to', coalesce(v_before, 'null'::jsonb),
                            'undid_press', v_last.id);
end;
$function$;

-- ── 7. A ROW PATCH MERGES, NEVER REPLACES (VERIFIER-26) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_result JSONB;
    v_updated BOOLEAN;
    v_data JSONB;
BEGIN
    -- lane OLDER-DOORS-AFTER-SWITCH: the patch MERGES into the row (the cells it names change,
    -- every other cell stays). It used to REPLACE the whole row, so a one-cell patch wiped the
    -- rest (VERIFIER-26, 2026-09-26). A table that moved with its organization's switch refuses
    -- the write in the row guard (workbench._moved_older_table_takes_no_writes) — never a
    -- success line over a table nothing reads.
    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
        RAISE EXCEPTION 'update_data_row_in_user_table: p_data must be an object of the cells to change'
          USING errcode = '22023';
    END IF;
    UPDATE workbench.udt_dataset_rows
    SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = NOW()
    WHERE id = p_row_id
    RETURNING true, data INTO v_updated, v_data;

    IF v_updated THEN
        v_result := jsonb_build_object(
            'success', true,
            'row_id', p_row_id,
            'data', v_data,
            'updated_at', NOW()
        );
    ELSE
        v_result := jsonb_build_object('success', false, 'error', 'Row not found or update failed');
    END IF;

    RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.udt_upsert_row(p_table_id uuid, p_row_id uuid DEFAULT NULL::uuid, p_data jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  UUID := auth.uid();
  v_dataset workbench.udt_datasets%ROWTYPE;
  v_row     workbench.udt_dataset_rows%ROWTYPE;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: not authenticated';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'udt_upsert_row: p_data is required';
  END IF;

  SELECT * INTO v_dataset FROM workbench.udt_datasets WHERE id = p_table_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'udt_upsert_row: table % not found', p_table_id;
  END IF;
  IF NOT workbench.udt_dataset_access(p_table_id, 'editor') THEN
    RAISE EXCEPTION 'udt_upsert_row: caller lacks editor permission on table %', p_table_id;
  END IF;

  IF p_row_id IS NULL THEN
    INSERT INTO workbench.udt_dataset_rows(table_id, data, user_id)
    VALUES (p_table_id, p_data, v_caller) RETURNING * INTO v_row;
  ELSE
    -- lane OLDER-DOORS-AFTER-SWITCH: an update MERGES p_data into the row (cells it does not name
    -- stay); it used to replace the whole row. A moved table refuses in the row guard.
    IF jsonb_typeof(p_data) <> 'object' THEN
      RAISE EXCEPTION 'udt_upsert_row: p_data must be an object' USING errcode = '22023';
    END IF;
    UPDATE workbench.udt_dataset_rows SET data = COALESCE(data, '{}'::jsonb) || p_data, updated_at = now()
     WHERE id = p_row_id AND table_id = p_table_id RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'udt_upsert_row: row % not found in table %', p_row_id, p_table_id;
    END IF;
  END IF;
  RETURN to_jsonb(v_row);
END;
$function$;
