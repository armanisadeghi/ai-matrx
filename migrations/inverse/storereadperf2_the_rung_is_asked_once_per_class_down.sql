-- chair-step: the inverse of migrations/campaign/storereadperf2_the_rung_is_asked_once_per_class.sql (lane STORE-READ-PERF-2) — puts the nine bodies back exactly as production held them before it (pg_get_functiondef, 2026-09-25), removes the three door rows, then drops the seven functions it added. Nothing of anybody's data is touched.
-- based-on: custom.read_record(uuid, uuid, boolean) edc23e15bec399d6dd6c407354db60f40841d9ff2af52e19741195c597d4eaea
-- based-on: custom.read_mask(uuid, uuid, text) ef28dccc478ebf37fd0ff84878f54c61130ee7c1cb04874d049cdc0e563141cd
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) c69d3f49e872d4a3d4a8d52c56192fb85f57db33f84f9258aaf044e316d87619
-- based-on: custom.read_records_matching(uuid, uuid, jsonb, boolean, integer, integer) 5bac7b4b9bdf3365117a3dea67be148124b3465fe7fbdced6d7106f1201584ee
-- based-on: custom.read_records(uuid, uuid, boolean, integer, integer) 27f77b7cdad7909e41a34b1885f1d11f0b026aae2f299033d9faf6156a1f9b02
-- based-on: custom.resolve_context(text, uuid, uuid[], uuid[]) 42b120440dccfc71d1f3b4235590ab2ca16e1341ca6c06244613c293a1d3d9de
-- based-on: custom.choice_render(uuid, uuid, jsonb) 44c6f1808d2ac4a1467cafadae834e0d2ab4097b7a3a09cebbf4c939d4b1ddaa
-- based-on: custom.entity_reference_render(uuid, uuid, jsonb) 6bcb7fd84088cdbc95285a32319adf09d1fc4f5ec6f7d1011009a23a40ed111f
-- based-on: custom.with_whole_value_pointers(jsonb, jsonb, jsonb, text[], boolean, jsonb) 3bf1966cf915723935bee17487bf7d22735a4209e9491f9a5993cf451725dc6f

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.read_record(p_organization_id uuid, p_record_id uuid, p_by_id boolean DEFAULT false)
 RETURNS jsonb
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
begin
  if v_me is null then
    raise exception 'Nobody is signed in, so there is nothing to read.'
      using errcode = '42501', hint = 'DOOR-1: the read door reads the person from the session.';
  end if;

  -- ARGS-RULED (2026-09-21). THE WALL IS DECIDED FIRST, AND IT WAS NOT DECIDED AT ALL.
  -- REC-29: "organizations are hard walls, and a door decides who may reach one before it
  -- decides anything else" — every other door in this store obeys it and DOOR-1, the one read
  -- door, did not. It made no membership decision about the organization it was handed.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);

  -- AND THE LADDER BEFORE EXISTENCE. This used to raise 02000 "there is no record % in this
  -- organization" BEFORE asking custom.has_visibility, so the two answers differed: a caller who
  -- guessed a record uuid learned whether it existed in that organization (02000) or not
  -- (42501). One bit per guess, and the store's own rule is that a record you may not open and a
  -- record that is not there answer the same thing. `custom.has_visibility` answers false for an
  -- id that is not there, so this ordering makes the two identical without a second read.
  if not custom.has_visibility(v_me, 'record', v_now, 'viewer') then
    raise exception 'You do not have access to this record.'
      using errcode = '42501',
            hint = 'DOOR-1: nothing reads a record around this door - not a screen, not an agent, not an export. Ask somebody who holds it to share it with you.';
  end if;

  select r.table_id, custom.record_values_of(r), r.data -> '_values', r.data -> '_sources'
    into v_table, v_doc, v_wv_values, v_wv_sources
    from custom.record r
   where r.organization_id = p_organization_id and r.id = v_now and r.deleted_at is null;
  if not found then
    -- Only somebody the ladder has already admitted reaches this sentence, so it now tells a
    -- person who holds the record that it is in the trash — and tells a stranger nothing.
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000', hint = 'It was deleted, or it never existed here.';
  end if;

  -- THE ONE FACT. `custom.read_mask` is the whole of what this door used to work out privately.
  v_mask := custom.read_mask(p_organization_id, v_now, 'read');
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
    from jsonb_array_elements(v_mask -> 'visible') x;
  select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
    from jsonb_array_elements(v_mask -> 'declared') x;

  v_out := custom.mask_document(v_doc, v_visible, v_mask -> 'notices', p_by_id,
                                v_mask -> 'key_ids', v_declared);

  -- CHOICE-VALUE. Rendered AFTER masking, so a field this reader may not see keeps its notice
  -- and is never resolved.
  v_out := custom.choice_render(p_organization_id, v_table, v_out);

  -- BIG-VALUES-READERS. A value too big for one cell keeps its first words here and its whole
  -- text in a file; the pointer (`_values.<key>.src` -> `_sources.<ptr>`, the file fields only)
  -- rides along for the keys this reader may see, so a screen opens the file and an agent's
  -- context reads the whole text. Nothing else of the provenance block is carried.
  v_out := custom.with_whole_value_pointers(v_out, v_wv_values, v_wv_sources, v_visible, p_by_id,
                                            v_mask -> 'key_ids');

  -- T5 / REC-N-11. THE ALTERNATES THE MERGE KEPT — only for keys this reader may see.
  select jsonb_object_agg(k, alts) into v_alts
    from (
      select e.key as k,
             (select jsonb_agg(jsonb_build_object(
                       'value',  a -> 'value',
                       'rank',   a -> 'rank',
                       'source', r.data -> '_sources' -> (a ->> 'src'))
                     order by (a ->> 'rank')::int)
                from jsonb_array_elements(coalesce(e.value -> 'alternates', '[]'::jsonb)) a) as alts
        from custom.record r
        cross join lateral jsonb_each(coalesce(r.data -> '_values', '{}'::jsonb)) e
       where r.organization_id = p_organization_id and r.id = v_now
         and e.key = any (v_visible)
         and jsonb_array_length(coalesce(e.value -> 'alternates', '[]'::jsonb)) > 0
    ) x
   where x.alts is not null;

  if v_alts is not null and v_alts <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_alternates', v_alts);
  end if;

  -- SEAT-SUITES / T5+T12. THE VALUES THE STORE KEPT AND THE DOOR THREW AWAY, masked exactly
  -- like the value they used to be.
  select jsonb_agg(x order by x ->> 'key') into v_retired
    from custom.record r
    cross join lateral jsonb_array_elements(coalesce(r.data -> '_retired', '[]'::jsonb)) x
   where r.organization_id = p_organization_id and r.id = v_now
     and ((x ->> 'key') = any (v_visible) or not ((x ->> 'key') = any (v_declared)));

  if v_retired is not null and jsonb_array_length(v_retired) > 0 then
    v_out := v_out || jsonb_build_object('_retired', v_retired);
  end if;

  if v_now is distinct from p_record_id then
    v_out := v_out || jsonb_build_object(
      '_redirected_from', p_record_id,
      '_redirect_says', 'That record was merged into this one, so its id now answers with this record. REC-21: the merged id resolves to the survivor for good — undoing the merge puts both records and both ids back.');
  end if;

  return v_out;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.read_mask(p_organization_id uuid, p_record_id uuid, p_action text DEFAULT 'read'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_me    uuid := auth.uid();
  v_table uuid;
  v_org   uuid;
begin
  -- THE MASK IS TAKEN IN THE RECORD'S OWN ORGANIZATION (2026-09-23). It used to look the record
  -- up inside p_organization_id and answer "nothing masked" when it was not there, so a person
  -- shared one record could pass THEIR OWN organization to custom.record_as_of and read every
  -- confidential field raw (found by independent review). The organization passed in no longer
  -- decides anything here; for a caller in the record's organization the answer is unchanged.
  select r.table_id, r.organization_id into v_table, v_org
    from custom.record r
   where r.id = p_record_id;
  if v_table is null then
    -- A record with no Table (a Home) declares no Fields, so nothing is masked and nothing
    -- is claimed. The caller's own door has already decided whether they may read it.
    return jsonb_build_object('table_id', null, 'level', null,
                              'visible', '[]'::jsonb, 'declared', '[]'::jsonb,
                              'notices', '{}'::jsonb, 'key_ids', '{}'::jsonb,
                              'undeclared_ride_along', true);
  end if;

  -- READ-MASK-ONCE (2026-09-25). The LEVEL is this record's — a record shared at a higher rung
  -- gets that rung's mask — and the FIELDS at that level are the one door's answer, worked out
  -- once per statement for (person, organization, Table, level, action), never once per record.
  return custom.read_mask_for(v_me, v_org, v_table,
                              custom.effective_level(v_me, v_org, p_record_id), p_action)
         - 'all_key_ids';
end;
$function$
;

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

  for v_rec in
    select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
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
     order by r.created_at desc, r.id
  loop
    -- STEP 2, PER ROW: THE ONE MASK decides which FIELDS of it she may see, at the level she
    -- holds ON THIS RECORD. The same call `custom.read_record` makes for its one row.
    v_mask := custom.read_mask(p_organization_id, v_rec.id, 'read');
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
      from jsonb_array_elements(v_mask -> 'declared') x;

    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_mask -> 'notices', p_by_id,
                                       v_mask -> 'key_ids', v_declared));
    -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
    document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_mask -> 'key_ids');
    level := (v_mask ->> 'level')::public.permission_level;
    return next;
  end loop;
