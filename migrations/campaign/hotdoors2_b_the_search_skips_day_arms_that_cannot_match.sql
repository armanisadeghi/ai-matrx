-- lane: HOT-DOORS-2
-- based-on: custom.record_search_sql(uuid, uuid, text, text, text) 9a93198e35199a14160c729bce9a4f9517ca78f8adc4309d82b8251f7f32f2af
--
-- HOT-DOORS-2 (2026-10-08), part b: the day arms of the page search are left out for a term that cannot be
-- part of a day as written (measured: 100 ms of a 280 ms statement on a 25,000-row Table).
-- Function body only: any hour. Inverse: migrations/inverse/hotdoors2_b_the_search_skips_day_arms_that_cannot_match_down.sql

set local statement_timeout = '60s';

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
  v_no_dates boolean := false;   -- HOT-DOORS-2: the term cannot be part of a day as written
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
  -- HOT-DOORS-2 (2026-10-08): THE SAME ANSWER IN ONE LOOK PER ROW. The old arm expanded every row's whole
  -- document with jsonb_each and tested each pair (a 25,000-row Table, term found in a third of the rows:
  -- 400 ms of the page's 660). Here the visible columns' values are read straight (->> gives a string by its
  -- text and anything else by its JSON text, exactly the old CASE), joined with a separator no term can
  -- contain, and tested once. Only a JSON null differs (->> says none, the old arm said 'null'), a term
  -- that could match the word null, a term holding the separator, a reader with no visible column or more
  -- than 90 keeps the old arm. Same rows either way (compared on every page of three searches x two sorts).
  if cardinality(v_visible) between 1 and 90
     and position(chr(1) in v_term) = 0
     and 'null' not ilike v_pattern then
    v_search := format('concat_ws(chr(1), %s) ilike %L',
                       (select string_agg(format('%I.data ->> %L', p_alias, k), ', ' order by o) from unnest(v_visible) with ordinality u(k, o)),
                       v_pattern);
  else
    v_search := format(
      $s$exists (select 1 from jsonb_each(%1$I.data) e
                  where e.key = any (%2$L::text[])
                    and (case jsonb_typeof(e.value) when 'string' then e.value #>> '{}'
                              else e.value::text end) ilike %3$L)$s$,
      p_alias, v_visible, v_pattern);
  end if;
  for v_key in select k from jsonb_object_keys(v_choices) k where k = any (v_visible) loop
    select coalesce(array_agg(o.key), '{}'::text[]) into v_hits
      from jsonb_each(coalesce(v_choices -> v_key -> 'options', '{}'::jsonb)) o
     where coalesce(o.value ->> 'label', '') ilike v_pattern;
    if cardinality(v_hits) > 0 then
      v_search := v_search || format(' or (%I.data -> %L) ?| %L::text[]', p_alias, v_key, v_hits);
    end if;
  end loop;

  -- HOT-DOORS-2 (2026-10-08): THE DAY ARMS ONLY WHEN THE TERM COULD BE PART OF A DAY. A day as written is
  -- "<Month name> <day>, <year>": apart from the month's name it holds only digits, spaces and commas. A term
  -- with none of those characters can only match inside the month's name, so if it is in no month's name
  -- (in the database's own month names, checked here by the same ILIKE) the day arms can never match and
  -- are left out: they cost 100 ms on a 25,000-row Table (two to_char per row, each behind a date check).
  -- Month names holding a digit, space or comma (some locale) turn the shortcut off.
  if v_term !~ '[0-9 ,]'
     and not exists (select 1 from generate_series(1, 12) m
                      where to_char(make_date(2000, m, 1), 'FMMonth') ~ '[0-9 ,]'
                         or to_char(make_date(2000, m, 1), 'Mon') ~ '[0-9 ,]')
     and not exists (select 1 from generate_series(1, 12) m
                      where to_char(make_date(2000, m, 1), 'FMMonth') ilike v_pattern
                         or to_char(make_date(2000, m, 1), 'Mon') ilike v_pattern) then
    v_no_dates := true;
  end if;

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
    if v_f.type = 'range' and (v_f.kind in ('date', 'datetime') or v_f.format in ('date', 'datetime')) and v_no_dates then
      null;   -- HOT-DOORS-2: this term cannot match a day as written
    elsif v_f.type = 'range' and (v_f.kind in ('date', 'datetime') or v_f.format in ('date', 'datetime')) then
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
