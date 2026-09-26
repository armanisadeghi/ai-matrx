-- target: branch,production
-- additive: yes
--   It ADDS two signed-in doors, custom.read_records_page and custom.record_change_many, and declares
--   both in platform.client_callable_door. Their EXECUTE grant to authenticated is the chair step
--   doorspeed_the_two_doors_can_be_reached.sql, applied right after this file. No existing function,
--   table, policy, trigger or grant is changed, and no record is written.
-- guard: custom/system_enabled
-- lane: data-tables-grid-overhaul
-- lock: custom,platform
--
-- Inverse: migrations/inverse/doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction_down.sql.
--
-- THE USE CASE. A dispatcher at a service company opens "September service board — Camarillo"
-- (1,000 jobs) in the Sheet, types a job number that sits on page 6, sorts by Customer, and
-- fills "Completed" down twenty selected rows. On the older store each of those was one call:
-- `get_user_table_data_paginated_v2` sorted, searched and counted in SQL, and `udt_bulk_write`
-- wrote twenty rows in one transaction. The record store had neither, so the Sheet read the WHOLE
-- table (sequential 200-row pages) for every page, search and sort, refused tables over 10,000
-- rows, and wrote a bulk edit as twenty separate calls that could half-apply (v2 readiness audit,
-- 2026-09-25, blockers 1 and 2).
--
-- 1. custom.read_records_page — ONE PAGE, SORTED, SEARCHED, FILTERED AND COUNTED BY THE STORE.
--    The same wall, ladder and field mask as custom.read_records_matching (assert_client_may_reach,
--    assert_may_know_table, custom.visible_predicate_sql, custom.read_mask_for), the same filter
--    builder (custom.record_filter_sql over the choice-normalised question), and the documents are
--    built by custom.read_records_by_ids, the door the realtime path already reads — so a row here
--    is byte-for-byte the row every other read door answers. What it adds:
--      * p_sort   [{field, direction, as}] — `as` is 'number' | 'date' | 'text' (the column's own
--                 type, exactly how the older door chose its sort expression); a choice column
--                 sorts by the WORD a person sees, never the stored key. NULLS LAST both ways,
--                 id as the tie-breaker (a total order, so pages never overlap). A column this
--                 reader may not see, or one worked out on every read (compute_on = read, so no
--                 value is stored to sort by), is REFUSED by name — never silently ignored.
--      * p_search the older door's `data::text ILIKE '%term%'`, over this reader's VISIBLE
--                 columns only (a hidden column never decides which rows match), plus the words
--                 of choice options, so "Truck 7" finds the rows that hold truck_7_delacroix.
--      * p_view_id a hand-ordered view's positions as the order when no column sort is asked
--                 (the same order custom.read_records_in_view_order reads).
--      * total    the count of the rows this reader may see that match — the same set the page
--                 is cut from, so "page 6 of 50" is never a guess and never counts a hidden row.
--    It answers {total, limit, offset, rows: [{id, document, level}]}.
--
-- 2. custom.record_change_many — MANY CHANGES TO ONE TABLE IN ONE TRANSACTION.
--    Every change goes through the store's own one-record doors (custom.record_write_many for the
--    new records, custom.record_update, custom.record_delete), so every trigger, rule, refusal,
--    version and history row is exactly what one change produces. What it adds is the transaction:
--    one refused change refuses the whole batch and NOTHING is saved; the store's own sentence
--    comes back verbatim with the change's position named in the hint.