end;
$function$
;

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
    select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources, r.data -> '_sources' as src
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
    custom.visible_predicate_sql(v_me, p_organization_id, p_table_id,
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
    id := v_rec.id;
    document := custom.choice_render(p_organization_id, p_table_id,
                  custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
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
$function$
;

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

  if v_set.o_fallback then
    raise notice '%', v_set.o_note;
    for v_rec in
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where custom.has_visibility(v_me, 'record', r.id, 'viewer')
         and r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;

  elsif v_set.o_all_visible then
    -- THE ORDINARY PAGE. Every live row of this Table is this caller's to see, so the scan
    -- carries no visibility predicate at all and the LIMIT stops it at p_limit rows.
    for v_rec in
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
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
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or (r.visibility = any (v_set.o_true_visibility) and not (r.id = any (v_set.o_granted_all)))
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
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
      select r.id, custom.record_values_of(r) as doc, r.data -> '_values' as wv_values, r.data -> '_sources' as wv_sources
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = p_table_id
         and r.deleted_at is null
         and ( r.created_by = v_me
            or r.id = any (v_set.o_granted_visible)
            or r.id = any (v_set.o_carried_visible) )
       order by r.created_at desc, r.id
       limit p_limit offset p_offset
    loop
      id := v_rec.id;
      document := custom.choice_render(p_organization_id, p_table_id,
                    custom.mask_document(v_rec.doc, v_visible, v_notices, p_by_id, v_key_ids, v_declared));
      -- BIG-VALUES-READERS: a value kept as a file carries its pointer, so every reader finds it.
      document := custom.with_whole_value_pointers(document, v_rec.wv_values, v_rec.wv_sources, v_visible, p_by_id, v_key_ids);
      level := v_level;
      return next;
    end loop;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.resolve_context(p_entity_type text, p_entity_id uuid, p_record_ids uuid[] DEFAULT NULL::uuid[], p_table_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me          uuid := custom.query_principal();
  v_org_id      uuid;
  v_project_id  uuid;
  v_task_id     uuid;
  v_cands       jsonb := '[]'::jsonb;   -- [{record_id, via}] in contribution order
  v_checks      jsonb := '[]'::jsonb;   -- one row per candidate: admitted or refused, and why
  v_withheld    jsonb := '[]'::jsonb;   -- a field the person may not see on an admitted record
  v_admitted    jsonb := '[]'::jsonb;   -- [{record_id, organization_id, table_id, name, type_label, via}]
  v_tables      jsonb := '[]'::jsonb;
  v_scope_labels jsonb := '{}'::jsonb;
  v_variables   jsonb := '{}'::jsonb;
  v_sources     jsonb := '{}'::jsonb;
  v_cells       jsonb := '{}'::jsonb;
  v_cell        jsonb;
  v_where       jsonb;
  v_doc         jsonb;
  v_hidden      jsonb;
  v_table       custom.record;
  v_title_field text;
  v_label       text;
  v_name        text;
  v_inject      text;
  v_org         uuid;
  v_rec         uuid;
  v_via         text;
  v_versions    jsonb;
  c             jsonb;
  v_cap         bigint;
  v_val         jsonb;
  v_whole       jsonb;
  a             jsonb;
  f             record;
  rec           record;
begin
  if v_me is null then
    raise exception 'custom.resolve_context resolves context for a person, and nobody is signed in.'
      using errcode = '42501',
            hint = 'The server calls this door acting as the person operating the agent (DOOR-1).';
  end if;

  -- ── THE ENTITY: where the turn lives (read exactly as public.resolve_full_context reads it) ─
  if p_entity_type = 'task' then
    select t.project_id, p.organization_id, t.id
      into v_project_id, v_org_id, v_task_id
      from workspace.tasks t left join workspace.projects p on t.project_id = p.id
     where t.id = p_entity_id;
  elsif p_entity_type = 'project' then
    select p.organization_id, p.id into v_org_id, v_project_id
      from workspace.projects p where p.id = p_entity_id;
  elsif p_entity_type = 'conversation' then
    select c2.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'conversation' and a2.source_id = c2.id
               and a2.target_type = 'project' and a2.organization_id = c2.organization_id
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           c2.task_id
      into v_org_id, v_project_id, v_task_id
      from chat.conversation c2 where c2.id = p_entity_id;
  elsif p_entity_type = 'note' then
    select n.organization_id,
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'project'
             order by a2.position nulls last, a2.created_at, a2.id limit 1),
           (select a2.target_id from platform.associations_live a2
             where a2.source_type = 'note' and a2.source_id = n.id and a2.target_type = 'task'
             order by a2.position nulls last, a2.created_at, a2.id limit 1)
      into v_org_id, v_project_id, v_task_id
      from workbench.notes n where n.id = p_entity_id;
  end if;

  -- ── THE CANDIDATES, in the old resolver's own order: the entity's tags, else its project's,
  --    then the selection. A tag is read by its TARGET ID whichever token the edge carries —
  --    `scope` today, its copy `record` (SC-4 P4, role context_tag; `custom_record` is the retired
  --    tier-2 token, read too so an edge under either store token is the same tag: grouped by
  --    target id, one candidate) (same id, CUT-4) — and in
  --    ANY organization, because the edge belongs to the entity's organization and the record
  --    to its own (Brightline's task, Harborline's app).
  select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'entity_tag') order by t.first_at, t.target_id), '[]'::jsonb)
    into v_cands
    from (select a2.target_id, min(a2.created_at) as first_at
            from platform.associations_live a2
           where a2.source_type = p_entity_type and a2.source_id = p_entity_id
             and a2.target_type in ('scope', 'record', 'custom_record')
           group by a2.target_id) t;

  if jsonb_array_length(v_cands) = 0 and v_project_id is not null and p_entity_type <> 'project' then
    select coalesce(jsonb_agg(jsonb_build_object('record_id', t.target_id, 'via', 'project_tag') order by t.first_at, t.target_id), '[]'::jsonb)
      into v_cands
      from (select a2.target_id, min(a2.created_at) as first_at
              from platform.associations_live a2
             where a2.source_type = 'project' and a2.source_id = v_project_id
               and a2.target_type in ('scope', 'record', 'custom_record')
             group by a2.target_id) t;
  end if;

  if p_record_ids is not null then
    select v_cands || coalesce(jsonb_agg(jsonb_build_object('record_id', s.id, 'via', 'selection') order by s.ord), '[]'::jsonb)
      into v_cands
      from unnest(p_record_ids) with ordinality as s(id, ord)
     where s.id is not null
       and not (v_cands @> jsonb_build_array(jsonb_build_object('record_id', s.id)));
  end if;

  -- ── EVERY CANDIDATE CHECKED FOR THE PERSON — the one rule changed on purpose ──────────────
  -- The old resolver checked only the selection; a tag and a project's tag delivered every
  -- cell to whoever ran the turn. Here each record, however it arrived, is asked through
  -- custom.where_id_opens: organization members, direct and outside grants, and (P7's read
  -- arm) a scope membership on that record. What is refused is NAMED in `checks`, never
  -- dropped in silence.
  for c in select value from jsonb_array_elements(v_cands) loop
    v_rec := (c ->> 'record_id')::uuid;
    v_via := c ->> 'via';
    v_where := custom.where_id_opens(v_rec);
    if v_where is null then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_opened',
        'says', 'This scope is not one you may open in the record store — it has not been shared with you, or it has not been copied into the store yet.');
      continue;
    end if;
    if v_where ->> 'kind' <> 'record' then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'not_a_record', 'kind', v_where ->> 'kind',
        'says', 'That id opens something that is not a record, so it carries no context values.');
      continue;
    end if;
    if not coalesce((v_where ->> 'live')::boolean, true) then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'in_trash', 'organization_id', v_where -> 'organization_id',
        'says', 'This scope''s record is in the trash, so nothing is read from it until it is restored.');
      continue;
    end if;

    v_org := (v_where ->> 'organization_id')::uuid;
    begin
      v_doc := custom.read_record(v_org, v_rec, false);
    exception when others then
      v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', false,
        'reason', 'door_refused', 'organization_id', v_org, 'sqlstate', sqlstate, 'says', sqlerrm);
      continue;
    end;

    select r.* into v_table
      from custom.record r
     where r.id = (select x.table_id from custom.record x where x.organization_id = v_org and x.id = v_rec)
       and r.table_id = custom.table_kernel_id()
     limit 1;
    v_title_field := coalesce(nullif(v_table.data ->> 'title_field', ''), 'name');
    v_label := coalesce(nullif(v_table.data ->> 'label_singular', ''), nullif(v_table.data ->> 'name', ''), 'record');
    v_name := coalesce(nullif(v_doc ->> v_title_field, ''), v_rec::text);
    v_hidden := coalesce(v_doc -> '_hidden', '{}'::jsonb);

    v_checks := v_checks || jsonb_build_object('record_id', v_rec, 'via', v_via, 'admitted', true,
      'organization_id', v_org, 'table_id', v_table.id, 'name', v_name);
    -- THE TRIPLE, so the compare page can say which side is behind (copy lag) rather than
    -- merely that two values differ. INSPECTOR-TAILS (2026-09-25): read from the record this
    -- door has just opened for the person (custom.read_record above), the same `_values` /
    -- `_derived` / `_computed` metadata custom.record_values_versioned reads, for the same keys
    -- (the record's values plus its `_values` entries). It used to CALL that door once per
    -- record, and the door re-asked the organization wall, the record ladder and the whole field
    -- mask the read door had just answered — about 23 ms a record, 400 of the 850 ms a type of
    -- 17 scopes took. Proven identical on 70 live scope records before the swap.
    select coalesce(jsonb_object_agg(k.key, jsonb_build_object(
             'value_version', coalesce((x.data -> '_values' -> k.key ->> 'ver')::integer, 1),
             'written_at', coalesce((x.data -> '_values' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_derived' -> k.key ->> 'at')::timestamptz,
                                    (x.data -> '_computed' -> k.key ->> 'at')::timestamptz))),
           '{}'::jsonb)
      into v_versions
      from custom.record x
      cross join lateral (
        select j.key from jsonb_object_keys(v_doc) j(key) where left(j.key, 1) <> '_'
        union
        select j.key from jsonb_object_keys(coalesce(x.data -> '_values', '{}'::jsonb)) j(key)
      ) k
     where x.organization_id = v_org and x.id = v_rec;
    -- BIG-VALUES-READERS: this organization's cap on one context value handed to an agent
    -- (0, the default, is no cap: the agent gets the whole text, exactly as the old path does).
    v_cap := custom.agent_context_value_cap(v_org);
    v_admitted := v_admitted || jsonb_build_object('record_id', v_rec, 'organization_id', v_org,
      'table_id', v_table.id, 'name', v_name, 'type_label', lower(v_label), 'via', v_via,
      'doc', v_doc - '_hidden' - '_alternates' - '_retired' - '_redirected_from' - '_redirect_says',
      'hidden', v_hidden, 'title_field', v_title_field, 'versions', v_versions, 'cap', v_cap);
  end loop;

  -- ── THE ACTIVE TABLES with no record chosen ("I'm working in Clients") — named, for the person ─
  if p_table_ids is not null then
    select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_tables
      from unnest(p_table_ids) t(id)
     where coalesce(custom.where_id_opens(t.id) ->> 'kind', '') = 'table';
  end if;

  -- ── SCOPE LABELS: every admitted record's name under its Table's singular label ────────────
  select coalesce(jsonb_object_agg(x.type_label, x.names), '{}'::jsonb)
    into v_scope_labels
    from (
      select e ->> 'type_label' as type_label,
             case when count(*) > 1 then jsonb_agg(e ->> 'name' order by e ->> 'name')
                  else to_jsonb(min(e ->> 'name')) end as names
        from jsonb_array_elements(v_admitted) e
       group by e ->> 'type_label'
    ) x;

  -- ── THE SYSTEM LANE, unchanged: System context stays its own table (§5 D10) ───────────────
  for rec in (
    select sci.id as context_item_id, sci.key, sci.description,
           sci.value_type::text as value_type, sci.value as value
      from context.deliverable_system_context_items() sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
     order by sci.sort_order asc, sci.key asc
  ) loop
    continue when rec.value is null;
    v_cell := jsonb_build_object(
      'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
      'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  for rec in (
    select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
           sci.feed_config as feed_config
      from context.deliverable_system_context_items() sci
     where sci.is_active = true and sci.deleted_at is null and sci.feed_type = 'dataset'
       and sci.feed_config ? 'data_store_id'
     order by sci.sort_order asc, sci.key asc
  ) loop
    v_cell := jsonb_build_object(
      'key', rec.key,
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code'),
      'type', 'dataset', 'description', rec.description,
      'context_item_id', rec.context_item_id,
      'scope_id', null, 'scope_name', 'System', 'scope_type_id', null, 'source', 'system');
    v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
      'value', jsonb_build_object('kind', 'dataset',
          'data_store_id', rec.feed_config->>'data_store_id',
          'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
          'short_code', rec.feed_config->>'data_store_short_code',
          'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
      'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description,
      'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
    v_sources := v_sources || jsonb_build_object(rec.key, 'system');
    v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
      coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  -- ── THE RECORDS' FIELDS: every declared Field of each admitted record, except its title and a
  --    Field declared `exclude` — in Table, Field and record order, as the old resolver orders
  --    scope type, context item and scope. A Field this person may not see is WITHHELD and
  --    named; a relation (a reference) moves to the on-demand tier, where DYN-17 says it belongs
  --    — the one declared tier move.
  for rec in (
    select e.value as a, fr.id as field_id, fr.data ->> 'key' as fkey, fr.data ->> 'type' as ftype,
           fr.data ->> 'label' as flabel, fr.data ->> 'description' as fdesc,
           coalesce(nullif(fr.data ->> 'sort', '')::int, 0) as fsort
      from jsonb_array_elements(v_admitted) with ordinality e(value, ord)
      join custom.record fr
        on fr.organization_id = (e.value ->> 'organization_id')::uuid
       and fr.table_id = custom.field_kernel_id()
       and fr.deleted_at is null
       and (fr.data ->> 'entity_definition_id')::uuid = (e.value ->> 'table_id')::uuid
     where fr.data ->> 'key' is distinct from (e.value ->> 'title_field')
       and coalesce(fr.data ->> 'context_policy', 'include') <> 'exclude'
     order by e.value ->> 'type_label', coalesce(nullif(fr.data ->> 'sort', '')::int, 0),
              e.value ->> 'name', e.value ->> 'record_id'
  ) loop
    a := rec.a;
    if (a -> 'hidden') ? rec.fkey then
      v_withheld := v_withheld || jsonb_build_object(
        'record_id', a -> 'record_id', 'record_name', a -> 'name', 'key', rec.fkey,
        'reason', coalesce(a -> 'hidden' -> rec.fkey ->> 'reason', 'this field is not visible at your level'));
      continue;
    end if;
    continue when (a -> 'doc' -> rec.fkey) is null or jsonb_typeof(a -> 'doc' -> rec.fkey) = 'null';
    v_inject := case when rec.ftype in ('relation', 'entity_reference') then 'tool_accessible' else 'direct' end;
    -- BIG-VALUES-READERS: what the agent is handed for this value. A value kept as a file is
    -- its whole text (the store's client reads the file the door names in `whole_value`), or,
    -- under the organization's cap, its first words and the file to open — never the first
    -- words alone. A relation to files is the file reference the old path hands.
    v_val := custom.agent_context_value(a -> 'doc', rec.fkey, rec.ftype, (a ->> 'organization_id')::uuid,
                                        (a ->> 'record_id')::uuid, coalesce((a ->> 'cap')::bigint, 0));
    v_whole := v_val -> 'whole_value';
    v_val := v_val -> 'value';
    v_cell := jsonb_build_object(
      'key', rec.fkey, 'value', v_val, 'type', rec.ftype,
      'description', coalesce(rec.fdesc, rec.flabel),
      'context_item_id', rec.field_id,
      'scope_id', a -> 'record_id', 'scope_name', a -> 'name', 'scope_type_id', a -> 'table_id',
      'organization_id', a -> 'organization_id', 'via', a -> 'via',
      'value_version', a -> 'versions' -> rec.fkey -> 'value_version',
      'written_at', a -> 'versions' -> rec.fkey -> 'written_at',
      'source', 'scope:' || (a ->> 'name'))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end;
    v_variables := v_variables || jsonb_build_object(rec.fkey, jsonb_build_object(
      'value', v_val, 'type', rec.ftype, 'inject_as', v_inject,
      'source', 'scope:' || (a ->> 'name'), 'description', coalesce(rec.fdesc, rec.flabel),
      'cells', coalesce(v_variables -> rec.fkey -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell))
      || case when v_whole is null then '{}'::jsonb else jsonb_build_object('whole_value', v_whole) end);
    v_sources := v_sources || jsonb_build_object(rec.fkey, 'scope:' || (a ->> 'name'));
    v_cells := v_cells || jsonb_build_object(rec.field_id::text,
      coalesce(v_cells -> rec.field_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
  end loop;

  return jsonb_build_object(
    'scope_labels', v_scope_labels,
    'variables',    v_variables,
    'sources',      v_sources,
    'cell_values',  v_cells,
    'context', jsonb_build_object(
      'user_id', v_me, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
      'scope_ids', coalesce((select jsonb_agg(e -> 'record_id') from jsonb_array_elements(v_admitted) e), '[]'::jsonb),
      'table_ids', v_tables),
    'checks',       v_checks,
    'withheld',     v_withheld,
    'resolved_at',  extract(epoch from now()),
    'read_as',      'the person operating this agent',
    'through',      'custom.where_id_opens for every contributing record, then custom.read_record under that record''s own organization');
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.choice_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map   jsonb;
  v_out   jsonb;
  v_notes jsonb := '{}'::jsonb;
  v_note  jsonb;
  v_at    text;
  e       record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  -- SC-R / P12: an entity reference is rendered here too — {token, id} gains the thing's own
  -- label — because this is the one step every read door takes after masking (read_record,
  -- read_records*, value_read, record_aggregate, query_across_homes, query_by_coordinates).
  p_doc := custom.entity_reference_render(p_organization_id, p_table_id, p_doc);
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  if v_map = '{}'::jsonb then
    return p_doc;                       -- no list Field on this Table: nothing to say.
  end if;

  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_map) loop
    -- THE COLUMN, UNDER WHICHEVER NAME THIS DOCUMENT USES. `custom.mask_document` re-keys the
    -- whole document by field id when the caller asks for it, and every list surface does.
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id'
            end;
    if v_at is null then
      continue;
    end if;
    v_note := custom.choice_render_note(e.v, p_doc -> v_at);
    if v_note is null then
      continue;                         -- a notice, or a token that names no choice: untouched.
    end if;
    v_out   := v_out   || jsonb_build_object(v_at, custom.choice_render_value(e.v, p_doc -> v_at));
    v_notes := v_notes || jsonb_build_object(v_at, v_note);
  end loop;

  if v_notes <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('_choices', v_notes);
  end if;
  return v_out;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.entity_reference_render(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_fields jsonb;
  v_out    jsonb;
  v_at     text;
  v_val    jsonb;
  v_items  jsonb;
  e        record;
begin
  if p_doc is null or jsonb_typeof(p_doc) <> 'object' or p_table_id is null then
    return p_doc;
  end if;
  v_fields := custom.entity_reference_fields(p_organization_id, p_table_id);
  if v_fields = '{}'::jsonb then
    return p_doc;
  end if;
  v_out := p_doc;
  for e in select key as k, value as v from jsonb_each(v_fields) loop
    v_at := case when p_doc ? e.k then e.k
                 when p_doc ? (e.v ->> 'field_id') then e.v ->> 'field_id' end;
    if v_at is null then
      continue;
    end if;
    v_val := p_doc -> v_at;
    if jsonb_typeof(v_val) not in ('array', 'object')
       or (jsonb_typeof(v_val) = 'object' and not (v_val ? 'token' and v_val ? 'id')) then
      continue;   -- a masking notice, or something the validator would refuse: untouched
    end if;
    select coalesce(jsonb_agg(
             case when jsonb_typeof(x) = 'object' and x ? 'token' and x ? 'id'
                       and (x ->> 'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                  then jsonb_build_object(
                         'token', x ->> 'token',
                         'id',    x ->> 'id',
                         'label', platform.relation_label(p_organization_id, x ->> 'token', (x ->> 'id')::uuid))
                  else x end order by o), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(case when jsonb_typeof(v_val) = 'array' then v_val
                                     else jsonb_build_array(v_val) end) with ordinality as a(x, o);
    v_out := v_out || jsonb_build_object(v_at,
               case when jsonb_typeof(v_val) = 'array' then v_items else v_items -> 0 end);
  end loop;
  return v_out;
end
$function$
;

CREATE OR REPLACE FUNCTION custom.with_whole_value_pointers(p_document jsonb, p_values jsonb, p_sources jsonb, p_visible text[], p_by_id boolean DEFAULT false, p_key_ids jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  with p as (
    select case when p_by_id then coalesce(p_key_ids ->> e.key, e.key) else e.key end as k,
           e.value ->> 'src' as ptr,
           custom.whole_value_pointer_of(p_values, p_sources, e.key) as pointer
      from jsonb_each(case when jsonb_typeof(p_values) = 'object' then p_values else '{}'::jsonb end) e
     where e.key = any (coalesce(p_visible, '{}'::text[]))
  ), w as (
    select jsonb_object_agg(k, jsonb_build_object('src', ptr)) as vals,
           jsonb_object_agg(ptr, pointer) as srcs
      from p where pointer is not null
  )
  select case
           when w.vals is null then p_document
           else p_document || jsonb_build_object(
             '_values', coalesce(p_document -> '_values', '{}'::jsonb) || w.vals,
             -- a pointer merges INTO an entry the door already carries (GRID-TAILS' unresolved half)
             '_sources', coalesce(p_document -> '_sources', '{}'::jsonb) || (
               select jsonb_object_agg(s.key, coalesce(p_document -> '_sources' -> s.key, '{}'::jsonb) || s.value)
                 from jsonb_each(w.srcs) s))
         end
    from w;
$function$
;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('levels_of', 'read_mask_at', '_read_record_with')
   and declared_by = 'storereadperf2_the_rung_is_asked_once_per_class.sql';

drop function custom._read_record_with(uuid, uuid, boolean, jsonb, jsonb);
drop function custom.read_mask_at(uuid, boolean, public.permission_level, text);
drop function custom.levels_of(uuid, uuid[]);
drop function custom.record_values_step(custom.record, jsonb);
drop function custom.choice_render_with(uuid, uuid, jsonb, jsonb);
drop function custom.choice_render_plan(uuid, uuid);
drop function custom.entity_reference_render_with(uuid, uuid, jsonb, jsonb);
