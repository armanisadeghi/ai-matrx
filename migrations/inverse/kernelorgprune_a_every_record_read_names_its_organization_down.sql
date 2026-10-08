-- chair-step: undo kernelorgprune_a_every_record_read_names_its_organization.sql - restores the eleven bodies, drops custom.record_org_hint, rebuilds the probes
-- lane: KERNEL-ORG-PRUNE

set local statement_timeout = '120s';

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
  v_out := custom.with_retired(v_out, v_row.data -> '_retired', v_visible, v_declared);

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  o_doc := v_out;
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
  v_world_def boolean := false;
  v_seen     uuid[];  -- PERF-FIX-5
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501',
            hint = 'DOOR-1: the read door resolves the reader from the session and takes no principal argument. Sign in, or call it from a lane that carries a person.';
  end if;
  -- CHAIR-WORLD-LANE-2: the wall first (as custom.assert_may_know_table asks it), then — for a person it admitted
  -- ONLY through the world lane — the one other way through: every row asked for is a definition row of a Public
  -- Table of this organization (the Table record itself, one of its Fields, or a choice of one of its Fields).
  -- Anything else, and every other person, meets custom.assert_may_know_table exactly as before.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_records_by_ids');
  v_world_def := custom.world_reader_reads_public_definition(p_organization_id, p_table_id, p_record_ids);
  if not v_world_def then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.read_records_by_ids');
  end if;

  -- NOTHING ASKED FOR IS NOT AN ERROR — it is an empty answer, and it costs nothing.
  if v_n = 0 then
    return;
  end if;

  -- THE SAME CEILING THE PAGE DOORS DECLARE, and it refuses above it by name rather than
  -- handing back a short list the caller cannot tell from a complete one.
  perform custom.page_size(p_organization_id, 'custom.read_records_by_ids', v_n, 200);

  -- STEP 1, ONCE: THE ONE LADDER decides WHICH rows. Identical call, identical arguments to
  -- the page door's. This is the question that must never be asked twice in two ways.
  -- PERF-FIX-5 (2026-10-08). A READ OF N IDS ASKS ABOUT THOSE N ROWS, NOT ABOUT THE WHOLE TABLE. On the Table kernel
  -- (the Table's own row, which every table page reads) custom.visible_set answers by walking the one ladder over EVERY live
  -- Table of the organization, to return one. Its kernel branch hands back nothing but "every Table is seen" or the seen list
  -- (no class, no granted answer), so the rows asked for are visible when she created them or when custom.tables_seen_among
  -- - the very walk the set builds its list from, here for these ids only, asked through iam.has_access_for_many first -
  -- sees them. Only where visible_set does not stop (an archived organization, a registered FK containment parent for record)
  -- and for a person admitted through the world lane; everything else, every other Table, asks visible_set as before.
  -- mx.read_by_ids_set = off: the whole set, as before (the proofs compare both on one snapshot).
  if p_table_id = custom.table_kernel_id()
     and not v_world_def
     and coalesce(current_setting('mx.read_by_ids_set', true), '') <> 'off'
     and not exists (select 1 from platform.entity_relationships er
                      where er.child_type = 'record' and er.kind in ('composition', 'containment'))
     and not exists (select 1 from iam.organizations o
                      where o.id = p_organization_id and o.archived_at is not null) then
    select coalesce(array_agg(g.id), '{}'::uuid[]) into v_seen
      from custom.tables_seen_among(v_me, array[p_organization_id], p_record_ids) g
     where g.seen and g.organization_id = p_organization_id;
    select false as o_all_visible, '{}'::platform.visibility[] as o_true_visibility, '{}'::uuid[] as o_granted_all,
           '{}'::uuid[] as o_granted_visible, v_seen as o_carried_visible, 0 as o_ladder_calls,
           false as o_fallback, null::text as o_note
      into v_set;
  else
    v_set := custom.visible_set(v_me, p_organization_id, p_table_id, 'viewer'::public.permission_level);
  end if;

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
               -- CHAIR-WORLD-LANE-2: definition rows of a Public Table, every one checked above, read at viewer.
               when v_world_def then
                 true
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
                                   case when v_world_def then 'viewer'::public.permission_level
                                        else (v_levels -> v_row.id::text ->> 'l')::public.permission_level end, 'read');
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
    -- CHAIR-RETIRED-VALUES: the values a tightened rule set aside, masked like the value they were.
    document := custom.with_retired(document, v_row.data -> '_retired', v_visible, v_declared);
    level := (v_mask ->> 'level')::public.permission_level;
    return next;
  end loop;
end;
$function$;

drop function custom.record_org_hint(uuid, uuid);