-- ── 1. The page door ───────────────────────────────────────────────────────────────────────
create function custom.read_records_page(
  p_organization_id uuid,
  p_table_id        uuid,
  p_filter          jsonb   default '{}'::jsonb,
  p_search          text    default null,
  p_sort            jsonb   default '[]'::jsonb,
  p_view_id         uuid    default null,
  p_by_id           boolean default false,
  p_limit           integer default 50,
  p_offset          integer default 0)
 returns jsonb
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_me        uuid := auth.uid();
  v_level     public.permission_level;
  v_mask      jsonb;
  v_visible   text[];
  v_computed  text[];
  v_choices   jsonb;
  v_limit     integer;
  v_offset    integer := greatest(coalesce(p_offset, 0), 0);
  v_where     text;
  v_order     text := '';
  v_term      text := nullif(btrim(coalesce(p_search, '')), '');
  v_pattern   text;
  v_search    text;
  v_hits      text[];
  v_sort      jsonb;
  v_key       text;
  v_dir       text;
  v_as        text;
  v_expr      text;
  v_labels    jsonb;
  v_view      record;
  v_positions jsonb := null;
  v_total     bigint;
  v_ids       uuid[];
  v_rows      jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, THEN THE TABLE — the same two questions, in the same order, that
  -- custom.read_records_matching asks on its first lines.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_page');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_page');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_page', p_limit, 50);

  -- The field question, once: which columns this reader may see (search and sort read ONLY these).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  -- A column worked out on every read keeps no value in the record, so nothing can sort by it.
  select coalesce(array_agg(k.key), '{}'::text[]) into v_computed
    from jsonb_each_text(coalesce(v_mask -> 'all_key_ids', '{}'::jsonb)) k
    join custom.record f on f.id = k.value::uuid
   where f.data ->> 'type' = 'formula'
     and coalesce(f.data ->> 'compute_on', 'read') = 'read';
  v_choices := coalesce(custom.choice_field_map(p_organization_id, p_table_id), '{}'::jsonb);

  -- ── the rows this reader may see that answer the question ──
  v_where := format($w$
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s$w$,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(coalesce(p_filter, '{}'::jsonb)) then p_filter
           else custom.choice_filter_normalize(v_choices, coalesce(p_filter, '{}'::jsonb)) end));

  -- ── the search: the older door's ILIKE, over the visible columns and the choice words ──
  if v_term is not null then
    v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_search := format(
      $s$exists (select 1 from jsonb_each(r.data) e
                  where e.key = any (%L::text[])
                    and (case jsonb_typeof(e.value) when 'string' then e.value #>> '{}'
                              else e.value::text end) ilike %L)$s$,
      v_visible, v_pattern);
    for v_key in select k from jsonb_object_keys(v_choices) k where k = any (v_visible) loop
      select coalesce(array_agg(o.key), '{}'::text[]) into v_hits
        from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o
       where coalesce(o.value ->> 'label', '') ilike v_pattern;
      if cardinality(v_hits) > 0 then
        v_search := v_search || format(' or (r.data -> %L) ?| %L::text[]', v_key, v_hits);
      end if;
    end loop;
    v_where := v_where || ' and (' || v_search || ')';
  end if;

  -- ── the order ──
  if p_sort is not null and jsonb_typeof(p_sort) = 'array' and jsonb_array_length(p_sort) > 0 then
    for v_sort in select s from jsonb_array_elements(p_sort) s loop
      v_key := v_sort ->> 'field';
      v_dir := case when lower(coalesce(v_sort ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_as  := lower(coalesce(v_sort ->> 'as', 'text'));
      if v_key is null or not (v_key = any (v_visible)) then
        raise exception 'This table has no column called "%" that you can see, so it cannot be sorted by it.', coalesce(v_key, '')
          using errcode = '22023',
                hint = 'Sort by one of the columns the table shows you. Nothing was read.';
      end if;
      if v_key = any (v_computed) then
        raise exception 'The column "%" is worked out each time it is read, so the store keeps no value to sort the whole table by.', v_key
          using errcode = '0A000',
                hint = 'Sort by one of the columns it is worked out from, or have the column worked out when a record is saved (compute_on: write) so its value is kept. Nothing was read.';
      end if;
      if v_choices ? v_key then
        select coalesce(jsonb_object_agg(o.key, o.value ->> 'label'), '{}'::jsonb) into v_labels
          from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o;
        v_expr := format('lower(coalesce(%L::jsonb ->> (r.data ->> %L), r.data ->> %L))', v_labels, v_key, v_key);
      elsif v_as in ('number', 'integer') then
        v_expr := format($x$case when (r.data ->> %L) ~ '^-?[0-9]+\.?[0-9]*$' then (r.data ->> %L)::numeric end$x$, v_key, v_key);
      elsif v_as in ('date', 'datetime') then
        -- An ISO date or instant sorts as its own text; anything else is not a date and sorts last.
        v_expr := format($x$case when (r.data ->> %L) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then (r.data ->> %L) end$x$, v_key, v_key);
      else
        v_expr := format('lower(r.data ->> %L)', v_key);
      end if;
      v_order := v_order || v_expr || ' ' || v_dir || ' nulls last, ';
    end loop;
    v_order := v_order || 'r.id';
  elsif p_view_id is not null then
    select sv.* into v_view from platform.saved_view sv
     where sv.id = p_view_id and sv.organization_id = p_organization_id
       and sv.surface_key = 'custom/records' and sv.deleted_at is null
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id;
    if v_view.id is null then
      raise exception 'There is no saved view % on this table.', p_view_id
        using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another table or organization. Nothing was read.';
    end if;
    if v_view.definition ->> 'order' is distinct from 'manual' then
      raise exception 'This view is ordered by its sort, not by hand.' using errcode = '22023',
        hint = 'Ask for its sort in p_sort instead of naming the view. Nothing was read.';
    end if;
    v_positions := coalesce(v_view.metadata -> 'record_positions', '{}'::jsonb);
    v_order := '($1 ->> r.id::text)::numeric nulls last, r.created_at, r.id';
  else
    -- No question about order: the read door's own order.
    v_order := 'r.created_at desc, r.id';
  end if;

  execute 'select count(*) ' || v_where into v_total;

  execute format('select array_agg(q.id order by q.n) from (select r.id, row_number() over (order by %s) as n %s order by n limit %s offset %s) q',
                 v_order, v_where, v_limit, v_offset)
     into v_ids
    using v_positions;

  if v_ids is null then
    v_rows := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'document', d.document, 'level', d.level) order by o.n), '[]'::jsonb)
      into v_rows
      from unnest(v_ids) with ordinality o(rid, n)
      join custom.read_records_by_ids(p_organization_id, p_table_id, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid;
  end if;

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
end;
$function$;

comment on function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) is
  'DOOR-SPEED (lane data-tables-grid-overhaul, 2026-09-25): one page of one Table, sorted, searched, filtered and COUNTED by the store — the record-store twin of public.get_user_table_data_paginated_v2. Same wall, ladder, field mask and filter builder as custom.read_records_matching; documents built by custom.read_records_by_ids. Search and sort read only the columns this reader may see. Answers {total, limit, offset, rows:[{id, document, level}]}.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'custom', 'read_records_page',
       pg_get_function_identity_arguments('custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer)'::regprocedure),
       array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype, 'text'::regtype, 'jsonb'::regtype,
             'uuid'::regtype, 'boolean'::regtype, 'integer'::regtype, 'integer'::regtype]::oid[],
       'The same read door as custom.read_records_matching, with the order, the search and the count asked of the store. It resolves the reader from the session (auth.uid()), asks custom.assert_client_may_reach and custom.assert_may_know_table exactly as read_records_matching does, decides rows through custom.visible_predicate_sql (the one ladder) and the filter through custom.record_filter_sql, and builds every document through custom.read_records_by_ids, which masks fields for this reader. Search and sort read only the columns custom.read_mask_for says this reader may see; a sort on any other column is refused. The count is of the same visible, matching set. It writes nothing.',
       'migrations/campaign/doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction.sql (lane data-tables-grid-overhaul)',
       true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'custom' and d.function_name = 'read_records_page');

