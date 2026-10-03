-- chair-step: this adds ONE helper, custom.confidential_header(uuid, uuid) (STABLE, SECURITY INVOKER, search_path '', EXECUTE revoked from every client role - only the store's own SECURITY DEFINER read doors call it, as the store's owner, exactly like custom.table_add_rung), and REPLACES the bodies of four read doors with the same signatures, same SECURITY DEFINER, same search_path, same grants and door rows (CREATE OR REPLACE keeps them): custom.read_record(uuid, uuid, boolean), custom.read_records(uuid, uuid, boolean, integer, integer), custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text), custom.record_headers(uuid, uuid[]). One thing changes: a row of a Confidential Table that the reader may not open answers its HEADER - {"id", "exists": true, "submitted_at"} - instead of an error (read_record) or nothing (the three list doors, only where the row is listed for her by "Shown to", and in read_records_page only on a plain page with no search, filter, sort or view). No value of the row, no column name, no level, nothing else is served. Every other row, table and door answers exactly as before. No table, column, index, policy or data row is touched.
-- lane: CHAIR-ACCESS (v6 chair sublane; item 3, HR proof gap 4 for lane 12 PLATFORM-APP-DATA)
-- based-on: custom.read_record(uuid, uuid, boolean) dbb40e301a344944dcab0c3430d813a7e36b8f448067f31e38f0baeb93632f31
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 446dd009888229fb5f84993919230b9911f5439a406711c9719d22d41cae2d0b
-- based-on: custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer, text) 95df849ae55449580af9327b5248130a47989a2b50669c74fe65aa5b6611f475
-- based-on: custom.record_headers(uuid, uuid[]) dbdb83ceed7a4eab037be08b2b80392226fcc47939cef422f25e62aed404e9b4
--
-- A LOCKED ROW SHOWS ITS HEADER.
--
-- THE GAP (lane 12, HR proof two, gap 4). A blind two-track review: the manager's review of the
-- employee and the employee's self-review sit in one Confidential Table (access ladder: the owner and
-- the people the record's own rules name). The employee's page must say "the manager's review was
-- submitted on <date>" - and before this file it could not: custom.read_record refused the row, the
-- lists left it out, so the stamp was typed by hand and could be faked. The ladder's Confidential
-- answer (custom.confidential_answer, CHAIR-CONFIDENTIAL-STORE / CHAIR-DOORS-3A) is unchanged: it still
-- decides who OPENS a row. This file adds the one safe thing a locked row may say about itself.
--
-- THE RULE. For a live row under a Confidential Table that custom.confidential_answer refuses the reader:
--   · custom.read_record            answers {id, exists: true, submitted_at} instead of 42501;
--   · custom.record_headers         includes the row (id, table_id, created_at, ... - it never carried a value);
--   · custom.read_records           lists it as a header row (document = the header, level null) where
--                                   "Shown to" lists it for her - "Only me" still hides it (T-36);
--   · custom.read_records_page      the same, on a PLAIN page only: a search hit, a filter match or a
--                                   sort position would say something about the row's values, so a page
--                                   that asks any question of the rows leaves locked rows out as before.
--   · custom.record_aggregate, custom.field_history, custom.record_history, custom.io_export: unchanged -
--     they measure, trace and export values, and a header has none; they leave the row out (proven).
-- submitted_at is the row's created_at: the moment it was filed, which nobody can write.
--
-- Guard (dev clone): scripts/campaign-tests/chairaccess_b_a_locked_row_shows_its_header_red_green.sql
-- Inverse: migrations/inverse/chairaccess_b_a_locked_row_shows_its_header_down.sql

