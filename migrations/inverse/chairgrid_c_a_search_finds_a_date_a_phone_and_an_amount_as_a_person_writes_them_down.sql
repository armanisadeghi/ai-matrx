-- chair-step: inverse of chairgrid_c_a_search_finds_a_date_a_phone_and_an_amount_as_a_person_writes_them.sql — custom.read_records_page goes back to its nine-argument signature with its exact production body (its own inline search), comment, grant to authenticated and platform.client_callable_door identity (declared_by and reason as they stood, the p_time_zone rule removed); custom.record_search_sql(uuid, uuid, text, text, text) gets back chairgrid_b's body (the older ILIKE only). Nothing else is touched.
-- lane: CHAIR-GRID
-- based-on: custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text) 95df849ae55449580af9327b5248130a47989a2b50669c74fe65aa5b6611f475
-- based-on: custom.record_search_sql(uuid, uuid, text, text, text) 6e4ab1231f9a4f4a34f47a52cd8290faf1d66420197c6bd2f3dfcc46f66e1f1a

drop function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text);
CREATE OR REPLACE FUNCTION custom.read_records_page(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT NULL::text, p_sort jsonb DEFAULT '[]'::jsonb, p_view_id uuid DEFAULT NULL::uuid, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
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
comment on function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) is
  'DOOR-SPEED (lane data-tables-grid-overhaul, 2026-09-25): one page of one Table, sorted, searched, filtered and COUNTED by the store — the record-store twin of public.get_user_table_data_paginated_v2. Same wall, ladder, field mask and filter builder as custom.read_records_matching; documents built by custom.read_records_by_ids. Search and sort read only the columns this reader may see. Answers {total, limit, offset, rows:[{id, document, level}]}.';
update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_table_id uuid, p_filter jsonb, p_search text, p_sort jsonb, p_view_id uuid, p_by_id boolean, p_limit integer, p_offset integer',
       identity_argtypes = array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid, 'text'::regtype::oid, 'jsonb'::regtype::oid, 'uuid'::regtype::oid, 'boolean'::regtype::oid, 'integer'::regtype::oid, 'integer'::regtype::oid],
       declared_by = 'migrations/campaign/doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction.sql (lane data-tables-grid-overhaul)',
       reason = replace(reason, ' CHAIR-GRID: the search is the one shared predicate custom.record_search_sql (so the page and custom.record_aggregate agree); p_time_zone (text, optional, checked) is the reader''s zone for its date matches. It grants nothing.', ''),
       argument_rules = argument_rules #- '{arguments,p_time_zone}'
 where schema_name = 'custom' and function_name = 'read_records_page'
   and identity_args = 'p_organization_id uuid, p_table_id uuid, p_filter jsonb, p_search text, p_sort jsonb, p_view_id uuid, p_by_id boolean, p_limit integer, p_offset integer, p_time_zone text';
grant execute on function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) to authenticated;

CREATE OR REPLACE FUNCTION custom.record_search_sql(p_organization_id uuid, p_table_id uuid, p_search text, p_alias text DEFAULT 'r'::text, p_time_zone text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- THE PAGE'S SEARCH, AS ONE FRAGMENT (CHAIR-GRID, 2026-10-03). custom.read_records_page's own predicate: the
-- term ILIKE any column this reader may see (a string by its text, anything else by its JSON text), or a
-- choice column holding an option whose label matches. 'true' when no term. Built for the aggregate so a
-- summary counts exactly the rows a search shows; chairgrid_c moves the page door onto this one and adds
-- the typed matches that read p_time_zone.
declare
  v_me      uuid := coalesce(custom.query_principal(), auth.uid());
  v_term    text := nullif(btrim(coalesce(p_search, '')), '');
  v_level   public.permission_level;
  v_mask    jsonb;
  v_visible text[];
  v_choices jsonb;
  v_pattern text;
  v_search  text;
  v_hits    text[];
  v_key     text;
begin
  -- THE READER'S ZONE is checked before anything is read, even while nothing here formats a date yet
  -- (chairgrid_c does): an unknown zone is a refusal by name, never a silent fallback.
  if p_time_zone is not null then
    begin
      perform now() at time zone p_time_zone;
    exception when others then
      raise exception 'The time zone "%" is not one the store knows, so dates cannot be matched in it.', p_time_zone
        using errcode = '22023',
              hint = 'Pass an IANA name such as America/Los_Angeles, or leave it out to use the organization''s calendar. Nothing was read.';
    end;
  end if;
  if v_term is null then return 'true'; end if;
  v_level := custom.effective_level(v_me, p_organization_id, p_table_id);
  v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible from jsonb_array_elements(v_mask -> 'visible') x;
  v_choices := coalesce(custom.choice_field_map(p_organization_id, p_table_id), '{}'::jsonb);
  v_pattern := '%' || replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_search := format(
    $s$exists (select 1 from jsonb_each(%1$I.data) e
                where e.key = any (%2$L::text[])
                  and (case jsonb_typeof(e.value) when 'string' then e.value #>> '{}'
                            else e.value::text end) ilike %3$L)$s$,
    p_alias, v_visible, v_pattern);
  for v_key in select k from jsonb_object_keys(v_choices) k where k = any (v_visible) loop
    select coalesce(array_agg(o.key), '{}'::text[]) into v_hits
      from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o
     where coalesce(o.value ->> 'label', '') ilike v_pattern;
    if cardinality(v_hits) > 0 then
      v_search := v_search || format(' or (%I.data -> %L) ?| %L::text[]', p_alias, v_key, v_hits);
    end if;
  end loop;
  return '(' || v_search || ')';
end
$function$;