-- ── 2. The many-changes door ───────────────────────────────────────────────────────────────
create function custom.record_change_many(
  p_organization_id uuid,
  p_table_id        uuid,
  p_changes         jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_n         integer;
  v_ceiling   integer;
  v_i         integer;
  v_change    jsonb;
  v_op        text;
  v_key       text;
  v_id        uuid;
  v_out       jsonb[];
  v_inserts   jsonb[] := array[]::jsonb[];
  v_insert_at integer[] := array[]::integer[];
  v_new_ids   uuid[];
  v_patches   jsonb := '{}'::jsonb;   -- record id -> the merged patch (one row is updated once)
  v_expected  jsonb := '{}'::jsonb;   -- record id -> the version the caller wrote against
  v_first_at  jsonb := '{}'::jsonb;   -- record id -> the first change (0-based) that named it
  v_versions  jsonb := '{}'::jsonb;   -- record id -> the version the update produced
  v_patch     jsonb;
  v_current   integer;
  v_at        timestamptz;
  v_state     text;
  v_msg       text;
  v_detail    text;
  v_hint      text;
begin
  -- The switch, then the editor rung on the Table — the same two questions custom.record_write_many
  -- asks, once for the batch. Every record is then asked its own rung below, as record_update asks.
  perform custom.assert_store_door(p_organization_id, 'custom.record_change_many');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_change_many',
                                          'editor'::public.permission_level, 'table');

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'custom.record_change_many: the changes must be a list, and they are a %', coalesce(jsonb_typeof(p_changes), 'nothing')
      using errcode = '22023',
            hint = 'Send [{"op":"update","record_id":…,"patch":{…}}, {"op":"archive","record_id":…}, {"op":"insert","data":{…}}]. Nothing was written.';
  end if;
  v_n := jsonb_array_length(p_changes);
  if v_n = 0 then
    return '[]'::jsonb;
  end if;
  v_ceiling := custom.page_ceiling(p_organization_id);
  if v_n > v_ceiling then
    raise exception 'This batch holds % changes, and the store takes at most % in one transaction, so nothing was written rather than part of it.', v_n, v_ceiling
      using errcode = '54000',
            hint = 'Split the changes into batches of ' || v_ceiling || ' or fewer. An organization that genuinely writes bigger batches raises the knob custom/page_size_ceiling.';
  end if;
  v_out := array_fill(null::jsonb, array[v_n]);

  -- ── read the batch: every change is checked for shape before anything is written ──
  for v_i in 0 .. v_n - 1 loop
    v_change := p_changes -> v_i;
    v_op := coalesce(v_change ->> 'op', 'update');
    begin
      if v_op = 'insert' then
        v_inserts := v_inserts || coalesce(v_change -> 'data', '{}'::jsonb);
        v_insert_at := v_insert_at || v_i;
        continue;
      end if;
      if v_op not in ('update', 'archive') then
        raise exception 'custom.record_change_many: "%" is not a change this door makes.', v_op
          using errcode = '22023', hint = 'Each change is an insert, an update or an archive.';
      end if;
      v_id := (v_change ->> 'record_id')::uuid;
      if v_id is null or not exists (
           select 1 from custom.record r
            where r.organization_id = p_organization_id and r.id = v_id
              and r.table_id = p_table_id and r.deleted_at is null) then
        raise exception 'There is no record % in this table any more.', coalesce(v_change ->> 'record_id', '(no id)')
          using errcode = '02000',
                hint = 'It was archived, it belongs to another table, or it never existed here.';
      end if;
      -- The editor rung on THIS record, the question custom.record_update asks first.
      perform custom.assert_client_may_change(p_organization_id, v_id, 'custom.record_change_many');
      v_key := v_id::text;
      if not (v_first_at ? v_key) then
        v_first_at := v_first_at || jsonb_build_object(v_key, v_i);
      end if;
      if v_op = 'update' then
        v_patch := v_change -> 'patch';
        if v_patch is null or jsonb_typeof(v_patch) <> 'object' then
          raise exception 'custom.record_change_many: the patch must be an object of field key -> value, and it is a %', coalesce(jsonb_typeof(v_patch), 'nothing')
            using errcode = '22023';
        end if;
        -- The envelope key comes off before the merge, exactly as in custom.record_update.
        v_patch := custom._take_op_id(v_patch, 'custom.record_change_many');
        v_patches := v_patches || jsonb_build_object(v_key, coalesce(v_patches -> v_key, '{}'::jsonb) || v_patch);
        if v_change ? 'expected_version' and nullif(v_change ->> 'expected_version', '') is not null then
          v_expected := v_expected || jsonb_build_object(v_key, (v_change ->> 'expected_version')::integer);
        end if;
      end if;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_hint = pg_exception_hint;
      raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
        hint = format('Nothing in this batch of %s changes was saved: change %s (record %s) was refused, and the batch is one transaction.',
                      v_n, v_i + 1, coalesce(v_change ->> 'record_id', 'new'))
               || coalesce(' ' || nullif(v_hint, ''), '');
    end;
  end loop;

  -- ── 1. new records, in ONE statement through custom.record_write_many ──
  if cardinality(v_inserts) > 0 then
    begin
      v_new_ids := custom.record_write_many(p_organization_id, p_table_id, v_inserts, null);
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_hint = pg_exception_hint;
      raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
        hint = format('Nothing in this batch of %s changes was saved: one of its %s new records was refused, and the batch is one transaction.', v_n, cardinality(v_inserts))
               || coalesce(' ' || nullif(v_hint, ''), '');
    end;
    for v_i in 1 .. cardinality(v_insert_at) loop
      v_out[v_insert_at[v_i] + 1] := jsonb_build_object('op', 'insert', 'id', v_new_ids[v_i]);
    end loop;
  end if;

  -- ── 2. every update in ONE statement: statement triggers (the change notice, the history,
  --      the activity bridge) fire once for the batch; row triggers (validation, the value
  --      envelope, the write door) fire for every row, exactly as for one record ──
  if v_patches <> '{}'::jsonb then
    begin
      with changed as (
        update custom.record r
           set data = r.data || p.value
          from jsonb_each(v_patches) p
         where r.organization_id = p_organization_id
           and r.table_id = p_table_id
           and r.id = p.key::uuid
           and r.deleted_at is null
           and (not (v_expected ? p.key) or r.version = (v_expected ->> p.key)::integer)
        returning r.id, r.version)
      select coalesce(jsonb_object_agg(c.id::text, c.version), '{}'::jsonb) into v_versions from changed c;
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                              v_detail = pg_exception_detail, v_hint = pg_exception_hint;
      -- WHICH change? The statement answers for the set; the one-record door answers for a row.
      -- Each update is replayed through custom.record_update (the failed statement is already
      -- rolled back) until one refuses, and THAT refusal is raised with its position.
      for v_key, v_patch in select e.key, e.value from jsonb_each(v_patches) e
                             order by (v_first_at ->> e.key)::integer loop
        begin
          perform custom.record_update(p_organization_id, v_key::uuid, v_patch, (v_expected ->> v_key)::integer);
        exception when others then
          get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                                  v_detail = pg_exception_detail, v_hint = pg_exception_hint;
          raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
            hint = format('Nothing in this batch of %s changes was saved: change %s (record %s) was refused, and the batch is one transaction.',
                          v_n, (v_first_at ->> v_key)::integer + 1, v_key)
                   || coalesce(' ' || nullif(v_hint, ''), '');
        end;
      end loop;
      raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
        hint = format('Nothing in this batch of %s changes was saved: the changes were refused together, though none is refused alone.', v_n)
               || coalesce(' ' || nullif(v_hint, ''), '');
    end;

    -- A row the statement did not change was archived meanwhile, or moved past the version the
    -- caller wrote against: the same two answers custom.record_update gives, for that change.
    for v_key in select e.key from jsonb_each(v_patches) e
                  where not (v_versions ? e.key)
                  order by (v_first_at ->> e.key)::integer loop
      select r.version into v_current from custom.record r
       where r.organization_id = p_organization_id and r.id = v_key::uuid and r.deleted_at is null;
      if v_current is null then
        raise exception 'There is no record % in this organization any more - somebody deleted it while you were working on it.', v_key
          using errcode = '02000',
                hint = format('Nothing in this batch of %s changes was saved: change %s was refused, and the batch is one transaction.',
                              v_n, (v_first_at ->> v_key)::integer + 1);
      end if;
      raise exception 'Someone else changed this record while you were working on it. You wrote against version %, and version % is the one that won.',
                      v_expected ->> v_key, v_current
        using errcode = 'PT409',
              detail = jsonb_build_object('expected_version', (v_expected ->> v_key)::integer,
                                          'current_version',  v_current,
                                          'record_id',        v_key)::text,
              hint = format('Nothing in this batch of %s changes was saved: change %s was refused, and the batch is one transaction. Look at what changed and write it again against version %s.',
                            v_n, (v_first_at ->> v_key)::integer + 1, v_current);
    end loop;

    -- The columns the patch named must be the Table's own, the check custom.record_update makes.
    for v_key, v_patch in select e.key, e.value from jsonb_each(v_patches) e loop
      perform custom.assert_columns_are_defined(p_organization_id, v_key::uuid, v_patch);
    end loop;
  end if;

  -- ── 3. archives, one record at a time through custom.record_delete (it cascades by rule) ──
  for v_i in 0 .. v_n - 1 loop
    v_change := p_changes -> v_i;
    v_op := coalesce(v_change ->> 'op', 'update');
    if v_op = 'update' then
      v_key := v_change ->> 'record_id';
      v_out[v_i + 1] := jsonb_build_object('op', 'update', 'id', v_key, 'version', (v_versions ->> lower(v_key))::integer);
    elsif v_op = 'archive' then
      begin
        v_at := custom.record_delete(p_organization_id, (v_change ->> 'record_id')::uuid);
      exception when others then
        get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text,
                                v_detail = pg_exception_detail, v_hint = pg_exception_hint;
        raise exception using errcode = v_state, message = v_msg, detail = coalesce(v_detail, ''),
          hint = format('Nothing in this batch of %s changes was saved: change %s (record %s) was refused, and the batch is one transaction.',
                        v_n, v_i + 1, v_change ->> 'record_id')
                 || coalesce(' ' || nullif(v_hint, ''), '');
      end;
      v_out[v_i + 1] := jsonb_build_object('op', 'archive', 'id', v_change ->> 'record_id', 'archived_at', v_at);
    end if;
  end loop;

  return to_jsonb(v_out);
