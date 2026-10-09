-- lane: HOT-DOORS-2
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) 48c3482e26c8d0d7105ea3b94583cee323aa051b01bb843e096bd0fe87ac2653
--
-- HOT-DOORS-2 (2026-10-08), part c: a page's rows ask for the field mask once per level, not once per row.
-- Function body only: any hour. Inverse: migrations/inverse/hotdoors2_c_a_page_asks_the_field_mask_once_per_level_down.sql

set local statement_timeout = '60s';

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
  v_mask_ready boolean := false;  -- HOT-DOORS-2
  v_mask_lvl   text;
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
                 custom.has_visibility(v_me, 'record', custom.record_org_hint(r.id, r.organization_id), 'viewer')
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
    -- HOT-DOORS-2 (2026-10-08): THE FIELD QUESTION ONCE PER LEVEL, NOT ONCE PER ROW. The mask depends on the
    -- table, the reader and the level only; a page of 50 rows at one level asked it 50 times (0.6 ms each,
    -- 29 ms of a page). The rows are the same; a row at another level asks again.
    if not v_mask_ready
       or v_mask_lvl is distinct from (case when v_world_def then 'viewer' else (v_levels -> v_row.id::text ->> 'l') end) then
      v_mask_lvl := case when v_world_def then 'viewer' else (v_levels -> v_row.id::text ->> 'l') end;
      v_mask := custom.read_mask_for(v_me, p_organization_id, p_table_id,
                                     case when v_world_def then 'viewer'::public.permission_level
                                          else (v_levels -> v_row.id::text ->> 'l')::public.permission_level end, 'read');
      -- DOOR-N-5: id-keyed on request means EVERY declared Field's key, as the page doors do.
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
        from jsonb_array_elements(v_mask -> 'visible') x;
      select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_declared
        from jsonb_array_elements(v_mask -> 'declared') x;
      v_mask_ready := true;
    end if;

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
