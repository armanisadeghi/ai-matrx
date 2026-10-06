-- lane: CHAIR-WORLD-LANE-2
-- chair-step: drops only the helper chairworld_e_the_table_page_reads_whole_for_a_public_reader.sql created (and its door row); restores five bodies as they were.
-- based-on: custom.door_reads_only(text) 0ce0cbcf584809015204964f642b75f4d1d456edac066fa6780cbd60ac3f3d28
-- based-on: custom.io_imports(uuid, uuid, integer) a6a68abb428a5e38f12abf96b670b9dfc1b3cf0bbac5e79d838f62981369e788
-- based-on: custom.my_levels(uuid, jsonb, text) 49ce08826fb6aaa18fb55904614dde6c40b84c76e53f5db81ad3b1a02380480b
-- based-on: custom.read_record(uuid, uuid, boolean) 5408520472d57e94f32b9329a9246152214832a7d1fe71647bbf83c2e3bf98a9
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 1aca80c2555f50fe08976366e6ca587e468dfc89955be9f947d8713ec1b624a2
-- based-on: custom.world_reader_may_know_row(uuid, uuid) 3fcc3cc6c69b933d2dddb73be3320d3cda35f587134d586f8c070e8cf6567af1
-- ground-standing-ok: b — this inverse runs BEFORE chairworld_d's and chairworld_a's (it undoes the latest file first);
-- the bodies it restores call helpers those files created and only their own inverses drop.
-- Inverse of migrations/campaign/chairworld_e_the_table_page_reads_whole_for_a_public_reader.sql: the five bodies exactly as live before it, then the helper and its
-- door row removed.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION custom.door_reads_only(p_door text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- THE READ DOORS THE WORLD LANE ADMITS (CHAIR-WORLD-LANE), by the name each passes to
  -- custom.assert_client_may_reach. A door joins this list only when it names its Table to
  -- custom.assert_may_know_table / custom.assert_client_may_open (or to
  -- custom.assert_public_reader_names_a_public_table) right after the wall, and writes nothing.
  select coalesce(p_door = any (array[
    'platform.resolve_id',
    'custom.where_id_opens',
    'custom.read_records',
    'custom.read_records_page',
    'custom.read_record',
    'custom.read_records_by_ids',
    'custom.read_records_matching',
    'custom.read_records_in_view_order',
    'custom.record_aggregate',
    'custom.applicable_fields',
    'custom.views',
    'custom.view_look_read',
    'custom.table_decorations',
    'custom.table_dimensions',
    'custom.table_kind_facts',
    -- CHAIR-WORLD-LANE-2: field_options names the Field's Table, record_change_actions names its Table, and
    -- work_inbox answers a world-lane reader empty (custom.world_reader_only) — none of them writes.
    'custom.field_options',
    'custom.record_change_actions',
    'custom.work_inbox'
  ]), false)
$function$;

CREATE OR REPLACE FUNCTION custom.io_imports(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_imports');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_imports');
  end if;
  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.opened_at desc), '[]'::jsonb) into v_out
    from (
      select i.id as import_id, i.table_id, i.format, i.source_name, i.file_hash,
             i.dedupe_key, i.policy, i.state, i.rows_seen, i.rows_written, i.rows_duplicate,
             i.rows_seen - i.rows_written - i.rows_duplicate as rows_refused,
             jsonb_array_length(coalesce(i.proposals, '[]'::jsonb)) as columns_offered,
             i.created_at as opened_at, i.finished_at, i.created_by
        from custom.io_import i
       where i.organization_id = p_organization_id
         and i.deleted_at is null
         and (p_table_id is null or i.table_id = p_table_id)
         -- A RUN IS ON A TABLE, so who may know about the run is who may know about the
         -- table. Listing every organization's runs to any member would name Tables they
         -- cannot open (T10).
         and custom.table_is_live(p_organization_id, i.table_id)
       order by i.created_at desc
       limit custom.page_size(p_organization_id, 'custom.io_imports', p_limit, 25, 200)) s;
  return v_out;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.my_levels(p_organization_id uuid, p_ids jsonb, p_type text DEFAULT 'record'::text)
 RETURNS TABLE(id uuid, level permission_level)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me uuid;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.my_levels');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.my_levels');

  v_me := custom.query_principal();
  if v_me is null then
    raise exception 'Nobody is signed in, so there is no access to describe.'
      using errcode = '42501',
            hint = 'DOOR-1: this door resolves the person from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;

  if p_ids is not null and jsonb_typeof(p_ids) <> 'array' then
    raise exception 'This door was asked about a list of things and was not given a list.'
      using errcode = '22023',
            hint = 'p_ids is a JSON array of record ids, for example ["11111111-1111-4111-8111-111111111111"].';
  end if;

  -- Every id asked about gets a row. A subject this person holds nothing on
  -- answers null, because a missing row and "no access" would be the same thing
  -- to the screen that asked, and one of them is a silence.
  return query
  select a.asked::uuid,
         custom.effective_level(v_me, p_organization_id, a.asked::uuid,
                                coalesce(nullif(btrim(p_type), ''), 'record'))
    from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) as a(asked);
end
$function$;

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
  -- CHAIR-WORLD-LANE: a person admitted only through the world lane reads a row of a Public Table and no other
  -- (the Table the row lives in; a Table record itself lives in the kernel Table, which is never Public).
  perform custom.assert_public_reader_names_a_public_table(p_organization_id,
    (select r.table_id from custom.record r
      where r.organization_id = p_organization_id and r.id = v_now),
    'custom.read_record');

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
      -- CHAIR-RETIRED-VALUES: the values a tightened rule set aside, masked like the value they were.
      document := custom.with_retired(document, (v_rec.rw).data -> '_retired', v_visible, v_declared);
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
      -- CHAIR-RETIRED-VALUES: the values a tightened rule set aside, masked like the value they were.
      document := custom.with_retired(document, (v_rec.rw).data -> '_retired', v_visible, v_declared);
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
      -- CHAIR-RETIRED-VALUES: the values a tightened rule set aside, masked like the value they were.
      document := custom.with_retired(document, (v_rec.rw).data -> '_retired', v_visible, v_declared);
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
      -- CHAIR-RETIRED-VALUES: the values a tightened rule set aside, masked like the value they were.
      document := custom.with_retired(document, (v_rec.rw).data -> '_retired', v_visible, v_declared);
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'world_reader_may_know_row';
drop function custom.world_reader_may_know_row(uuid, uuid);