end;
$function$;

comment on function custom.record_change_many(uuid, uuid, jsonb) is
  'DOOR-SPEED (lane data-tables-grid-overhaul, 2026-09-25): many changes to one Table in ONE transaction — inserts through custom.record_write_many, every update in ONE UPDATE statement (patches to one record merged, each record asked its editor rung, version compare-and-swap honoured, undeclared columns refused as custom.record_update refuses them), archives through custom.record_delete. One refused change refuses the batch and nothing is saved; the store''s sentence comes back verbatim with the change named in the hint. Answers one result per change, in order.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   signed_in_callers, anonymous_callers)
select 'custom', 'record_change_many',
       pg_get_function_identity_arguments('custom.record_change_many(uuid, uuid, jsonb)'::regprocedure),
       array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
       'The batch form of the store''s write doors. It asks custom.assert_store_door and custom.assert_client_may_change (editor on the Table, for auth.uid()) once, exactly as custom.record_write_many does, then custom.assert_client_may_change (editor) on every record an update or an archive names, as custom.record_update does. Inserts go through custom.record_write_many; updates are one UPDATE of custom.record restricted to this organization, this Table and live rows, so every row trigger (validation, value envelope, field write door, copy fence) judges every row; archives go through custom.record_delete. A record id outside this Table is refused. The whole batch is one transaction: any refusal re-raises the store''s own error and nothing is saved.',
       'migrations/campaign/doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction.sql (lane data-tables-grid-overhaul)',
       true, false
where not exists (select 1 from platform.client_callable_door d
                   where d.schema_name = 'custom' and d.function_name = 'record_change_many');
