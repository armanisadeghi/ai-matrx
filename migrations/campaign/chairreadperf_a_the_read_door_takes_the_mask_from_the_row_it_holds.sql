-- chair-step: it REPLACES the body of one store door, custom._read_record_with (signature, SECURITY DEFINER, search_path and grants unchanged). Same answer, byte for byte, for every seat: the mask is taken from the row this door already fetched by its key (organization, id) instead of re-reading that row by id alone across every partition, and a mask already taken for the same (organization, Table, rung) in this call is reused from the carried cache. No other function, no table, index, policy, grant, door row or data row is touched.
-- lane: CHAIR-READPERF
-- based-on: custom._read_record_with(uuid, uuid, boolean, jsonb, jsonb) 8e507f8aa394c42df502258f2b72c66ab853f52fe2a6ac2bba411cd8a8b216dc
-- lock: custom
--
-- Inverse: migrations/inverse/chairreadperf_a_the_read_door_takes_the_mask_from_the_row_it_holds_down.sql.
--
-- WHY (chair sublane READPERF, 2026-10-03; lane 9 sublane G measured it, track_functions = all, clone,
-- one call of the agent hand-off over a 622-scope type as test@test.com): custom._read_record_with cost
-- 2.07 ms a record, and a quarter of that was custom.read_mask_at — 0.50 ms, of which 0.37 ms was
-- `select r.table_id, r.organization_id from custom.record r where r.id = p_record_id`: a read BY ID
-- ALONE of a table hash-partitioned by organization_id, so all 16 partitions are probed, to learn two
-- columns of the very row this door fetched by its key (organization_id, id) a few lines earlier.
-- read_mask_for's answer is memoized per statement, but each record still paid memo_k_get (an md5 of
-- the JWT claims) and a text -> jsonb parse of the mask.
--
-- WHAT CHANGES. The door calls custom.read_mask_for with the Table and organization it holds, and only
-- asks custom.effective_level when the caller did not hand the rung in AND the row has a Table (a row
-- with no Table masked nothing and asked nothing before either). The mask is carried in o_cache under
-- 'rm:<organization>:<table>:<rung>' for the rest of the call, so a set door reading 600 records of one
-- Table parses it once. Everything downstream — key_ids, visible, declared, notices, mask_document,
-- choice rendering, whole-value pointers, alternates, retired values, redirects — is unchanged.
--
-- WHY THE ANSWER IS THE SAME. custom.read_mask_at(id, given, level, 'read') is, by its own body:
--   · when the record has no Table: the fixed empty mask (visible [], declared [], notices {}, key_ids {});
--   · otherwise custom.read_mask_for(auth.uid(), <its organization>, <its Table>, <level or
--     custom.effective_level(auth.uid(), <its organization>, id)>, 'read').
-- This door's row was fetched with organization_id = p_organization_id and id = v_now, so <its
-- organization> is p_organization_id and <its Table> is v_row.table_id. For a row with no Table,
-- custom.read_mask_for(.., null, ..) answers the same empty mask (plus all_key_ids {}, which the door
-- already coalesced to key_ids {}). The cache key carries the rung, so two records of one Table read
-- at different rungs take different masks exactly as before.

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
  perform custom.assert_client_may_reach(p_organization_id, 'custom.read_record');

  -- REC-21 / T5. THE ID A MERGE SENT SOMEWHERE ELSE — a redirect, never a silent substitution.
  v_now := custom.resolve_id(p_organization_id, p_record_id);
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
