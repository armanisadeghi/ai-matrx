-- chair-step: custom.read_records_page gains one trailing argument, p_time_zone text DEFAULT NULL — a signature change, so it is dropped and made again in this one transaction with its exact body except its search, which becomes the one shared predicate custom.record_search_sql; its platform.client_callable_door row is moved to the new signature with an argument rule for p_time_zone, and its comment and EXECUTE grant to authenticated come back exactly as they stood. custom.record_search_sql(uuid, uuid, text, text, text) (internal, SECURITY INVOKER, no grant, no door row) gets its body replaced: the same older ILIKE plus three typed matches (a date as a person writes it, a phone by digits, money as the grid shows it), gated by pg_input_is_valid so no stored value can error a page. custom.record_aggregate and custom.agg_sql are untouched (chairgrid_b already hands p_search and p_time_zone through). No table, index, policy or data row is touched; nothing is widened: every match still reads only the columns custom.read_mask_for says this reader may see.
-- lane: CHAIR-GRID (asked by v6 lane 12 PLATFORM-APP-DATA for lane data-tables-grid-overhaul, "search door", grids review 3)
-- based-on: custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer) f28315df29fa4e1334837b9d6632fe01d456f3c29e293e27f75661ae65d9f4f4
-- based-on: custom.record_search_sql(uuid, uuid, text, text, text) e491c371f2df7a909c9fdf34806dbb6b0b4145b00c44963de2bc4524996e70f7
--
-- A SEARCH FINDS A DATE, A PHONE AND AN AMOUNT AS A PERSON WRITES THEM. The grid's search matched only the
-- raw stored value and a choice's label, so a person's "Oct 3" never found 2026-10-03, "(805) 555" never
-- found 8055551234, and "1,234.5" never found 1234.5 — the grid prints all three the way she types them
-- (grids review 3). The typed matches live in custom.record_search_sql, the fragment chairgrid_b gave both
-- doors, so the page and the footer summaries find the same rows for the same words.
--
-- THE READER'S ZONE. A datetime is a day only in some zone: 2026-10-03T03:30Z is Oct 3 in London and Oct 2
-- in Los Angeles. p_time_zone is the zone the grid is drawn in (the browser's), checked by name; left out,
-- the organization's calendar (custom.agg_calendar) decides, as every date bucket already does.
--
-- Inverse: migrations/inverse/chairgrid_c_a_search_finds_a_date_a_phone_and_an_amount_as_a_person_writes_them_down.sql

-- ── THE PRIMITIVE: the shared search learns the typed matches ──
CREATE OR REPLACE FUNCTION custom.record_search_sql(p_organization_id uuid, p_table_id uuid, p_search text, p_alias text DEFAULT 'r'::text, p_time_zone text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- THE SEARCH, AS ONE FRAGMENT (CHAIR-GRID, 2026-10-03). custom.read_records_page and custom.record_aggregate
-- both ask this, with the same arguments, so the rows a page shows and the rows a footer counts are the same
-- rows. 'true' when the term is blank.
--
-- WHAT MATCHES, per column this reader may see (custom.read_mask_for):
--   every column   the term ILIKE the stored value (a string by its text, anything else by its JSON text),
--                  and a choice column holding an option whose label matches — the older door's search.
--   a date         also the day as a person writes it: to_char(value::date, 'Mon FMDD, YYYY') ("Oct 3, 2026")
--                  and 'FMMonth FMDD, YYYY' ("October 3, 2026"). A datetime is a day only in some zone, so it
--                  is read in p_time_zone (checked; null = the organization's calendar, custom.agg_calendar).
--   a phone        also by digits alone, once the term carries at least three digits: "(805) 555" finds
--                  8055551234 because both sides are compared stripped of everything but digits.
--   money          also the formatted amount the grid prints — value.toLocaleString(): "1,234.5" — with
--                  and without the column's unit in front ("$1,234.5").
-- A stored value that is not a date / number does not make the row an error: pg_input_is_valid gates every
-- cast, so a stray word in a date column is simply not a date. Which kind a column IS follows
-- @ai-matrx/records fieldKindFor: date/datetime = type range with config.kind (or format) date / datetime;
-- money = type range with format currency; phone = type text with format phone (or Shows-as phone).
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
  v_digits  text;
  v_tz      text := p_time_zone;
  v_f       record;
  v_col     text;
  v_day     text;
  v_amount  text;
begin
  -- THE READER'S ZONE is checked before anything is read: an unknown zone is a refusal by name, never a
  -- silent fallback.
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
  v_digits := nullif(regexp_replace(v_term, '\D', '', 'g'), '');
  if length(coalesce(v_digits, '')) < 3 then v_digits := null; end if;

  -- the older door's search: the stored value, and a choice's words
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

  -- the typed matches: a date as written, a phone by digits, money as shown
  for v_f in
    select k.key,
           f.data ->> 'type' as type,
           lower(coalesce(f.data ->> 'format', '')) as format,
           lower(coalesce(f.data -> 'config' ->> 'kind', '')) as kind,
           lower(coalesce(f.data -> 'display_format' ->> 'id', '')) as shown_as,
           coalesce(f.data ->> 'unit', '') as unit
      from jsonb_each_text(coalesce(v_mask -> 'all_key_ids', '{}'::jsonb)) k
      join custom.record f on f.id = k.value::uuid
     where k.key = any (v_visible)
     order by k.key
  loop
    v_col := format('(%I.data ->> %L)', p_alias, v_f.key);
    if v_f.type = 'range' and (v_f.kind in ('date', 'datetime') or v_f.format in ('date', 'datetime')) then
      if v_f.kind = 'datetime' or v_f.format = 'datetime' then
        if v_tz is null then
          v_tz := custom.agg_calendar(p_organization_id) ->> 'time_zone';
        end if;
        v_day := format('(case when pg_input_is_valid(%1$s, ''timestamptz'') then ((%1$s)::timestamptz at time zone %2$L)::date end)', v_col, v_tz);
      else
        v_day := format('(case when pg_input_is_valid(%1$s, ''date'') then (%1$s)::date end)', v_col);
      end if;
      v_search := v_search || format(' or to_char(%1$s, ''Mon FMDD, YYYY'') ilike %2$L or to_char(%1$s, ''FMMonth FMDD, YYYY'') ilike %2$L', v_day, v_pattern);
    elsif v_f.type = 'text' and (v_f.format = 'phone' or v_f.shown_as = 'phone') then
      if v_digits is not null then
        v_search := v_search || format(' or regexp_replace(coalesce(%s, ''''), ''\D'', '''', ''g'') like %L', v_col, '%' || v_digits || '%');
      end if;
    elsif v_f.type = 'range' and v_f.format = 'currency' then
      v_amount := format('(case when pg_input_is_valid(%1$s, ''numeric'') then rtrim(rtrim(to_char((%1$s)::numeric, ''FM999,999,999,999,999,990.999''), ''0''), ''.'') end)', v_col);
      v_search := v_search || format(' or %1$s ilike %2$L or (%3$L || %1$s) ilike %2$L', v_amount, v_pattern, v_f.unit);
    end if;
  end loop;
  return '(' || v_search || ')';
end
$function$;
comment on function custom.record_search_sql(uuid, uuid, text, text, text) is
  'CHAIR-GRID: the ONE search predicate custom.read_records_page and custom.record_aggregate share, as a SQL fragment for the rows alias p_alias — the term ILIKE any column this reader may see, a choice whose label matches, a date as a person writes it (Mon D, YYYY / Month D, YYYY; a datetime read in p_time_zone, null = the organization''s calendar), a phone by its digits (term with 3+ digits), money as the grid prints it (with or without the unit); true when blank. Casts are gated by pg_input_is_valid. SECURITY INVOKER, called only inside the store''s own doors.';

-- ── THE PAGE DOOR: p_time_zone, and the shared predicate ──
drop function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer);
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
comment on function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text) is
  'DOOR-SPEED (lane data-tables-grid-overhaul, 2026-09-25): one page of one Table, sorted, searched, filtered and COUNTED by the store — the record-store twin of public.get_user_table_data_paginated_v2. Same wall, ladder, field mask and filter builder as custom.read_records_matching; documents built by custom.read_records_by_ids. Search and sort read only the columns this reader may see. Answers {total, limit, offset, rows:[{id, document, level}]}. CHAIR-GRID: the search is custom.record_search_sql (shared with custom.record_aggregate: typed date / phone / money matches); p_time_zone is the reader''s zone for its date matches (null = the organization''s calendar).';
update platform.client_callable_door
   set identity_args = 'p_organization_id uuid, p_table_id uuid, p_filter jsonb, p_search text, p_sort jsonb, p_view_id uuid, p_by_id boolean, p_limit integer, p_offset integer, p_time_zone text',
       identity_argtypes = array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'jsonb'::regtype::oid, 'text'::regtype::oid, 'jsonb'::regtype::oid, 'uuid'::regtype::oid, 'boolean'::regtype::oid, 'integer'::regtype::oid, 'integer'::regtype::oid, 'text'::regtype::oid],
       declared_by = 'chairgrid_c_a_search_finds_a_date_a_phone_and_an_amount_as_a_person_writes_them.sql',
       reason = reason || ' CHAIR-GRID: the search is the one shared predicate custom.record_search_sql (so the page and custom.record_aggregate agree); p_time_zone (text, optional, checked) is the reader''s zone for its date matches. It grants nothing.',
       argument_rules = jsonb_set(coalesce(argument_rules, '{"version": 1, "arguments": {}}'::jsonb), '{arguments,p_time_zone}',
         '{"type": "text", "check": "validated or interpreted by the function body after access is decided", "foreign": {"not_an_id": true}, "optional": true, "position": 10, "null_rule": {"means": "the function default applies"}}'::jsonb, true)
 where schema_name = 'custom' and function_name = 'read_records_page'
   and identity_args = 'p_organization_id uuid, p_table_id uuid, p_filter jsonb, p_search text, p_sort jsonb, p_view_id uuid, p_by_id boolean, p_limit integer, p_offset integer';
-- (No REVOKE: the §6d-4 guard clears PUBLIC's default EXECUTE on a brand-new SECURITY DEFINER function at birth.)
grant execute on function custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text) to authenticated;
