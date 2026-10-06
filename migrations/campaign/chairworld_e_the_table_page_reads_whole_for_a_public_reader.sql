-- additive: yes
-- lane: CHAIR-WORLD-LANE-2
-- chair-step: its only REVOKE takes EXECUTE from PUBLIC, anon and authenticated on the one helper this file creates (internal, asked only inside custom.my_levels); no existing function loses a grant.
-- based-on: custom.door_reads_only(text) 37be611b8beba7714bc1efba45f747f707fe7a254b0ce8f3f238e68bffd08ba3
-- based-on: custom.io_imports(uuid, uuid, integer) de4c5954f259df0b5b3de46c2e59abdcf9f77b7dad2cdd8c66ae5589f2f24c85
-- based-on: custom.my_levels(uuid, jsonb, text) 9197921c42be933c511af899fbbc1ea90e183cb7133317f78e3b4e32deb8f6b2
-- based-on: custom.read_record(uuid, uuid, boolean) 641f7ece6acb44dfe7d91b10d0fe311427b2c578308b97519d53bddea55ae2d7
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) dea396b302c418bcbeaf1c1149219d390b8d338fbeea0f41d2e7114f67da4e17
-- LOCKS: one new function (EXECUTE revoked from PUBLIC, anon and authenticated) and five function bodies
-- (CREATE OR REPLACE keeps their grants). No table, row, trigger, grant or policy is touched.
--
-- THE TABLE PAGE READS WHOLE FOR A PUBLIC READER (CHAIR-WORLD-LANE-2, after chairworld_d). With d live the page
-- named "Example: Project Tracker" for test@test.com and then refused on the next wave of doors it asks:
-- read_record (the Table's own record), read_records (the Table kernel — the organization's Table list), my_levels,
-- io_imports, grid_layout, row_actions, reverse_columns and table_capacity.
--
-- 1. custom.world_reader_may_know_row(org, id) — a live Public Table, a live row of one, or one of its definition
--    rows (custom.public_definition_owner).
-- 2. custom.door_reads_only adds grid_layout, row_actions, reverse_columns, table_capacity (each names its Table
--    through custom.assert_may_know_table; reverse_columns lists only Tables the reader may know), io_imports and
--    my_levels.
-- 3. custom.io_imports answers a world-lane-only seat an empty list (she ran nothing here; who did is not hers).
-- 4. custom.my_levels answers a world-lane-only seat about (1) only; anything else is null, as for any subject
--    she holds nothing on.
-- 5. custom.read_record: a definition row of a Public Table (its Table record above all) passes through
--    custom.world_reader_reads_public_definition (chairworld_d); anything else meets the Table check as before,
--    and the ladder decides the row after either.
-- 6. custom.read_records on the Table kernel, for a world-lane-only seat: the organization's live Public Tables,
--    through custom.read_records_by_ids, newest first. Every other read_records call is unchanged.
-- Writes are untouched.
-- Inverse: migrations/inverse/chairworld_e_the_table_page_reads_whole_for_a_public_reader_down.sql.

set local lock_timeout = '3s';

create or replace function custom.world_reader_may_know_row(p_organization_id uuid, p_record_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  -- Is this row of the organization a live Public Table, a live row of one, or one of its definition rows
  -- (custom.public_definition_owner)? What a world-lane reader may be told about. (CHAIR-WORLD-LANE-2)
  select exists (
    select 1 from custom.record r
     where r.organization_id = p_organization_id
       and r.id = p_record_id
       and r.deleted_at is null
       and ((r.table_id = custom.table_kernel_id() and r.published_to_web)
            or exists (select 1 from custom.record t
                        where t.organization_id = p_organization_id and t.id = r.table_id
                          and t.table_id = custom.table_kernel_id() and t.deleted_at is null
                          and t.published_to_web)
            or custom.public_definition_owner(p_organization_id, r.table_id, r.id) is not null))
$function$;

insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
values
 ('custom', 'world_reader_may_know_row', pg_get_function_identity_arguments('custom.world_reader_may_know_row(uuid,uuid)'::regprocedure),
  ARRAY['uuid'::regtype, 'uuid'::regtype]::oid[],
  'p_organization_id is an organization id and p_record_id a row id inside it; the answer is one boolean (is it a Public Table, a row of one, or one of its definition rows) and names nothing.',
  'campaign chairworld_e_the_table_page_reads_whole_for_a_public_reader.sql',
  'server_only: asked only inside custom.my_levels; no client ever calls it.', false, false)
on conflict do nothing;

revoke execute on function custom.world_reader_may_know_row(uuid, uuid) from public, anon, authenticated;

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
    'custom.work_inbox',
    -- CHAIR-WORLD-LANE-2 (e): grid_layout, row_actions, reverse_columns and table_capacity name their Table through
    -- custom.assert_may_know_table; io_imports answers a world-lane reader an empty list and my_levels answers her
    -- only about a Public Table and its own rows (custom.world_reader_may_know_row) — none of them writes.
    'custom.grid_layout',
    'custom.row_actions',
    'custom.reverse_columns',
    'custom.table_capacity',
    'custom.io_imports',
    'custom.my_levels'
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
  -- CHAIR-WORLD-LANE-2: a person admitted only to READ a Public Table of this organization has run no import here,
  -- and is not told who did; the list is empty.
  if custom.world_reader_only(p_organization_id) then
    return '[]'::jsonb;
  end if;
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
  v_world boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.my_levels');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.my_levels');
  v_world := custom.world_reader_only(p_organization_id);

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
         -- CHAIR-WORLD-LANE-2: a person admitted only through the world lane is answered about a Public Table, its
         -- rows and its definition rows, and about nothing else (null, as for any subject she holds nothing on).
         case when v_world and not custom.world_reader_may_know_row(p_organization_id, a.asked::uuid) then null
              else custom.effective_level(v_me, p_organization_id, a.asked::uuid,
                                          coalesce(nullif(btrim(p_type), ''), 'record')) end
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
  -- CHAIR-WORLD-LANE-2: or the row is a definition row of a Public Table (its Table record, a Field, a choice) —
  -- custom.world_reader_reads_public_definition answers that for a world-lane-only seat and opens, for this
  -- statement, the one kernel or options Table it lives in to the doors read_record calls on its way.
  if not custom.world_reader_reads_public_definition(p_organization_id,
           (select r.table_id from custom.record r
             where r.organization_id = p_organization_id and r.id = v_now),
           array[v_now]) then
    perform custom.assert_public_reader_names_a_public_table(p_organization_id,
      (select r.table_id from custom.record r
        where r.organization_id = p_organization_id and r.id = v_now),
      'custom.read_record');
  end if;

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
  -- CHAIR-WORLD-LANE-2: the wall first (custom.assert_may_know_table asks it next, unchanged). A person it admitted
  -- ONLY through the world lane who lists the Tables of this organization (the Table kernel) is answered the
  -- organization's live Public Tables and nothing else — through custom.read_records_by_ids, the same page order.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records');
  if p_table_id = custom.table_kernel_id() and custom.world_reader_only(p_organization_id) then
    return query
      select b.id, b.document, b.level
        from custom.read_records_by_ids(p_organization_id, p_table_id,
               array(select t.id from custom.record t
                      where t.organization_id = p_organization_id
                        and t.table_id = custom.table_kernel_id()
                        and t.deleted_at is null
                        and t.published_to_web
                      order by t.created_at desc, t.id
                      limit least(greatest(coalesce(p_limit, 200), 0), 200) offset greatest(coalesce(p_offset, 0), 0)),
               p_by_id) b;
    return;
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