-- ── NEW: the header of a row the reader may not open ──────────────────────────────────────────
CREATE FUNCTION custom.confidential_header(p_user uuid, p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  -- THE ONE SAFE THING A LOCKED ROW SAYS ABOUT ITSELF: that it exists, and when it was filed. Null
  -- unless the row is live, is a record (not a Table, Field, Rule, ...) of an organization that is
  -- not archived, sits under a Confidential Table, and the one Confidential answer refuses this
  -- person at viewer - i.e. exactly the rows the ladder locks. A row the person may open answers
  -- null here: she reads it through the read door. Nobody signed in: null.
  select case when p_user is not null
               and custom.confidential_answer(p_user, r.id, 'viewer'::public.permission_level) is false
              then jsonb_build_object('id', r.id, 'exists', true, 'submitted_at', r.created_at)
         end
    from custom.record r
    join iam.organizations o on o.id = r.organization_id
   where r.id = p_id
     and r.deleted_at is null
     and r.data_class = 'record'
     and o.archived_at is null
$function$;

revoke all on function custom.confidential_header(uuid, uuid) from public, anon, authenticated;

COMMENT ON FUNCTION custom.confidential_header(uuid, uuid) IS
  'The header of a row of a Confidential store Table that this person may not open: {id, exists: true, submitted_at}; null for any row she may open, any row not under a Confidential Table, an archived row or organization. Asked by custom.read_record, read_records, read_records_page and record_headers. CHAIR-ACCESS b (HR proof gap 4).';

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
  -- answer the same thing (custom.has_visibility is false for an id that is not there) - except a
  -- row of a Confidential Table this person is not named on, which answers its HEADER and nothing
  -- else: {id, exists: true, submitted_at} (CHAIR-ACCESS b, HR proof gap 4: a stamp nobody can fake).
  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    if custom.confidential_header(v_me, v_now) is not null then
      return custom.confidential_header(v_me, v_now);
    end if;
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
    -- CHAIR-ACCESS b: a Confidential Table stops the set lane here, so this is the one branch that
    -- walks its rows. A row this person may not open but which is listed for her ("Shown to") is
    -- returned as its HEADER only - {id, exists: true, submitted_at}, level null - so a page can say
    -- "submitted on <date>" without reading a word of it (HR proof gap 4). Every other row answers as
    -- before: custom.has_visibility, the one ladder.
    for v_rec in
      select q.id, q.rw, q.wv_values, q.wv_sources, q.opens, q.hdr
        from (select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources,
                     r.created_at,
                     custom.has_visibility(v_me, 'record', r.id, 'viewer') as opens,
                     custom.confidential_header(v_me, r.id) as hdr
                from custom.record r
               where r.organization_id = p_organization_id
                 and r.table_id = p_table_id
                 and r.deleted_at is null
                 and platform.shown_to_lists(r.shown_to, r.visibility, r.created_by, r.organization_id, v_me, v_lctx)) q
       where q.opens or q.hdr is not null
       order by q.created_at desc, q.id
       limit p_limit offset p_offset
    loop
      if not v_rec.opens then
        id := v_rec.id;
        document := v_rec.hdr;
        level := null;
        return next;
        continue;
      end if;
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
  v_plain     boolean;   -- CHAIR-ACCESS b: a page that asks nothing of the rows' values
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
  -- CHAIR-ACCESS b: on a PLAIN page (no search, no filter, no sort, no view) a row of a Confidential
  -- Table this person may not open, but which is listed for her ("Shown to"), is a row of the page
  -- too - as its HEADER only, {id, exists: true, submitted_at} (HR proof gap 4). Never when the page
  -- asks a question of the rows: a search hit, a filter match or a sort position on a row she may
  -- not read would say something about its values.
  v_plain := v_term is null
             and coalesce(p_filter, '{}'::jsonb) = '{}'::jsonb
             and (p_sort is null or jsonb_typeof(p_sort) <> 'array' or jsonb_array_length(p_sort) = 0)
             and p_view_id is null;
  v_where := format($w$
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and ((%s) or (%s))
       and %s$w$,
    p_organization_id, p_table_id,
    custom.listed_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    case when v_plain
         -- (the second argument of shown_to_lists is the row column T-13 retires - a legacy fallback
         -- for rows with no shown_to; this door never read it and does not start now: null)
         then format('custom.confidential_header(%L::uuid, r.id) is not null and platform.shown_to_lists(r.shown_to, null, r.created_by, r.organization_id, %L::uuid, %L::jsonb)',
                     v_me, v_me, custom._record_shown_to_ctx(array[p_organization_id], p_table_id))
         else 'false' end,
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
    -- CHAIR-ACCESS b: an id the read door does not open is a header row (a Confidential row this
    -- person is not named on); an id that is neither is simply not a row of the page.
    select coalesce(jsonb_agg(x.row order by x.n), '[]'::jsonb)
      into v_rows
      from (select o.n,
                   case when d.id is not null
                        then jsonb_build_object('id', d.id, 'document', d.document, 'level', d.level)
                        when h.hdr is not null
                        then jsonb_build_object('id', o.rid, 'document', h.hdr, 'level', null) end as row
              from unnest(v_ids) with ordinality o(rid, n)
              left join custom.read_records_by_ids(p_organization_id, p_table_id, v_ids, coalesce(p_by_id, false)) d on d.id = o.rid
              left join lateral (select custom.confidential_header(v_me, o.rid) as hdr) h on d.id is null) x
     where x.row is not null;
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
         -- CHAIR-ACCESS b: a row of a Confidential Table this person is not named on still answers
         -- its header here (this door never carries a value): id, when it was made, nothing else.
         and (r.id in (select v from custom.query_visible_ids(p_organization_id, v_t, 'viewer') v)
              or custom.confidential_header(v_me, r.id) is not null);
  end loop;
end
$function$;
