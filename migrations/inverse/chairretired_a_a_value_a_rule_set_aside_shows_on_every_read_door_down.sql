-- additive: no (restores four bodies, drops one function)
-- chair-step: the INVERSE of migrations/campaign/chairretired_a_a_value_a_rule_set_aside_shows_on_every_read_door.sql.
--   It restores the four read doors exactly as they stood on production on 2026-10-05 and drops custom.with_retired.
-- lane: CHAIR-RETIRED-VALUES
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) dea396b302c418bcbeaf1c1149219d390b8d338fbeea0f41d2e7114f67da4e17
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) d149a828a81b8c7b10e340ab3d0d3e738f1a5ce0e6db90afe8bb540c554d9c17
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 8a04b7caeffe737972898f107e422e7454c98e71c978708172d2ca89aef747d4
-- based-on: custom._read_record_with(uuid, uuid, boolean, jsonb, jsonb) def707c85b0b17feec6ecb2a45f223832125c73d88168de0d586f2bfedab29c1

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

CREATE OR REPLACE FUNCTION custom.read_records_by_ids(p_organization_id uuid, p_table_id uuid, p_record_ids uuid[], p_by_id boolean DEFAULT false)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_rec      record;
  v_set      record;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_n        integer := coalesce(cardinality(p_record_ids), 0);
  v_rows     custom.record[];
  v_row      custom.record;
  v_levels   jsonb;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_by_ids');

  -- NOTHING ASKED FOR IS NOT AN ERROR — it is an empty answer, and it costs nothing.
  if v_n = 0 then
    return;
  end if;

  -- THE SAME CEILING THE PAGE DOORS DECLARE, and it refuses above it by name rather than
  -- handing back a short list the caller cannot tell from a complete one.
  perform custom.page_size(p_organization_id, 'custom.read_records_by_ids', v_n, 200);

  -- STEP 1, ONCE: THE ONE LADDER decides WHICH rows. Identical call, identical arguments to
  -- the page door's. This is the question that must never be asked twice in two ways.
  v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
  end if;

  -- STORE-READ-PERF-2: the rows first, in the door's own order, so the ladder can be asked about
  -- the whole set at once (custom.levels_of) instead of once per row inside custom.read_mask.
  select coalesce(array_agg(r order by r.created_at desc, r.id), '{}'::custom.record[]) into v_rows
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = p_table_id
       and r.deleted_at is null
       and r.id = any (p_record_ids)
       and ( case
               -- The ladder could not answer in a bounded way, so each row is asked directly —
               -- `read_records`' fallback arm, and the same single call.
               when v_set.o_fallback then
                 custom.has_visibility(v_me, 'record', r.id, 'viewer')
               -- Every live row of this Table is hers.
               when v_set.o_all_visible then
                 true
               -- A class she holds, WITH EXCEPTIONS: a granted id is never answered by its
               -- class (VIS-19), and containment only ever adds (VIS-6).
               when coalesce(array_length(v_set.o_true_visibility, 1), 0) > 0 then
                 ( r.created_by = v_me
                   or (r.visibility = any (v_set.o_true_visibility)
                       and not (r.id = any (v_set.o_granted_all)))
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
               -- Nothing by class — `shared_only`, or a Table nobody shared with her.
               else
                 ( r.created_by = v_me
                   or r.id = any (v_set.o_granted_visible)
                   or r.id = any (v_set.o_carried_visible) )
             end )
  ;
  v_levels := custom.levels_of(v_me, (select array_agg(x.id) from unnest(v_rows) x));

  foreach v_row in array v_rows
  loop
    select * into v_vs from custom.record_values_step(v_row, v_cache);
    v_cache := v_vs.o_cache;
    if v_cr is null then
      v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
    end if;
    -- STEP 2, PER ROW: THE ONE MASK decides which FIELDS of it she may see, at the level she
    -- holds ON THIS RECORD. The same call `custom.read_record` makes for its one row.
    -- The row is in p_organization_id and p_table_id (the query above says so), which is the
    -- organization and Table custom.read_mask took the mask in; the rung is the set's answer.
    v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id,
                                   (v_levels -> v_row.id::text ->> 'l')::public.permission_level, 'read');
    -- DOOR-N-5: id-keyed on request means EVERY declared Field's key, as the page doors do.
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
      from jsonb_array_elements(v_mask -> 'declared') x;

    id := v_row.id;
    document := custom.choice_render_with(p_organization_id, p_table_id,
                  custom.mask_document(v_vs.o_doc, v_visible, v_mask -> 'notices', p_by_id,
                                       v_mask -> 'all_key_ids', v_declared), v_cr);
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_row.data -> '_values', v_row.data -> '_sources', v_visible, p_by_id, v_mask -> 'all_key_ids');
    level := (v_mask ->> 'level')::public.permission_level;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.read_records_matching(p_organization_id uuid, p_table_id uuid, p_filter jsonb DEFAULT '{}'::jsonb, p_by_id boolean DEFAULT false, p_limit integer DEFAULT 200, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, document jsonb, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
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
  v_limit    integer;
  v_sql      text;
  v_gone     jsonb;
  v_cache    jsonb := '{}'::jsonb;
  v_vs       record;
  v_cr       jsonb;
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- THE ORGANIZATION WALL, FIRST, AND IN THIS DOOR'S OWN BODY. `custom.record_aggregate` —
  -- the door that COUNTS the number this one opens — asks exactly this on its first line, and
  -- its twin asking less would mean a number and its rows were judged by two different sets of
  -- questions. It also answers the store's own switch: a caller reaching a closed store is
  -- refused before a Table id is even looked at.
  --
  -- 🚨 AND IT IS WHAT MAKES THE ROW DECISION READABLE FROM THIS BODY (check:store-doors-decide,
  -- 2026-09-22). This door decides every row through `custom.visible_predicate_sql`, which asks
  -- `custom.visible_set` — the one ladder — and writes its four arms into this door's own WHERE.
  -- That is a real decision, but it happens through a helper and inside a generated statement,
  -- so a census reading this body found no ladder call in it and said so. A door whose access
  -- decision cannot be READ off it is one refactor away from a door that does not make one.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_matching');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_matching');
  v_limit := custom.page_size(p_organization_id, 'custom.read_records_matching', p_limit, 200);

  -- STEP 2, once per request: which fields this caller may see, at which level. The level
  -- used for the field question is the caller's level on the TABLE, so a page of a hundred
  -- records asks the field question once, not a hundred times.
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

  -- STEP 1, ONCE: Visibility, and the caller's question, in the SAME where clause.
  -- `custom.visible_predicate_sql` asks `custom.visible_set` once and writes out the same
  -- four arms `custom.read_records` branches on, as a predicate the planner can drive an
  -- index with. `custom.record_filter_sql` writes the caller's question the one way this
  -- database writes it. Neither the caller's keys nor the caller's values ever become SQL:
  -- a key is refused by shape (custom.agg_assert_key), a value is a quoted literal, and a
  -- moment in a window is cast to timestamptz in this transaction before the statement is
  -- built.
  v_sql := format($q$
    select r.id, r as rw, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources, r.data -> '_sources' as src
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
     order by r.created_at desc, r.id
     limit %s offset %s
  $q$,
    p_organization_id, p_table_id,
    custom.listed_predicate_sql(v_me, p_organization_id, p_table_id,
                                 'viewer'::public.permission_level, 'r'),
    -- CHOICE-VALUE. A chart hands back the RENDERED word of a dropdown and the store holds
    -- the key, so the filter is normalised to what is STORED before the statement is built —
    -- the same one line `custom.record_aggregate` runs before it counts.
    --
    -- S2-PRIME FILTER-GROUPS: the question comes in either shape. A flat map is normalised as
    -- before; a Rule expression ({op, args}, ALL / ANY / NOT to any depth) is compiled by the
    -- same one fragment the aggregate and the board write, over this reader's visible columns.
    custom.record_filter_sql(p_organization_id, p_table_id,
      case when custom.filter_is_rule(p_filter) then p_filter
           else custom.choice_filter_normalize(custom.choice_field_map(p_organization_id, p_table_id), p_filter) end),
    v_limit, greatest(coalesce(p_offset, 0), 0));

  for v_rec in execute v_sql loop
    -- STORE-READ-PERF-2: custom.record_values_of(r) and custom.choice_render with the Table's
    -- plans carried from row to row instead of asked again on every row.
    select * into v_vs from custom.record_values_step(v_rec.rw, v_cache);
    v_cache := v_vs.o_cache;
    if v_cr is null then
      v_cr := custom.choice_render_plan(p_organization_id, p_table_id);
    end if;
    id := v_rec.id;
    document := custom.choice_render_with(p_organization_id, p_table_id,
                  custom.mask_document(v_vs.o_doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared), v_cr);
    -- GRID-TAILS: a relation to a record that no longer exists says so. `record_values_of`
    -- strips `_sources` (provenance is not a value), and with it went the one fact the grid
    -- needs: WHICH cell moved empty because what it pointed at was gone. Only that fact comes
    -- back, only for columns this reader may see, keyed the way the document is keyed.
    v_gone := custom.unresolved_sources_of(v_rec.src, v_visible, p_by_id, v_key_ids);
    if v_gone is not null then
      document := document || jsonb_build_object('_sources', v_gone);
    end if;
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
    level := v_level;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._read_record_with(p_organization_id uuid, p_record_id uuid, p_by_id boolean, p_levels jsonb, p_cache jsonb, OUT o_doc jsonb, OUT o_cache jsonb)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me       uuid := auth.uid();
  v_table    uuid;
  v_doc      jsonb;
  v_mask     jsonb;
  v_visible  text[];
  v_declared text[];
  v_now      uuid;
  v_alts     jsonb;
  v_retired  jsonb;
  v_out      jsonb;
  v_wv_values  jsonb;
  v_wv_sources jsonb;
  v_row      custom.record;
  v_vs       record;
  v_ck       text;
  v_mk       text;
  v_wk       text;
  v_ak       text;
  v_level    public.permission_level;
  v_known    boolean;
  v_key_ids  jsonb;