CREATE OR REPLACE FUNCTION platform.static_row_probe_sql()
 RETURNS TABLE(which text, ddl text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  rec  record;
  v_a  text := '';
  v_o  text := '';
  v_fp text;
begin
  select md5(string_agg(s.kind || '|' || s.key || '|' || s.schema_name || '|' || s.table_name
                        || '|' || s.shape::text || '|' || coalesce(s.id_column, '')
                        || '|' || coalesce(s.owner_column, ''), E'\n' order by s.kind, s.key))
    into v_fp
    from platform.static_row_probe_spec() s;
  v_fp := coalesce(v_fp, md5(''));

  for rec in select * from platform.static_row_probe_spec() s where s.kind = 'entity'
                order by s.schema_name, s.table_name
  loop
    v_a := v_a
      || '  if p_schema = ' || quote_literal(rec.schema_name)
      || ' and p_table = ' || quote_literal(rec.table_name) || ' then' || E'\n'
      || '    begin' || E'\n'
      || '      select '
      || case rec.shape
           when 1 then 't.visibility, t.created_by, t.organization_id'
           when 2 then 't.visibility, t.owner_id, t.organization_id'
           when 3 then '''personal''::platform.visibility, t.owner_id, t.organization_id'
           when 4 then '''personal''::platform.visibility, t.created_by, t.organization_id'
           when 5 then 'coalesce((select et.default_visibility from platform.entity_types et'
                       || ' where et.schema_name = ' || quote_literal(rec.schema_name)
                       || ' and et.table_name = ' || quote_literal(rec.table_name)
                       || ' limit 1), ''personal''::platform.visibility), null::uuid, t.organization_id'
           else        'coalesce((select et.default_visibility from platform.entity_types et'
                       || ' where et.schema_name = ' || quote_literal(rec.schema_name)
                       || ' and et.table_name = ' || quote_literal(rec.table_name)
                       || ' limit 1), ''personal''::platform.visibility), null::uuid, null::uuid'
         end
      || E'\n        into o_vis, o_owner, o_org' || E'\n'
      || '        from ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.table_name) || ' t' || E'\n'
      || '       where t.id = p_id;' || E'\n'
      -- plpgsql''s own FOUND, never an into-target: `select …, true into v_found` is NULL when
      -- nothing matched, which is the defect MIRROR-PERF section 4 names in this exact shape.
      || '      o_found := found;' || E'\n'
      || '      if not o_found then' || E'\n'
      || '        o_vis := ''personal''::platform.visibility; o_owner := null; o_org := null;' || E'\n'
      || '      end if;' || E'\n'
      || '      return;' || E'\n'
      || '    exception when others then' || E'\n'
      || '      o_handled := false; o_found := false;' || E'\n'
      || '      o_vis := ''personal''::platform.visibility; o_owner := null; o_org := null;' || E'\n'
      || '      return;' || E'\n'
      || '    end;' || E'\n'
      || '  end if;' || E'\n';
  end loop;

  for rec in select * from platform.static_row_probe_spec() s where s.kind = 'owner'
                order by s.key
  loop
    v_o := v_o
      || '  if p_resource_type = ' || quote_literal(rec.key) || ' then' || E'\n'
      || '    begin' || E'\n'
      -- The registry row can be switched off, and iam.owner_of answers null when it is; the
      -- generated arm asks the same question rather than assuming the generation-time answer.
      || '      if not exists (select 1 from platform.shareable_resource_registry rr' || E'\n'
      || '                      where rr.resource_type = ' || quote_literal(rec.key)
      || ' and rr.is_active) then' || E'\n'
      || '        o_handled := true; o_owner := null; return;' || E'\n'
      || '      end if;' || E'\n'
      || '      select t.' || quote_ident(rec.owner_column) || ' into o_owner' || E'\n'
      || '        from ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.table_name) || ' t' || E'\n'
      || '       where t.' || quote_ident(rec.id_column) || ' = p_id;' || E'\n'
      || '      o_handled := true;' || E'\n'
      || '      if not found then o_owner := null; end if;' || E'\n'
      || '      return;' || E'\n'
      || '    exception when others then' || E'\n'
      || '      o_handled := false; o_owner := null; return;' || E'\n'
      || '    end;' || E'\n'
      || '  end if;' || E'\n';
  end loop;

  return query
  select 'platform.partitioned_row_attrs'::text,
    'create or replace function platform.partitioned_row_attrs(' || E'\n'
    || '  p_schema text, p_table text, p_id uuid,' || E'\n'
    || '  out o_handled boolean, out o_vis platform.visibility, out o_owner uuid,' || E'\n'
    || '  out o_org uuid, out o_found boolean)' || E'\n'
    || 'returns record language plpgsql stable security definer set search_path to '''' as $probe$' || E'\n'
    || '-- GENERATED by platform.rebuild_static_row_probes() (LADDER-PERF). Do not edit by hand:' || E'\n'
    || '-- platform.static_row_probes_stale() goes red when this body no longer matches the registry.' || E'\n'
    || '-- fingerprint: ' || v_fp || E'\n'
    || 'begin' || E'\n'
    || '  o_handled := true; o_found := false;' || E'\n'
    || '  o_vis := ''personal''::platform.visibility; o_owner := null; o_org := null;' || E'\n'
    || '  if p_schema is null or p_table is null or p_id is null then o_handled := false; return; end if;' || E'\n'
    || v_a
    || '  o_handled := false;' || E'\n'
    || '  return;' || E'\n'
    || 'end;' || E'\n'
    || '$probe$;'
  union all
  select 'iam.registry_owner_of'::text,
    'create or replace function iam.registry_owner_of(' || E'\n'
    || '  p_resource_type text, p_id uuid, out o_handled boolean, out o_owner uuid)' || E'\n'
    || 'returns record language plpgsql stable security definer set search_path to '''' as $probe$' || E'\n'
    || '-- GENERATED by platform.rebuild_static_row_probes() (LADDER-PERF). Do not edit by hand:' || E'\n'
    || '-- platform.static_row_probes_stale() goes red when this body no longer matches the registry.' || E'\n'
    || '-- fingerprint: ' || v_fp || E'\n'
    || 'begin' || E'\n'
    || '  o_handled := false; o_owner := null;' || E'\n'
    || '  if p_resource_type is null or p_id is null then return; end if;' || E'\n'
    || v_o
    || '  return;' || E'\n'
    || 'end;' || E'\n'
    || '$probe$;';
end;
$function$;

CREATE OR REPLACE FUNCTION custom.confidential_anchor(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- THE CONFIDENTIAL ROW A RECORD ANSWERS TO, or null. A record of a Confidential Table answers to
-- itself; a record whose parent_id climbs (at most 16 hops) to one answers to that row — "children
-- inherit their parent" (access ladder). A Table, a field, a rule, a kernel row: null.
--
-- PERF-FIX-1 (2026-10-07): ASKED ONCE PER RECORD PER STATEMENT. One page of 38 rows asked this 272-404
-- times (the ladder asks it for every rung it tries, through custom.confidential_answer and
-- custom.reaches_directly) and each ask read `custom.record` by id across all sixteen partitions. The
-- answer is a function of the id and the snapshot, so the first ask leaves it in the statement memo
-- (platform.memo_k_*: fenced by statement, backend, seat and the transaction's first write) fenced
-- here by the snapshot as custom.visible_set is; a transaction that has written asks every time.
declare
  v_id     uuid := p_id;
  v_org    uuid;
  v_data   jsonb;
  v_level  text;
  v_hops   integer := 0;
  v_res    uuid;
  v_key    text;
  v_hit    text;
begin
  if p_id is null then return null; end if;
  if pg_catalog.pg_current_xact_id_if_assigned() is null then
    v_key := 'custom.confidential_anchor:' || p_id::text || ':' || pg_catalog.pg_current_snapshot()::text;
    v_hit := platform.memo_k_get(v_key);
    if v_hit is not null then
      return nullif(v_hit, '-')::uuid;
    end if;
  end if;
  loop
    select r.organization_id, r.data, t.data ->> 'level'
      into v_org, v_data, v_level
      from custom.record r
      left join custom.record t
        on t.organization_id = r.organization_id and t.id = r.table_id
       and t.table_id = custom.table_kernel_id()
     where r.id = v_id and r.data_class = 'record';
    if not found then exit; end if;
    if v_level = 'confidential' then v_res := v_id; exit; end if;
    exit when v_hops >= 16 or jsonb_typeof(v_data -> 'parent_id') is distinct from 'string';
    v_hops := v_hops + 1;
    begin
      v_id := (v_data ->> 'parent_id')::uuid;
    exception when invalid_text_representation then
      v_res := null;
      exit;
    end;
  end loop;
  if v_key is not null then
    perform platform.memo_k_put(v_key, coalesce(v_res::text, '-'));
  end if;
  return v_res;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._copy_in_progress_hides(p_user uuid, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table uuid;
  v_key   text;
  v_maker text;
begin
  -- Is this Table, or the Table this row belongs to, still being copied by somebody other than
  -- p_user? One lookup of the row's Table, then the Table's answer is memoised for the statement
  -- (platform.memo_k_*), so a list that asks it per row pays one index probe a row.
  if p_id is null then
    return false;
  end if;
  select case when r.table_id = custom.table_kernel_id() then r.id else r.table_id end
    into v_table
    from custom.record r
   where r.id = p_id
   limit 1;
  if v_table is null then
    return false;
  end if;
  v_key := 'dup:copying:' || v_table::text;
  v_maker := platform.memo_k_get(v_key);
  if v_maker is null then
    select case when t.data ->> 'kept_for' = 'copying' then coalesce(t.created_by::text, '?') else '-' end
      into v_maker
      from custom.record t
     where t.id = v_table and t.table_id = custom.table_kernel_id()
     limit 1;
    v_maker := coalesce(v_maker, '-');
    perform platform.memo_k_put(v_key, v_maker);
  end if;
  return v_maker <> '-' and v_maker is distinct from coalesce(p_user::text, '');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.confidential_answer(p_user uuid, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- THE ONE ANSWER FOR A ROW OF A CONFIDENTIAL STORE TABLE (access ladder: "the owner and the people
-- the record's own rules name"). null = the row is not under a Confidential Table, ask the ladder
-- as always. Otherwise, at the level asked:
--   · the row's owner (created_by) and the Table's owner: every level - unless the Table says
--     maker_is_reader (CHAIR-DOORS-3A): then the Table belongs to the organization, and the person who
--     made it is a reader like anyone else (her own rows, her shares, the reader fields that name her);
--   · a share addressed to this person — on the row, or on its whole Table — at its own level
--     (sharing sits outside the ladder and works at every level);
--   · a person a reader field names (the Table's `readers`): that reader's level, never above editor;
--   · nobody else: no organization lane, no admin lane, no library lane, no containment.
-- An archived organization is closed to everyone. A child answers exactly as its Confidential row.
-- Asked by iam.has_access_for_base and custom.reaches_directly — the platform's one check and the
-- store's ladder — so they cannot disagree.
declare
  v_anchor  uuid;
  v_org     uuid;
  v_table   uuid;
  v_owner   uuid;
  v_data    jsonb;
  v_towner  uuid;
  v_readers jsonb;
  v_maker_reads boolean;   -- CHAIR-DOORS-3A: the Table's maker is only a reader
  v_grant   public.permission_level;
  v_reader  jsonb;
  v_level   public.permission_level;
  v_when    jsonb;     -- CHAIR-ACCESS c: the reader entry's own condition, in the saved-view where grammar
  v_sql     text;
  v_true    boolean;
begin
  v_anchor := custom.confidential_anchor(p_id);
  if v_anchor is null then return null; end if;
  if p_user is null then return false; end if;

  select r.organization_id, r.table_id, r.created_by, r.data, t.created_by, t.data -> 'readers',
         coalesce(t.data -> 'maker_is_reader' = 'true'::jsonb, false)
    into v_org, v_table, v_owner, v_data, v_towner, v_readers, v_maker_reads
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
   where r.id = v_anchor;

  if exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
    return false;
  end if;
  if p_user = v_owner or (p_user = v_towner and not v_maker_reads) then
    return true;
  end if;

  select max(g.permission_level) into v_grant
    from iam.permissions g
   where g.resource_type = 'record'
     and g.resource_id in (v_anchor, v_table)
     and g.granted_to_user_id = p_user
     and g.status = 'active'
     and (g.expires_at is null or g.expires_at > now());
  if v_grant is not null and v_grant >= p_required then
    return true;
  end if;

  if jsonb_typeof(v_readers) = 'array' then
    for v_reader in select x from jsonb_array_elements(v_readers) x loop
      continue when jsonb_typeof(v_reader) is distinct from 'object';
      v_level := least(coalesce(nullif(v_reader ->> 'level', '')::public.permission_level, 'viewer'),
                       'editor'::public.permission_level);
      continue when v_level < p_required;
      -- CHAIR-ACCESS c (HR proof gap 3): A READER FIELD APPLIES WHEN ITS RULE IS TRUE. A reader entry may
      -- carry `when`, a condition on THIS row in the one filter grammar saved views and
      -- custom.read_records_page use (a flat {column: value} map, or a Rule expression) - e.g. the
      -- employee reads her review once status = shared. It is the TABLE's rule, worked out over the
      -- row's own stored values (every column, no reader seat), inside this same answer, so a reveal
      -- can be automated by the row's own state and nothing else. A `when` that is not true - or
      -- cannot be worked out - leaves this reader entry closed.
      v_when := v_reader -> 'when';
      if v_when is not null and jsonb_typeof(v_when) = 'object' then
        -- LANE 12 P7: an IF, never a CASE. custom.record_filter_sql(jsonb) is IMMUTABLE, so inside a CASE
        -- the planner folded the ELSE arm with v_when as a constant and raised "this filter is a Rule
        -- expression, and it has to be asked of a table" for every Rule  - even though the WHEN arm
        -- had chosen the Rule branch. Every Rule reader entry was closed, and every read of a row under it
        -- errored. An IF evaluates only the branch it takes.
        if custom.filter_is_rule(v_when) then
          v_sql := format('(custom.rule_truth(%s) is true)',
                          custom.rule_filter_node_sql(v_org, v_table, v_when,
                                                      custom.choice_field_map(v_org, v_table), null));
        else
          v_sql := custom.record_filter_sql(v_when);
        end if;
        -- LANE 12 P7: THE TABLE'S RULE IS WORKED OUT WITH NO READER SEAT (CHAIR-ACCESS c's own words). A
        -- lookup in it reads through custom.relation_targets, which asked whether the caller may open THIS
        -- row - the very question being answered here - and refused (42501), so a reader could never wait
        -- on a lookup ("both sides submitted", read through the review cycle). For the length of this one
        -- evaluation the row is marked, and custom.relation_targets reads the links OF THAT ROW without
        -- asking again. Nothing else honours the mark; no client can set it (set_config is no client door,
        -- the same shape as mx.platform_context_org); it is cleared on every exit.
        perform set_config('mx.confidential_rule_row', v_anchor::text, true);
        begin
          execute format('select exists (select 1 from custom.record r where r.id = $1 and (%s))', v_sql)
             into v_true using v_anchor;
        exception when others then
          perform set_config('mx.confidential_rule_row', '', true);
          raise;
        end;
        perform set_config('mx.confidential_rule_row', '', true);
        continue when not coalesce(v_true, false);
      elsif v_when is not null then
        continue;   -- a `when` that is not an object is refused at write time; one that got here is closed
      end if;
      if custom.confidential_names(v_org, v_data -> (v_reader ->> 'field'), p_user) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.reaches_directly(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- DOES SOMETHING REACH THIS ROW? Arms 1, 2 and 3 of the one ladder, and nothing else. This is
-- not a second ladder: `custom.has_visibility` has no copy of these arms any more, it calls
-- this. The split exists because a Table answers YES to a fourth question — "may this person
-- know it" — that must never be read as "it carries everything inside it".
declare
  rec         record;
  v_org       uuid;
  v_table     uuid;
  v_cap       public.permission_level;
  v_cap_asked boolean := false;
  v_vis       platform.visibility;
  -- KERNEL-TAILS arm 3b
  v_parent    uuid;
  v_child     uuid;
  v_named     public.permission_level;
  v_spec      public.permission_level;
  v_hops      integer := 0;
  v_conf      boolean;  -- CHAIR-CONFIDENTIAL-STORE
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- 🚨 CHAIR-CONFIDENTIAL-STORE (2026-10-02) — A ROW OF A CONFIDENTIAL TABLE IS ANSWERED BY ONE
  -- QUESTION AND NO ARM BELOW. The same call the access kernel makes (iam.has_access_for_base), so
  -- the store's ladder and the platform's agree by construction: arm 1's organization lanes, arm 2's
  -- membership default, arm 3's carrying, 3b's named parent and 4's scope membership are all lanes
  -- a Confidential row does not have. Owner, the people its rules name, and shares addressed to the
  -- person are inside the answer.
  if p_type = 'record' then
    v_conf := custom.confidential_answer(p_user_id, p_id, p_required);
    if v_conf is not null then
      return v_conf;
    end if;
  end if;

  if p_type = 'record' then
    select r.organization_id, r.table_id, r.visibility, custom.containment_parent(r.data)
      into v_org, v_table, v_vis, v_parent
      from custom.record r
     where r.id = p_id;
  end if;

  -- CD-LADDER (2026-10-03): AN ARCHIVED ORGANIZATION IS CLOSED TO EVERYONE (access ladder T-33). The
  -- kernel refuses every row of it, grants and ownership included, so no arm below may open one.
  if v_org is not null
     and exists (select 1 from iam.organizations o where o.id = v_org and o.archived_at is not null) then
    return false;
  end if;

  -- ARM 1 — THE PLATFORM'S OWN ACCESS KERNEL, asked and not reimplemented. Ownership, grant
  -- rows, the organization lanes (which honour the row's own `visibility`, DD-136), the
  -- containment walk, the public and global-readable system-organization arms.
  --
  -- IT IS GOVERNED BY THE CAP TOO (LADDER-CAP). One of the lanes inside it IS the organization
  -- default — the least specific rung there is — and leaving arm 1 alone let that lane overrule
  -- a grant somebody addressed to this person on the record's TABLE or on a home of it. The cap
  -- carries the lanes addressed to nobody (ownership, the admin lanes, public grants) at the top
  -- level, so nothing arm 1 exists for is taken away.
  -- KERNEL-SHADOW stage 1 (2026-10-07): the answer custom.reaches_directly_many resolved for this very
  -- target with the set form (iam.has_access_for_many) earlier in THIS statement, when the knob
  -- access/kernel_set_form is on; otherwise, and whenever that memo is absent, the kernel itself.
  if coalesce(platform.memo_k_get('iam.kernel_set:' || p_user_id::text || ':' || p_type || ':'
                                  || p_required::text || ':' || p_id::text
                                  || ':' || pg_catalog.pg_current_snapshot()::text)::boolean,
              iam.has_access_for(p_user_id, p_type, p_id, p_required)) then
    if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 2 — THE ORGANIZATION'S OWN MEMBERSHIP DEFAULT FOR THIS STORE (VIS-19), under the same
  -- cap. It is a VETO and never turns a no into a yes, so it is asked where an arm would say
  -- yes and not on a walk that ends in no. A refusal ENDS the walk: arm 3 is less specific still
  -- and is governed by the same cap, so it could only be refused as well.
  if iam.effective_level(p_user_id, p_type, p_id, v_org, v_table) >= p_required then
    if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
  end if;

  -- ARM 3 — THE STORE'S OWN CARRYING, including (since SHARED-ONLY) the Table a record lives
  -- in. An ancestor conveys at most `conveys_max`, and the first ancestor that conveys enough
  -- AND that this principal reaches at that level answers true — subject to the same cap.
  -- 🚨 SHARE-TAILS (2026-09-25) — A PERSONAL RECORD IS CARRIED BY NOTHING. The access kernel
  -- already says so (`iam.has_access_for_base`: `v_containment_carries` is false below
  -- `internal`) and so does the Table edge (`custom.carrying_edges_of` arm 3, DD-136: "reached by a
  -- grant and by its creator and by nothing else"); this loop alone still let a Home carry a
  -- personal Table to every member who reaches the Home through the member lane — which is how a
  -- Table set to "Only people I share it with" stayed open to the whole organization (measured on
  -- the clone, 2026-09-25). Its owner and a grant addressed to it are answered above, untouched.
  if v_vis is not null and v_vis < 'internal'::platform.visibility then
    return false;
  end if;

  for rec in
    select a.container_type, a.container_id
      from custom.visibility_ancestors(p_type, p_id) a
     where a.max_level >= p_required
     order by a.depth
  loop
    -- THE TERMINAL TABLE HAS ITS OWN NAMED FORM (LEAK-T10). It is the one ancestor the
    -- set-based door also has to ask about, on its own, for a whole page at once — so the
    -- question lives in one body that both callers run, and neither can drift from the other.
    if (rec.container_type = 'record' and rec.container_id = v_table
        and custom.table_carries_its_rows(p_user_id, rec.container_id, p_required))
       or (not (rec.container_type = 'record' and rec.container_id = v_table)
           and iam.has_access_for(p_user_id, rec.container_type, rec.container_id, p_required))
    then
      if p_required <= custom.level_floor() then return true; end if;
    if not v_cap_asked then
      v_cap := custom.addressed_cap(p_user_id, p_type, p_id, v_org, v_table);
      v_cap_asked := true;
    end if;
    return v_cap is null or p_required <= v_cap;
    end if;
  end loop;

  -- ARM 3b — A RECORD OWNED BY A RECORD SHE IS NAMED ON (lane KERNEL-TAILS, 2026-09-25; chair
  -- ruling for v1store_fixes_green 4d). A person named on a record holds that level — never above
  -- editor — on the records it OWNS (children made through custom.relation_own: the child's
  -- parent_id AND an "owned" relation row from the parent), the way a Notion sub-page inherits its
  -- parent's share, and on their owned children in turn. The nearest explicit grant decides: a
  -- child that carries its own grant for her answers with that grant (the addressed cap's rung 1,
  -- the row itself), and an owned ancestor on the way up that is named for her ends the walk.
  -- WHY IT IS ITS OWN ARM. Arm 3 already carries a live parent's share through the containment
  -- edge. But custom.record_delete archives a container BEFORE its cascade asks about the
  -- children (the order that stops a containment loop), the archive soft-deletes that edge, and
  -- the named editor who may delete the parent was refused its owned child at "viewer" — the
  -- organization's member default, all that was left. This arm reads the ownership itself (the
  -- relation row, which the archive keeps) and the parent's NAMED grant (which the archive keeps),
  -- and admits an archived parent only while it belongs to the archive running in this
  -- transaction (custom.archive_took). A record merely contained, carried or linked is not owned
  -- and gains nothing here; a personal child already returned above (DD-136).
  if p_type = 'record' and v_parent is not null and p_required <= 'editor'::public.permission_level then
    v_child := p_id;
    while v_parent is not null and v_hops < 16 loop
      v_hops := v_hops + 1;
      exit when not exists (
        select 1 from custom.record rel
         where rel.organization_id = v_org and rel.data_class = 'relation' and rel.deleted_at is null
           and rel.data @> jsonb_build_object('kind', 'owned', 'from', v_parent::text, 'to', v_child::text));
      exit when not exists (
        select 1 from custom.record pr
         where pr.organization_id = v_org and pr.id = v_parent
           and (pr.deleted_at is null
                or strpos(coalesce(current_setting('custom.archive_took', true), ''), v_parent::text) > 0));
      select max(g.permission_level) into v_named
        from iam.permissions g
       where g.resource_type = 'record' and g.resource_id = v_parent and g.granted_to_user_id = p_user_id
         and g.status <> 'rejected' and (g.expires_at is null or g.expires_at > now());
      if v_named is not null then
        if least(v_named, 'editor'::public.permission_level) >= p_required then
          v_spec := custom.addressed_cap_specific(p_user_id, p_type, p_id, v_org, v_table);
          if v_spec is null or p_required <= v_spec then
            return true;
          end if;
        end if;
        exit;
      end if;
      v_child := v_parent;
      -- an owned ancestor that carries its own grant for her is the nearest explicit grant, and
      -- it was answered no above (or it would have carried through arm 1): the walk ends.
      exit when exists (
        select 1 from iam.permissions g
         where g.resource_type = 'record' and g.resource_id = v_child and g.granted_to_user_id = p_user_id
           and g.status <> 'rejected' and (g.expires_at is null or g.expires_at > now()));
      select custom.containment_parent(pr.data) into v_parent
        from custom.record pr where pr.organization_id = v_org and pr.id = v_child;
    end loop;
  end if;

  -- ARM 4 — A SCOPE MEMBERSHIP (lane SC-3', P7's read arm, 2026-09-24). A person the
  -- organization admitted to ONE record — a student to one class — reads that record and the
  -- records it carries, at viewer and never above. Last, because it is the only arm that reads
  -- `iam.memberships`, and every cheaper reason has already answered no. It does not reach the
  -- record's Table: `custom.scope_member_reaches` walks the record's carriers and a Table is
  -- where that walk stops, so the other classes stay unlisted.
  if p_type = 'record' and custom.scope_member_reaches(p_user_id, p_id, p_required) then
    return true;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.has_visibility(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org   uuid;
  v_table uuid;
begin
  if p_user_id is null or p_id is null then return false; end if;

  -- TABLE-ACTIONS: A TABLE STILL BEING COPIED IS ITS MAKER'S ALONE — the Table and every row of it
  -- answer no to anybody else, through this one ladder every per-id door asks
  -- (custom._copy_in_progress_hides; one lookup of the row's Table, memoised per statement).
  if p_type = 'record' and custom._copy_in_progress_hides(p_user_id, p_id) then
    return false;
  end if;

  -- ARMS 1, 2 AND 3 — ownership, grants, the organization lanes, and the store's own carrying.
  -- They live in `custom.reaches_directly` so that the two callers who mean "does this
  -- container carry its contents" can ask exactly them and not arm 4.
  if custom.reaches_directly(p_user_id, p_type, p_id, p_required) then
    return true;
  end if;

  -- ARM 4 — A TABLE YOU CAN SEE SOMETHING INSIDE IS A TABLE YOU MAY KNOW (SHARED-ONLY).
  --
  -- Arms 1 to 3 all ask "who reaches THIS row". A Table is a record (REC-25) and so it was
  -- asked the same way — and under `shared_only` the answer for somebody who had been shared
  -- one RECORD inside it was no. `custom.assert_may_know_table` is the first line of
  -- `custom.read_records`, `custom.applicable_fields` and every screen door in the store, so
  -- that no closed the whole feature for her: the record she had been given was unreachable
  -- through the only doors that show it, and the table it lived in never appeared in her list.
  -- So did the table holding a record SHE HERSELF had created.
  --
  -- AT `viewer` AND NEVER ABOVE IT. Knowing a table — its name, its columns, that it exists —
  -- is not changing one. Adding a column, renaming it and deleting it all ask `admin` on the
  -- Table and this arm refuses them, so a person shared one row cannot reshape the table.
  --
  -- IT DOES NOT CARRY. Whoever reads this answer as "and therefore every row in it" is asking
  -- the wrong function: `custom.reaches_directly` is the one that means carrying.
  --
  -- IT IS THE LAST ARM ON PURPOSE: it is the only one that reads other rows, so every cheaper
  -- reason has already been tried and answered no.
  if p_type = 'record' and p_required <= 'viewer'::public.permission_level then
    select r.organization_id, r.table_id into v_org, v_table
      from custom.record r
     where r.id = p_id;
    if v_table = custom.table_kernel_id()
       and custom.table_has_a_visible_record(p_user_id, v_org, p_id) then
      return true;
    end if;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION iam.has_access_for_many(p_person uuid, p_targets uuid[], p_level text, p_type text DEFAULT 'record'::text)
 RETURNS TABLE(target uuid, allowed boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- KERNEL-SHADOW (2026-10-07). THE SET FORM OF THE ACCESS KERNEL: one row per distinct non-null
-- target, `allowed` = iam.has_access_for(p_person, p_type, target, p_level) — the same answer,
-- resolved once for the whole set instead of once per target. The rule it implements, lane by lane,
-- is common-docs/systems/platform/access/KERNEL.md. It is SHADOW ONLY until Arman decides the swap:
-- iam.has_access_for_shadow asks both forms and returns the old one.
--
-- WHAT IS SET-BASED. The person is resolved once (organizations, admin seats, store switch,
-- member-lane level per organization and Table). The target rows are read in ONE statement. Grants,
-- record memberships, scope assignments and Library grants are one semi-join each over the set.
-- Every clock clause (a grant's expiry) is the statement's own now().
--
-- WHAT IS NOT, AND GOES TO THE ONE-AT-A-TIME KERNEL (iam.has_access_for, unchanged), so the answer is
-- the kernel's by construction:
--   * every type but `record` (the hot path; other types are a later wave, KERNEL.md § Waves);
--   * the whole call, when the registry no longer says what this body assumes about `record`
--     (a reference gate, an owner-only trash rule, a detail or child pointer, a containment or
--     composition parent, or a class whose "Only me" rows do not open to the organization);
--   * one target, when its id is carried by more than one row, when it sits in a global-readable
--     system organization (those arms read the row column T-13 retires, which this body may not), or
--     when platform.reachability holds a container for it.
-- A Confidential row is answered by custom.confidential_answer itself, exactly as the kernel asks it.
--
-- THE PUBLIC LANE: the kernel asks the row column T-13 retires (= 'public'), which this body may not
-- read. A row published_to_web marks, that no other lane opens, is asked of the kernel (KERNEL-SHADOW h).
-- Known one-way gap, fail-closed: a row the kernel would open ONLY because its row column says public
-- while published_to_web says false (possible only with the T-13 dual-write trigger bypassed) is
-- refused here; the shadow and the sweep report it as a disagreement.
declare
  v_req     public.permission_level;
  v_lanes   platform.lane_set;
  v_set_ok  boolean;
begin
  if p_targets is null or cardinality(p_targets) = 0 then
    return;
  end if;
  -- KERNEL-SHADOW h: a NULL level is NOT viewer - the kernel answers a NULL level its own way (owner and
  -- organization admins only), so a NULL level, like a NULL or non-record type, goes to the kernel.
  v_req := p_level::public.permission_level;

  if p_person is null then
    return query select distinct x, false from unnest(p_targets) x where x is not null;
    return;
  end if;

  -- The registry facts this body is written against, asked of the same functions the kernel asks.
  v_set_ok := coalesce(p_type = 'record' and v_req is not null
    and exists (select 1 from platform.entity_types et
                 where et.token = 'record' and et.is_active
                   and et.schema_name = 'custom' and et.table_name = 'record'
                   and et.rls_variant is distinct from 'detail')
    and platform.reference_gate_columns('record') is null
    and not coalesce(platform.trash_is_owner_only('record'), false)
    and platform.detail_parent_columns('record') is null
    and platform.child_parent_columns('record') is null
    and not exists (select 1 from platform.entity_relationships er
                     where er.child_type = 'record' and er.kind in ('composition', 'containment'))
    and coalesce(iam.personal_opens_row('record', 'custom', 'record', null), false), false);

  if not v_set_ok then
    return query
      select u.x, coalesce(iam.has_access_for(p_person, p_type, u.x, v_req), false)
        from (select distinct x from unnest(p_targets) x where x is not null) u(x);
    return;
  end if;

  v_lanes := iam.class_lanes('record');

  return query
  with
  t as materialized (
    select distinct x as id from unnest(p_targets) x where x is not null
  ),
  -- The person, once.
  my_orgs as materialized (
    select distinct om.organization_id as org
      from iam.organization_member om
     where om.user_id = p_person
  ),
  global_orgs as materialized (
    select s.organization_id as org from iam.system_orgs s where s.global_readable
  ),
  -- The rows, once.
  w as materialized (
    select t.id,
           r.organization_id as org,
           r.created_by      as owner,
           r.published_to_web as pub,
           r.table_id        as tbl,
           count(r.id) over (partition by t.id) as n_rows
      from t
      left join custom.record r on r.id = t.id
  ),
  -- Per organization the targets live in: archived, admin seat, member access, store switch.
  orgs as materialized (
    select o.org,
           exists (select 1 from iam.organizations x where x.id = o.org and x.archived_at is not null) as archived,
           public.is_org_admin_for(p_person, o.org) as is_admin,
           iam.has_org_access_for(p_person, o.org)  as has_access,
           custom.store_is_open(o.org)              as store_open
      from (select distinct w.org from w where w.org is not null and w.n_rows = 1) o
  ),
  -- Per target: the semi-joins.
  x as materialized (
    select w.id, w.org, w.owner, w.pub, w.tbl, w.n_rows,
           o.archived, o.is_admin, o.has_access, o.store_open,
           (w.org in (select g.org from global_orgs g)) as in_global_org,
           exists (select 1 from platform.reachability rc
                    where rc.item_type = 'record' and rc.item_id = w.id) as has_container,
           -- the Confidential anchor is provably absent when no row of class `record` carries the
           -- id, or exactly one does whose Table is not Confidential and whose document names no
           -- parent (custom.confidential_anchor's own loop stops at that first row)
           (select count(c.id) = 0
                   or (count(c.id) = 1
                       and not coalesce(bool_or((ct.data ->> 'level') = 'confidential'), false)
                       and not coalesce(bool_or(jsonb_typeof(c.data -> 'parent_id') = 'string'), false))
              from custom.record c
              left join custom.record ct
                on ct.organization_id = c.organization_id and ct.id = c.table_id
               and ct.table_id = custom.table_kernel_id()
             where c.id = w.id and c.data_class = 'record') as anchor_free,
           exists (select 1 from platform.entity_grants eg
                    where eg.entity_type = 'record' and eg.entity_id = w.id) as has_library_row,
           -- public.has_permission_for, as a semi-join
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and coalesce(p.status, 'active') <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and (p.granted_to_user_id = p_person
                           or (p.granted_to_organization_id is not null
                               and p.granted_to_organization_id in (select m.org from my_orgs m)))
                      and case v_req
                            when 'viewer' then p.permission_level in ('viewer', 'commenter', 'edit_content', 'editor', 'admin')
                            when 'commenter' then p.permission_level in ('commenter', 'edit_content', 'editor', 'admin')
                            when 'edit_content' then p.permission_level in ('edit_content', 'editor', 'admin')
                            when 'editor' then p.permission_level in ('editor', 'admin')
                            when 'admin' then p.permission_level = 'admin'
                          end) as grant_hit,
           -- iam.grant_addressed_level(...) is not null: a grant addressed to this person speaks
           -- for this row, so the member lane's default does not (VIS-19)
           exists (select 1 from iam.permissions p
                    where p.resource_type = 'record' and p.resource_id = w.id
                      and p.status <> 'rejected'
                      and (p.expires_at is null or p.expires_at > now())
                      and coalesce(p.is_public, false) = false
                      and (p.granted_to_user_id = p_person
                           or p.granted_to_organization_id in (select m.org from my_orgs m))
                      and p.permission_level is not null) as addressed,
           -- a record membership (iam.membership_grant)
           exists (select 1 from iam.memberships m
                     join iam.membership_grant g
                       on g.member_role = m.role and g.container_type in ('record', '*')
                    where m.container_type = 'record' and m.container_id = w.id
                      and m.user_id = p_person and m.deleted_at is null
                      and g.confers >= v_req) as membership_hit,
           -- public._edu_can_read_via_assignment (the record arm)
           exists (select 1 from platform.associations_live a
                     join iam.memberships m
                       on m.container_type = 'scope' and m.container_id = a.target_id
                      and m.user_id = p_person and m.status = 'active' and m.deleted_at is null
                    where a.source_type = 'record' and a.source_id = w.id
                      and a.target_type = 'scope' and a.role = 'assignment') as edu_hit
      from w
      left join orgs o on o.org = w.org
  ),
  -- Which targets this body answers, and which still need the member lane's level.
  y as materialized (
    select x.*,
           (x.n_rows > 1 or x.in_global_org or x.has_container) as to_kernel,
           case when x.n_rows = 1 and not x.archived and not x.anchor_free
                     and not x.in_global_org and not x.has_container
                then custom.confidential_answer(p_person, x.id, v_req) end as conf
      from x
  ),
  early as materialized (
    select y.*,
           coalesce(y.n_rows = 1 and not y.to_kernel and not y.archived and y.conf is null
            and (
              (v_req = 'viewer' and y.has_library_row
                 and (public.user_can_read_via_library_grant(p_person, 'record', y.id)
                      or public.library_is_open('record', y.id)))
              or y.owner = p_person
              or y.grant_hit
              or y.membership_hit
              or (v_req = 'viewer' and y.edu_hit)
              or (v_lanes.org_role_lane and y.is_admin)
              or (v_lanes.org_member_lane and y.has_access and not y.store_open
                  and v_req <= 'editor'::public.permission_level)
            ), false) as early_yes  -- a row with no creator makes `owner = p_person` null, never yes
      from y
  ),
  -- The member lane's level (iam.member_lane_confers), per organization and Table, asked only
  -- where nothing earlier answered and only where the kernel itself would reach that arm.
  confers as materialized (
    select q.org, q.tbl,
           iam.member_lane_confers(p_person, q.org, 'record', null, q.tbl, true) as lvl
      from (select distinct e.org, e.tbl from early e
             where e.n_rows = 1 and not e.to_kernel and not e.archived and e.conf is null
               and not e.early_yes
               and not (v_req = 'viewer' and e.pub)
               and v_lanes.org_member_lane and e.has_access and e.store_open
               and not e.addressed) q
  )
  -- KERNEL-SHADOW h: one row per target (an id two rows carry is asked of the kernel once).
  select distinct on (e.id) e.id,
         case
           when e.to_kernel then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           when e.n_rows = 0 then false
           when e.archived then false
           when e.conf is not null then e.conf
           when e.early_yes then true
           -- KERNEL-SHADOW h: the public lane is never granted on published_to_web alone. A row it
           -- would open, and nothing else opens, is asked of the kernel, which reads the row column
           -- itself - so a row written with the T-13 dual-write trigger bypassed answers exactly as before.
           when v_req = 'viewer' and e.pub then coalesce(iam.has_access_for(p_person, 'record', e.id, v_req), false)
           else coalesce(
                  v_lanes.org_member_lane and e.has_access and e.store_open and not e.addressed
                  and v_req <= (select c.lvl from confers c
                                 where c.org = e.org and c.tbl is not distinct from e.tbl),
                  false)
         end
    from early e
   order by e.id;
end;
$function$;

select platform.rebuild_static_row_probes();
