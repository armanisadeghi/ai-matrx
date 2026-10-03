-- chair-step: undo chairaccess_b_a_locked_row_shows_its_header.sql - restores the bodies of custom.read_record, custom.read_records, custom.read_records_page and custom.record_headers exactly as production carried them before (a Confidential row the reader may not open is refused or left out, never a header), and drops the helper custom.confidential_header(uuid, uuid) the up created. Nothing else is touched.
-- lane: CHAIR-ACCESS
-- based-on: custom.read_record(uuid, uuid, boolean) a9cecbdaa90dc2925e3e488b141195669da505b2157364ed652042c48d56ee24
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 2fae587674a040aec64d4de9239cef11b40d17bb08589d7dcf04db0741f2baac
-- based-on: custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text) 3c99e57e4b4fd3002ed238a37031863ade8ba4907bd2512c95909f00d4c86ccb
-- based-on: custom.record_headers(uuid, uuid[]) 405c9720b4ccff2def0353737c0cdd69bdbf349fab4e50543cdc20090ccb1952

CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me  uuid := auth.uid();
  v_now uuid;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST (REC-29).
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  -- AND THE LADDER BEFORE EXISTENCE: a record you may not open and a record that is not there
  -- answer the same thing (custom.has_visibility is false for an id that is not there).
  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  -- DOOR-1. The rest of the door — existence, the one mask at the rung this person holds on the
  -- record, the choice words, the whole-value pointers, the alternates and the retired values —
  -- is custom._read_record_with, handed the two answers this body has just worked out.
  return (select w.o_doc
            from custom._read_record_with(p_organization_id, p_record_id, p_by_id,
                   jsonb_build_object(v_now::text, jsonb_build_object(
                     's', true, 'l', custom.effective_level(v_me, null, v_now))),
                   '{}'::jsonb) w);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records(p_organization_id uuid, p_table_id uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_level    public.permission_level;
  v_visible  text[];
  v_declared text[];
  v_notices  jsonb;
  v_key_ids  jsonb;
  v_mask     jsonb;
  v_set      record;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
  -- ONLY-ME-LISTED (2026-10-02): the "Shown to" context this page is listed with, once.
  v_lctx     jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records');
  p_limit := custom.page_size(p_organization_id, 'custom.read_records', p_limit, 200);

  -- STEP 2, once per table per request: which fields this caller may see, at which level.
  -- The level used for the field question is the caller's level on the TABLE, so a page of
  -- a hundred records asks the field question once, not a hundred times (DOOR-10's shape).
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);

  -- READ-MASK-ONCE: the field mask is the one door's answer, asked once per statement for this
  -- (person, organization, Table, level) and memoised — never worked out here a second way.
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;
  -- Only the fields that are actually hidden carry a notice; every declared field carries its id.
  v_notices := v_mask -> 'notices';
  v_key_ids := v_mask -> 'all_key_ids';

  -- STEP 1, ONCE: Visibility. `custom.visible_set` asks the ONE ladder a bounded number of
  -- times — once per visibility class, once per granted id, once per container — and hands back
  -- a predicate the planner can drive an index with. The comment this door used to carry is now
  -- true of the code under it (VIS-N-1; DOOR-10: filtered INSIDE the query, never post-filtered).
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  -- ONLY-ME-LISTED (VISION-REACH, 2026-10-02). visible_set answers who may OPEN a row; a LIST also
  -- asks whether the row is listed for this person — "Only me" hides, never locks (T-36). The same
  -- filter custom.query_visible_ids and custom.listed_predicate_sql apply, on every branch below.
  v_lctx := custom._record_shown_to_ctx(array[p_organization_id], p_table_id);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_me, v_lctx)
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_me, v_lctx)
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  elsif coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
    -- A CLASS THIS CALLER HOLDS, WITH EXCEPTIONS. A granted id is never answered by its class:
    -- a grant addressed to this person on that record replaces what membership confers (VIS-19),
    -- so it is excluded from the class arm and admitted only by its own answer. Containment is a
    -- separate arm and only ever adds (VIS-6).
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_me, v_lctx)
         and ( r.created_by = v_me
            or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  else
    -- NOTHING THIS CALLER HOLDS BY CLASS — `shared_only`, or a Table nobody shared with them.
    -- What is left is small and named: the rows this person made, the rows somebody gave them,
    -- and the rows a container they reach carries.
    for v_rec in
      select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_me, v_lctx)
         and ( r.created_by = v_me
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
      v_cache := v_vs.o_cache;
      if v_cr is null then
        v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
      end if;
      id := v_rec.id;
      document := custom.choice_render_with(p_organization_id, p_table_id,
                    custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_page(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT NULL::text, p_sort jsonb DEFAULT '[]'::jsonb, p_view_id uuid DEFAULT NULL::uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_time_zone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_ignored   jsonb := '[]'::jsonb;
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
    custom.listed_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(coalesce(p_filter, '{}'::jsonb)) then p_filter
           else custom.choice_filter_normalize(v_choices, coalesce(p_filter, '{}'::jsonb)) end));

  -- ── the search: THE ONE SHARED PREDICATE (CHAIR-GRID). custom.record_search_sql is this door's own older
  -- ILIKE over the visible columns and the choice words, plus the typed matches (a date as a person writes
  -- it, a phone by its digits, an amount as the grid shows it), judged for this reader. custom.record_aggregate
  -- asks the same function with the same arguments, so a footer counts exactly the rows this page shows.
  if v_term is not null then
    v_where := v_where || ' and ' || custom.record_search_sql(p_organization_id, p_table_id, p_search, 'r', p_time_zone);
  end if;

  -- ── the order ──
  if p_sort is not null and jsonb_typeof(p_sort) = 'array' and jsonb_array_length(p_sort) > 0 then
    for v_sort in select s from jsonb_array_elements(p_sort) s loop
      v_key := v_sort ->> 'field';
      v_dir := case when lower(coalesce(v_sort ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_as  := lower(coalesce(v_sort ->> 'as', 'text'));
      -- MONITOR-TRIAGE (2026-10-01): a sort on a column this reader cannot see — removed, or masked
      -- from their seat — is SKIPPED and named in `sort_ignored`, never a refused page. Ordering by
      -- it would leak the masked values' order, so it is not applied; the rest of the sort stands.
      if v_key is null or not (v_key = any (v_visible)) then
        v_ignored := v_ignored || to_jsonb(coalesce(v_key, ''));
        continue;
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
    -- Every key skipped: the read door's own order, exactly as if no sort was asked.
    v_order := case when v_order = '' then 'r.created_at desc, r.id' else v_order || 'r.id' end;
  elsif p_view_id is not null then
    select sv.* into v_view from platform.saved_view sv
     where sv.id = p_view_id and sv.organization_id = p_organization_id
       and sv.surface_key = 'custom/records' and sv.deleted_at is null
       and coalesce(sv.subject_id, nullif(sv.definition ->> 'table_id', '')::uuid) = p_table_id;
    if v_view.id is null then
      raise exception 'There is no such saved view on this table.' using errcode = '23503',
              hint = 'It may have been removed, or it may belong to another table or organization. Nothing was read.',
            detail = jsonb_build_object('view_id', p_view_id)::text;
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

  return jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows,
                            'sort_ignored', v_ignored);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.record_headers(p_organization_id uuid, p_ids uuid[])
 RETURNS TABLE(id uuid, table_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, version integer, deleted_at timestamp with time zone, mine boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
  v_t  uuid;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_headers');
  if coalesce(cardinality(p_ids), 0) > 1000 then
    raise exception 'One call answers at most 1000 records; this one named %.', cardinality(p_ids)
      using errcode = '54000', hint = 'Ask for the rows a page shows. Nothing was read.';
  end if;

  for v_t in
    select distinct r.table_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = any(coalesce(p_ids, '{}'::uuid[]))
       and r.data_class = 'record' and r.deleted_at is null
  loop
    return query
      select r.id, r.table_id, r.created_at, r.updated_at, r.version, r.deleted_at,
             (v_me is not null and r.created_by = v_me),
             case when v_me is not null and r.created_by = v_me then v_me end
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = v_t
         and r.id = any(p_ids)
         and r.id in (select v from custom.query_visible_ids(p_organization_id, v_t, 'viewer') v);
  end loop;
end
$function$;

drop function if exists custom.confidential_header(uuid, uuid);