begin
  o_cache := coalesce(p_cache, '{}'::jsonb);
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST, AND IT WAS NOT DECIDED AT ALL.
  -- REC-29: "organizations are hard walls, and a door decides who may reach one before it
  -- decides anything else" — every other door in this store obeys it and DOOR-1, the one read
  -- door, did not. It made no membership decision about the organization it was handed.
  -- CHAIR-READPERF (round 2): asked once per organization in one call. The wall's yes holds for the
  -- statement (custom.assert_client_may_reach remembers it itself, at the price of a hash of the
  -- person's claims on every ask); a set door reading 600 records of one organization carries the
  -- yes in o_cache instead. A no raises, so it is never carried. The cache is this door's own: no
  -- client role may call it (it has no client grant), exactly as with the rungs it is handed.
  v_wk := 'w:' || p_organization_id::text;
  if not coalesce(o_cache ? v_wk, false) then
    perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');
    if v_wk is not null then
      o_cache := o_cache || jsonb_build_object(v_wk, true);
    end if;
  end if;

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  -- CHAIR-READPERF (round 2): custom.resolve_id follows custom.record_alias rows of this organization
  -- that are not revoked; an organization that keeps none answers every id with itself, so whether
  -- it keeps any is asked once per call and the per-record lookup is skipped when it keeps none.
  v_ak := 'al:' || p_organization_id::text;
  if not coalesce(o_cache ? v_ak, true) then
    o_cache := o_cache || jsonb_build_object(v_ak, exists (
                 select 1 from custom.record_alias ra
                  where ra.organization_id = p_organization_id and ra.revoked_at is null));
  end if;
  v_now := case when coalesce((o_cache ->> v_ak)::boolean, true)
                then custom.resolve_id(p_organization_id, p_record_id)
                else p_record_id end;
  -- STORE-READ-PERF-2: a set door that already asked the ladder about this record for the whole
  -- set (custom.levels_of) hands the answer in; alone, the door asks it here as it always did.
  v_known := coalesce(p_levels ? v_now::text, false);

  -- AND THE LADDER BEFORE EXISTENCE. This used to raise 02000 "there is no record % in this
  -- organization" BEFORE asking custom.has_visibility, so the two answers differed: a caller who
  -- guessed a record uuid learned whether it existed in that organization (02000) or not
  -- (42501). One bit per guess, and the store's own rule is that a record you may not open and a
  -- record that is not there answer the same thing. `custom.has_visibility` answers false for an
  -- id that is not there, so this ordering makes the two identical without a second read.
  if not (case when v_known then (p_levels -> v_now::text ->> 's')::boolean
               else custom.has_visibility(v_me, 'record', v_now, 'viewer') end) then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  select r.* into v_row
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    -- Only somebody the ladder has already admitted reaches this sentence, so it now tells a
    -- person who holds the record that it is in the trash — and tells a stranger nothing.
    raise exception 'There is no such record in this organization.' using errcode = '02000', hint = 'It was deleted, or it never existed here.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;
  v_table := v_row.table_id;
  v_wv_values := v_row.data -> '_values';
  v_wv_sources := v_row.data -> '_sources';
  -- custom.record_values_of(r), with the Table's plan carried from record to record.
  select * into v_vs from custom.record_values_step(v_row, o_cache);
  v_doc := v_vs.o_doc;
  o_cache := v_vs.o_cache;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  -- CHAIR-READPERF (2026-10-03): taken from the row this door holds — custom.read_mask_at re-read it
  -- by id alone (every partition) to learn the Table and organization already in v_row — and kept in
  -- o_cache per (organization, Table, rung) for the rest of the call, so a set door parses each
  -- Table's mask once. The rung is the set's answer when a set door handed it in, else the ladder's,
  -- asked only for a row that has a Table (a row with no Table takes the empty mask either way).
  if v_table is not null then
    v_level := case when v_known then (p_levels -> v_now::text ->> 'l')::public.permission_level
                    else custom.effective_level(v_me, p_organization_id, v_now) end;
  end if;
  v_mk := 'rm:' || p_organization_id::text || ':' || coalesce(v_table::text, '-') || ':' || coalesce(v_level::text, '-');
  v_mask := o_cache -> v_mk;
  if v_mask is null then
    v_mask := custom.read_mask_for(v_me, p_organization_id, v_table, v_level, 'read');
    o_cache := o_cache || jsonb_build_object(v_mk, v_mask);
  end if;
  -- STORE-READ-PERF-2 / DOOR-N-5: id-keyed on request means EVERY declared Field's key, as the
  -- page doors have always done — not only the hidden ones.
  v_key_ids := coalesce(v_mask -> 'all_key_ids', v_mask -> 'key_ids');
  v_visible := array(select jsonb_array_elements_text(coalesce(v_mask -> 'visible', '[]'::jsonb)));
  v_declared := array(select jsonb_array_elements_text(coalesce(v_mask -> 'declared', '[]'::jsonb)));

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_key_ids, v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  if v_table is not null then
    v_ck := 'cr:' || p_organization_id::text || ':' || v_table::text;
    if not (o_cache ? v_ck) then
      o_cache := o_cache || jsonb_build_object(v_ck, custom.choice_render_plan(p_organization_id, v_table));
    end if;
    v_out := custom.choice_render_with(p_organization_id, v_table, v_out, o_cache -> v_ck);
  end if;

  -- BIG-VALUES-READERS. A value too big for one cell keeps its first words here and its whole
  -- text in a file; the pointer (`_values.<key>.src` -> `_sources.<ptr>`, the file fields only)
  -- rides along for the keys this reader may see, so a screen opens the file and an agent's
  -- context reads the whole text. Nothing else of the provenance block is carried.
  -- SCOPES-HANDOFF-BUDGET: asked only when the record keeps a whole value in a file. Otherwise
  -- custom.with_whole_value_pointers hands the document back unchanged (whole_value_pointer_of is
  -- null for every key when `_sources` is not an object or names no whole_value_in_file), but a
  -- record with `_values` and no `_sources` took its slow arm and cost a third of a millisecond.
  if jsonb_typeof(v_wv_values) = 'object' and jsonb_typeof(v_wv_sources) = 'object'
     and exists (select 1 from jsonb_each(v_wv_sources) s0
                  where s0.value ->> 'kind' = 'whole_value_in_file'
                    and coalesce(s0.value ->> 'file_id', '') <> '') then
    v_out := custom.with_whole_value_pointers(v_out, v_wv_values, v_wv_sources, v_visible, p_by_id,
                                              v_key_ids);
  end if;

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  -- SCOPES-HANDOFF-BUDGET: read from v_row, the row fetched above by its key (organization, id) —
  -- the same row this query used to fetch a second time — and only when some value keeps one.
  if v_wv_values is not null
     and (jsonb_typeof(v_wv_values) <> 'object' or v_wv_values @? '$.*.alternates') then
    select jsonb_object_agg(k, alts) into v_alts
      from (
        select e.key as k,
               (select jsonb_agg(jsonb_build_object(
                         'value',  a -> 'value',
                         'rank',   a -> 'rank',
                         'source', v_row.data -> '_sources' -> (a ->> 'src'))
                       order by (a ->> 'rank')::int)
                  from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
          from jsonb_each(coalesce(v_row.data -> '_values', '{}'::jsonb)) e
         where e.key = any (v_visible)
           and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
      ) x
     where x.alts is not null;
  end if;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  -- SCOPES-HANDOFF-BUDGET: from v_row (the same row, by its key), and only when it keeps one.
  if v_row.data ? '_retired' then
    select jsonb_agg(x order by x ->> 'key') into v_retired
      from jsonb_array_elements(coalesce(v_row.data -> '_retired', '[]'::jsonb)) x
     where ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));
  end if;

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  o_doc := v_out;
end;
$function$;

drop function if exists custom.with_retired(jsonb, jsonb, text[], text[]);
