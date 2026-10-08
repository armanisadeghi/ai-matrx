-- chair-step: undo perffix5_a_a_read_of_ids_asks_those_ids.sql - restores custom.read_records_by_ids and custom.views as they were
-- lane: PERF-FIX-5
-- based-on: custom.read_records_by_ids(uuid, uuid, uuid[], boolean) 2b5f6be20b5fc171a00630fb79b24288cf7fbaa7205dd9860093a6947b78d6c6
-- based-on: custom.views(uuid, uuid) 0580dc54418abb38878d4fdb9d2f7d8c66eb79ee0d6113b2230a0c25f157c7c1

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

CREATE OR REPLACE FUNCTION custom.views(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(view_id uuid, name text, table_id uuid, filters jsonb, definition jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.views');
  -- CHAIR-WORLD-LANE: a person admitted only through the world lane lists the views of one Public Table.
  perform custom.assert_public_reader_names_a_public_table(p_organization_id, p_table_id, 'custom.views');
  return query
    select sv.id, sv.name, nullif(sv.definition ->> 'table_id', '')::uuid,
           coalesce(sv.definition -> 'filters', '{}'::jsonb),
           -- THE WHOLE DOCUMENT. The layout, the Field the board groups by, the Field the
           -- calendar reads, the sorts and the look all live in here, and the screen that
           -- drew it is the one thing that knows which of them it needs.
           coalesce(sv.definition, '{}'::jsonb),
           sv.created_at
      from platform.saved_view sv
     where sv.organization_id = p_organization_id
       and sv.deleted_at is null
       and sv.surface_key = 'custom/records'
       and (p_table_id is null or (sv.definition ->> 'table_id')::uuid = p_table_id)
       -- A LIST IS A DOOR, NEVER A GRANT ON THE THING BEHIND IT: narrowed in SQL, as
       -- the definer, to Tables this caller can already open — so the list of views
       -- can never reveal a Table.
       and (sv.definition ->> 'table_id')::uuid in
             (select v from custom.query_visible_ids(p_organization_id, custom.table_kernel_id()) v)
     order by sv.name;
end;
$function$;

