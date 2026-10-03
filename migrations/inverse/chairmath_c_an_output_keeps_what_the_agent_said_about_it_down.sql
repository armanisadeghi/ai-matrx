-- chair-step: the INVERSE of migrations/campaign/chairmath_c_an_output_keeps_what_the_agent_said_about_it.sql.
--   It restores `custom.record_write_graph_superseding` exactly as it stood on production on 2026-10-03
--   before that file (every platform Field stripped again). Rows that landed provenance keep them.
--   Hazard 4 (chair guidance): re-base this body on production's current one before running this
--   after any later file has replaced it.
--
-- based-on: custom.record_write_graph_superseding(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) dfc0b8eba82f19b5a2e2468d9e487cc81b407bcd518a77291c8933b355f8d575

CREATE OR REPLACE FUNCTION custom.record_write_graph_superseding(p_organization_id uuid, p_table_id uuid, p_lock_key text, p_idempotence jsonb DEFAULT NULL::jsonb, p_parent jsonb DEFAULT NULL::jsonb, p_edges jsonb DEFAULT '[]'::jsonb, p_children jsonb DEFAULT '[]'::jsonb, p_chain jsonb DEFAULT '{"mode": "first"}'::jsonb, p_rows_state jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_door     constant text := 'custom.record_write_graph_superseding';
  c_reasons  constant text[] := array['first', 'continued', 'regenerated', 'rewound', 'edited', 'agent_replaces',
                                      'agent_new', 'same_turn_sibling', 'branched', 'moved', 'split', 'migrated'];
  v_chainarg jsonb := coalesce(p_chain, '{}'::jsonb);
  v_mode     text;
  v_keys     jsonb;
  v_held     text;
  v_msg      uuid;
  v_fp       text;
  v_ordinal  text;
  v_dup      uuid;
  v_chain    uuid;
  v_old_chain uuid;
  v_current  uuid[] := '{}'::uuid[];
  v_gen      numeric;
  v_parent   uuid;
  v_target   uuid;
  v_row      custom.record;
  v_reason   text;
  v_doc      jsonb;
  v_patch    jsonb;
  v_edges    jsonb := '[]'::jsonb;
  v_children jsonb := '[]'::jsonb;
  v_item     jsonb;
  v_ckeys    jsonb;
  v_ctable   uuid;
  v_meta     jsonb;
  v_graph    jsonb;
  v_child_ids jsonb := '[]'::jsonb;
  v_superseded uuid[] := '{}'::uuid[];
  v_kept     uuid[] := '{}'::uuid[];
  v_revived  uuid[] := '{}'::uuid[];
  v_ids      uuid[];
  v_id       uuid;
  v_chains   uuid[] := '{}'::uuid[];
  v_land     boolean := false;   -- this call writes a new row into a chain
  v_edited   boolean := false;
  v_has_msg_edge boolean := false;
  v_rs_table uuid;
  v_rs_gen   numeric;
  v_rs_state text;
  v_flag     boolean;
begin
  -- ── THE SHAPE, BEFORE ANYTHING IS READ OR WRITTEN ─────────────────────────────────────────────
  if p_organization_id is null or p_table_id is null then
    raise exception 'An output is kept in one organization''s table, and this call does not say which.'
      using errcode = '22004', hint = 'Nothing was saved.';
  end if;
  if nullif(btrim(coalesce(p_lock_key, '')), '') is null then
    raise exception 'An output chain is changed under its own lock, and this call names none.'
      using errcode = '22004',
            hint = 'Pass p_lock_key = <conversation id>|<kind>, the key every landing of that chain shares. Nothing was saved.';
  end if;
  if jsonb_typeof(v_chainarg) <> 'object' then
    raise exception 'What to do with the chain is a set of named values, and this one is a %.', jsonb_typeof(v_chainarg)
      using errcode = '22023', hint = 'Nothing was saved.';
  end if;
  v_mode := lower(coalesce(nullif(btrim(v_chainarg ->> 'mode'), ''), 'first'));
  if v_mode not in ('first', 'join', 'edit', 'make_current', 'split', 'move', 'rewind', 'out_of_date') then
    raise exception 'An output is placed as first, join, edit, make_current, split, move, rewind or out_of_date, and this call asked for "%".', v_mode
      using errcode = '22023', hint = 'Nothing was saved.';
  end if;
  v_reason := nullif(btrim(coalesce(v_chainarg ->> 'reason', '')), '');
  if v_reason is not null and not (v_reason = any (c_reasons)) then
    raise exception '"%" is not a reason an output stands where it does. The reasons are %.', v_reason, array_to_string(c_reasons, ', ')
      using errcode = '22023', hint = 'Nothing was saved.';
  end if;
  if p_parent is not null and jsonb_typeof(p_parent) <> 'object' then
    raise exception 'An output is one record''s values, and this one is a %.', jsonb_typeof(p_parent)
      using errcode = '22023', hint = 'Nothing was saved.';
  end if;
  if p_edges is not null and jsonb_typeof(p_edges) <> 'array' then
    raise exception 'p_edges is the list of edges an output stands on, and this is %', jsonb_typeof(p_edges)
      using errcode = '22023', hint = 'Nothing was saved.';
  end if;
  if p_children is not null and jsonb_typeof(p_children) <> 'array' then
    raise exception 'p_children is the list of records an output contains, and this is %', jsonb_typeof(p_children)
      using errcode = '22023', hint = 'Nothing was saved.';
  end if;

  -- ── THE SWITCH, THE WALL, THE TABLE ──────────────────────────────────────────────────────────
  perform custom.assert_store_door(p_organization_id, c_door);
  perform custom.assert_client_may_reach(p_organization_id, c_door);
  -- An id that is no output table (another kind of table, another organization's, an invented one)
  -- answers this one sentence before any access question, so it tells nobody which ids exist.
  if custom.table_add_rung(p_organization_id, p_table_id) <> 'viewer'::public.permission_level then
    raise exception 'This door keeps outputs only in a table the app keeps for agent outputs, and this table is not one.'
      using errcode = '22023',
            hint = 'A person''s own table is written through custom.record_write or custom.record_write_graph. Nothing was saved.';
  end if;
  perform custom.assert_client_may_change(p_organization_id, p_table_id, c_door,
                                          'viewer'::public.permission_level, 'table');
  v_keys := custom._output_platform_keys(p_organization_id, p_table_id);
  if not (v_keys ? 'output_state' and v_keys ? 'output_chain') then
    raise exception 'This output table has no output_state or output_chain field, so no output in it can be told from an older one.'
      using errcode = '23514',
            hint = 'The table is made with its platform fields (config.kept_by = agent_output) by custom.table_ensure. Nothing was saved.';
  end if;

  -- ── ONE LOCK PER CHAIN KEY, HELD TO THE END OF THE TRANSACTION ───────────────────────────────
  -- Every read below (the idempotence edge, the current row, the generation) happens after it, so a
  -- second landing of the same chain waits here and then sees the first one's committed row.
  perform pg_advisory_xact_lock(hashtextextended('agent_output|' || p_organization_id::text || '|' || btrim(p_lock_key), 0));

  -- ── THE DOOR OPENS ITSELF FOR THIS TRANSACTION ONLY ──────────────────────────────────────────
  -- custom._value_envelope refuses a person's write of a platform Field unless it is this door's.
  v_held := current_setting('custom.output_chain_door', true);
  perform set_config('custom.output_chain_door', txid_current()::text, true);

  begin
    -- ── IDEMPOTENCE: (message, fingerprint, ordinal) on the produced_by edge, archived ones too ──
    if p_idempotence is not null and jsonb_typeof(p_idempotence) = 'object'
       and nullif(p_idempotence ->> 'message_id', '') is not null
       and nullif(p_idempotence ->> 'fingerprint', '') is not null then
      v_msg := (p_idempotence ->> 'message_id')::uuid;
      v_fp := p_idempotence ->> 'fingerprint';
      v_ordinal := coalesce(nullif(p_idempotence ->> 'ordinal', ''), '0');
      if v_mode in ('first', 'join', 'edit') then
        select a.target_id into v_dup
          from platform.associations a
         where a.source_type = 'message'
           and a.source_id = v_msg
           and a.target_type = 'record'
           and a.label = 'produced_by'
           and a.metadata ->> 'fingerprint' = v_fp
           and coalesce(nullif(a.metadata ->> 'ordinal', ''), '0') = v_ordinal
         order by a.created_at, a.id
         limit 1;
        if v_dup is not null then
          perform set_config('custom.output_chain_door', coalesce(v_held, ''), true);
          select r.* into v_row from custom.record r where r.organization_id = p_organization_id and r.id = v_dup;
          return jsonb_build_object(
            'status', 'duplicate', 'mode', v_mode, 'parent_id', v_dup::text,
            'chain', v_row.data ->> 'output_chain',
            'generation', v_row.data -> 'output_generation',
            'child_ids', coalesce((select jsonb_agg(c::text) from custom._output_contained(p_organization_id, v_dup) c), '[]'::jsonb),
            'superseded_ids', '[]'::jsonb, 'kept_ids', '[]'::jsonb);
        end if;
      end if;
    end if;

    -- ── WHICH ROW, WHICH CHAIN ──────────────────────────────────────────────────────────────────
    if v_mode in ('edit', 'make_current', 'split', 'move') then
      begin
        v_target := coalesce(nullif(case when v_mode = 'edit' then p_parent ->> '_record_id' end, ''),
                             nullif(v_chainarg ->> 'record_id', ''))::uuid;
      exception when others then
        raise exception 'The output to % is not named by a record id.', replace(v_mode, '_', ' ')
          using errcode = '22023', hint = 'Nothing was saved.';
      end;
      if v_target is null then
        raise exception 'This call does not say which output to %.', replace(v_mode, '_', ' ')
          using errcode = '22004',
                hint = 'Name it in p_chain.record_id (or, to revise it, as _record_id in p_parent). Nothing was saved.';
      end if;
      select r.* into v_row
        from custom.record r
       where r.organization_id = p_organization_id and r.id = v_target
         and r.table_id = p_table_id and r.deleted_at is null;
      if not found then
        raise exception 'There is no such output in this table.' using errcode = '02000',
                hint = 'It was archived, or it belongs to another table. Nothing was saved.';
      end if;
      v_old_chain := nullif(v_row.data ->> 'output_chain', '')::uuid;
    end if;

    if v_mode = 'first' then
      v_land := true;
      v_parent := gen_random_uuid();
      v_chain := v_parent;
      v_gen := 1;
      v_reason := coalesce(v_reason, 'first');
      v_doc := coalesce(p_parent, '{}'::jsonb);

    elsif v_mode = 'join' then
      begin
        v_chain := nullif(v_chainarg ->> 'chain', '')::uuid;
      exception when others then
        v_chain := null;
      end;
      if v_chain is null then
        raise exception 'A new version joins a chain, and this call does not name one.'
          using errcode = '22004', hint = 'Pass p_chain.chain, the chain''s id (its first output''s id). Nothing was saved.';
      end if;
      v_land := true;
      v_reason := coalesce(v_reason, 'continued');
      v_doc := coalesce(p_parent, '{}'::jsonb);

    elsif v_mode = 'edit' then
      if v_row.data ->> 'output_state' = 'superseded' then
        raise exception 'That one was replaced. Revise the current one, or make this one current first.'
          using errcode = '23514', hint = 'Nothing was saved.';
      end if;
      if nullif(v_chainarg ->> 'chain', '') is not null and v_chainarg ->> 'chain' is distinct from v_old_chain::text then
        raise exception 'That output belongs to another chain.' using errcode = '23514', hint = 'Nothing was saved.';
      end if;
      v_patch := coalesce(p_parent, '{}'::jsonb) - '_record_id';
      if exists (select 1 from jsonb_object_keys(v_patch) k where v_keys ? k) then
        raise exception 'A revision changes an output''s values; where it stands in its chain is this door''s to say.'
          using errcode = '22023', hint = 'Drop the output_* keys from the revision. Nothing was saved.';
      end if;
      if not exists (select 1 from jsonb_object_keys(v_patch) k where left(k, 1) <> '_') then
        raise exception 'This revision changes no value.' using errcode = '22023', hint = 'Nothing was saved.';
      end if;
      if jsonb_array_length(coalesce(p_children, '[]'::jsonb)) > 0 then
        raise exception 'A revision in place changes the output''s own values; it does not take new contained records.'
          using errcode = '22023', hint = 'Land a new version (mode join) to replace what it contains. Nothing was saved.';
      end if;
      v_chain := v_old_chain;
      v_edited := true;
      -- A KEPT ROW IS NEVER REVISED IN PLACE: the revision lands as a new version beside it.
      if custom._output_person_wrote(p_organization_id, p_table_id, v_row.data, v_keys) then
        if not coalesce((v_row.data ->> 'output_kept')::boolean, false) then
          perform custom._output_mark(p_organization_id, v_target, '{"output_kept": true}'::jsonb);
        end if;
        v_kept := v_kept || v_target;
        v_land := true;
        v_reason := 'edited';
        select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_doc
          from jsonb_each(v_row.data) e
         where left(e.key, 1) <> '_' and not (v_keys ? e.key)
           and not exists (select 1 from custom.record f
                            where f.organization_id = p_organization_id and f.table_id = custom.field_kernel_id()
                              and f.deleted_at is null and f.data ->> 'entity_definition_id' = p_table_id::text
                              and f.data ->> 'key' = e.key and f.data ->> 'type' = 'relation');
        v_doc := v_doc || v_patch;
      else
        perform custom.record_update(p_organization_id, v_target, v_patch,
                                     nullif(v_chainarg ->> 'expected_version', '')::integer);
        v_parent := v_target;
        v_gen := nullif(v_row.data ->> 'output_generation', '')::numeric;
      end if;
    end if;

    -- ── LANDING A NEW ROW INTO A CHAIN (first, join, a revision of a kept row) ──────────────────
    if v_land then
      if v_mode <> 'first' then
        if not exists (select 1 from custom.record r
                        where r.organization_id = p_organization_id and r.table_id = p_table_id
                          and r.data ->> 'output_chain' = v_chain::text) then
          raise exception 'There is no such chain in this table.' using errcode = '23503',
                  hint = 'Start one with mode first. Nothing was saved.';
        end if;
        select coalesce(array_agg(r.id order by r.created_at), '{}'::uuid[]) into v_current
          from custom.record r
         where r.organization_id = p_organization_id and r.table_id = p_table_id
           and r.deleted_at is null
           and r.data ->> 'output_chain' = v_chain::text
           and r.data ->> 'output_state' = 'draft';
        if v_chainarg ? 'expected_current'
           and (case when jsonb_typeof(v_chainarg -> 'expected_current') = 'string'
                     then v_chainarg ->> 'expected_current' end)
               is distinct from (v_current[1])::text then
          raise exception 'The latest version of this output changed while this one was being made, so nothing was saved.'
            using errcode = 'PT409',
                  detail = jsonb_build_object('expected_current', v_chainarg -> 'expected_current',
                                              'current', to_jsonb(v_current[1]))::text,
                  hint = 'Read the chain again and place this version against its current row.';
        end if;
        select coalesce(max(nullif(r.data ->> 'output_generation', '')::numeric), 0) + 1 into v_gen
          from custom.record r
         where r.organization_id = p_organization_id and r.table_id = p_table_id
           and r.data ->> 'output_chain' = v_chain::text;
        v_parent := gen_random_uuid();
        -- THE BELT: a current row a person wrote on is kept before it is superseded.
        foreach v_id in array v_current loop
          select r.* into v_row from custom.record r where r.organization_id = p_organization_id and r.id = v_id;
          if custom._output_person_wrote(p_organization_id, p_table_id, v_row.data, v_keys) then
            if not coalesce((v_row.data ->> 'output_kept')::boolean, false) then
              perform custom._output_mark(p_organization_id, v_id, '{"output_kept": true}'::jsonb);
            end if;
            if not (v_id = any (v_kept)) then v_kept := v_kept || v_id; end if;
          end if;
        end loop;
      end if;

      -- The output's own values, never the caller's say on the platform Fields.
      v_doc := (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
                  from jsonb_each(v_doc) e where not (v_keys ? e.key) and e.key <> '_record_id')
               || (select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
                     from jsonb_each(jsonb_build_object(
                            'output_state', 'draft', 'output_chain', v_chain::text, 'output_generation', v_gen,
                            'output_reason', v_reason, 'output_kept', false, 'output_out_of_date', false)) k
                    where v_keys ? k.key and v_keys ->> k.key <> 'relation');
      perform custom.record_write_many(p_organization_id, p_table_id, array[v_doc]::jsonb[], array[v_parent]::uuid[]);

      -- The edges: the produced_by edge carries the idempotence key and the chain facts.
      v_meta := coalesce(case when jsonb_typeof(p_idempotence) = 'object' then p_idempotence - 'message_id' end, '{}'::jsonb)
                || jsonb_build_object('chain', v_chain::text, 'generation', v_gen, 'ordinal', coalesce(v_ordinal, '0'));
      for v_item in select e from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) e loop
        if v_item ->> 'entity' = 'message' and coalesce(v_item ->> 'label', '') = 'produced_by'
           and coalesce(v_item ->> 'direction', 'in') = 'in' then
          v_item := jsonb_set(v_item, '{metadata}', coalesce(v_item -> 'metadata', '{}'::jsonb) || v_meta);
          if v_msg is not null and (v_item ->> 'id') = v_msg::text then v_has_msg_edge := true; end if;
        end if;
        v_edges := v_edges || jsonb_build_array(v_item);
      end loop;
      if v_msg is not null and not v_has_msg_edge then
        v_edges := v_edges || jsonb_build_array(jsonb_build_object(
          'entity', 'message', 'id', v_msg::text, 'direction', 'in', 'label', 'produced_by', 'metadata', v_meta));
      end if;

      -- The contained records carry the parent's place (B3), on each child Table's own platform Fields.
      for v_item in select e from jsonb_array_elements(coalesce(p_children, '[]'::jsonb)) e loop
        if jsonb_typeof(v_item) = 'object' and jsonb_typeof(v_item -> 'data') = 'object' then
          v_ctable := coalesce(nullif(v_item ->> 'table_id', '')::uuid, p_table_id);
          v_ckeys := custom._output_platform_keys(p_organization_id, v_ctable);
          v_item := jsonb_set(v_item, '{data}',
            (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
               from jsonb_each(v_item -> 'data') e where not (v_ckeys ? e.key))
            || (select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb)
                  from jsonb_each(jsonb_build_object('output_state', 'draft', 'output_chain', v_chain::text,
                                                     'output_generation', v_gen, 'output_reason', v_reason)) k
                 where v_ckeys ? k.key and v_ckeys ->> k.key <> 'relation'));
        end if;
        v_children := v_children || jsonb_build_array(v_item);
      end loop;

      if jsonb_array_length(v_edges) > 0 or jsonb_array_length(v_children) > 0 then
        v_graph := custom.record_write_graph(p_organization_id, null,
                                             jsonb_build_object('_record_id', v_parent::text), v_edges, v_children);
        v_child_ids := coalesce(v_graph -> 'child_ids', '[]'::jsonb);
      end if;

      -- The previous current row, and everything it contains, is superseded by this one.
      foreach v_id in array v_current loop
        perform custom._output_mark_with_contained(p_organization_id, v_id,
          jsonb_build_object('output_state', 'superseded', 'output_replaced_by', v_parent::text),
          jsonb_build_object('output_state', 'superseded'));
        v_superseded := v_superseded || v_id;
      end loop;

    elsif v_mode = 'edit' then
      -- A revision in place: its produced_by edge records that this message's block landed here.
      if v_msg is not null then
        perform custom.record_write_graph(p_organization_id, null, jsonb_build_object('_record_id', v_target::text),
          jsonb_build_array(jsonb_build_object('entity', 'message', 'id', v_msg::text, 'direction', 'in',
            'label', 'produced_by',
            'metadata', coalesce(p_idempotence - 'message_id', '{}'::jsonb)
                        || jsonb_build_object('chain', v_chain::text, 'generation', v_gen, 'ordinal', v_ordinal,
                                              'landing', 'edit'))),
          '[]'::jsonb);
      end if;

    elsif v_mode = 'make_current' then
      v_parent := v_target;
      v_chain := v_old_chain;
      if v_row.data ->> 'output_state' is distinct from 'draft' then
        for v_id in select r.id from custom.record r
                     where r.organization_id = p_organization_id and r.table_id = p_table_id and r.deleted_at is null
                       and r.data ->> 'output_chain' = v_chain::text and r.data ->> 'output_state' = 'draft'
                       and r.id <> v_target loop
          perform custom._output_mark_with_contained(p_organization_id, v_id,
            jsonb_build_object('output_state', 'superseded', 'output_replaced_by', v_target::text),
            jsonb_build_object('output_state', 'superseded'));
          v_superseded := v_superseded || v_id;
        end loop;
        perform custom._output_mark_with_contained(p_organization_id, v_target,
          jsonb_build_object('output_state', 'draft', 'output_replaced_by', null),
          jsonb_build_object('output_state', 'draft'));
        v_revived := v_revived || v_target;
      end if;
      v_gen := nullif(v_row.data ->> 'output_generation', '')::numeric;

    elsif v_mode in ('split', 'move') then
      v_parent := v_target;
      if v_mode = 'move' and nullif(v_chainarg ->> 'chain', '') is not null then
        v_chain := (v_chainarg ->> 'chain')::uuid;
        if not exists (select 1 from custom.record r
                        where r.organization_id = p_organization_id and r.table_id = p_table_id
                          and r.deleted_at is null and r.data ->> 'output_chain' = v_chain::text) then
          raise exception 'There is no such chain in this table to move it into.' using errcode = '23503',
                  hint = 'Nothing was saved.';
        end if;
      else
        v_chain := v_target;   -- a chain of its own, named by its first row: this one
      end if;
      if v_chain is distinct from v_old_chain then
        if v_chain = v_target then
          v_gen := 1;
        else
          select coalesce(max(nullif(r.data ->> 'output_generation', '')::numeric), 0) + 1 into v_gen
            from custom.record r
           where r.organization_id = p_organization_id and r.table_id = p_table_id
             and r.data ->> 'output_chain' = v_chain::text;
          for v_id in select r.id from custom.record r
                       where r.organization_id = p_organization_id and r.table_id = p_table_id and r.deleted_at is null
                         and r.data ->> 'output_chain' = v_chain::text and r.data ->> 'output_state' = 'draft' loop
            perform custom._output_mark_with_contained(p_organization_id, v_id,
              jsonb_build_object('output_state', 'superseded', 'output_replaced_by', v_target::text),
              jsonb_build_object('output_state', 'superseded'));
            v_superseded := v_superseded || v_id;
          end loop;
        end if;
        perform custom._output_mark_with_contained(p_organization_id, v_target,
          jsonb_build_object('output_state', 'draft', 'output_chain', v_chain::text, 'output_generation', v_gen,
                             'output_replaced_by', null, 'output_reason', coalesce(v_reason, case when v_mode = 'split' then 'split' else 'moved' end)),
          jsonb_build_object('output_state', 'draft', 'output_chain', v_chain::text, 'output_generation', v_gen));
        v_revived := v_revived || v_target;
        if v_old_chain is not null then
          v_chains := array[v_old_chain];
        end if;
      end if;

    elsif v_mode = 'rewind' then
      if jsonb_typeof(v_chainarg -> 'rewound') <> 'array' or jsonb_array_length(v_chainarg -> 'rewound') = 0 then
        raise exception 'A rewind names the outputs whose turns were rewound, and this one names none.'
          using errcode = '22004', hint = 'Pass p_chain.rewound, a list of output ids. Nothing was saved.';
      end if;
      select array_agg(distinct (x #>> '{}')::uuid) into v_ids from jsonb_array_elements(v_chainarg -> 'rewound') x;
      for v_row in select r.* from custom.record r
                    where r.organization_id = p_organization_id and r.table_id = p_table_id
                      and r.deleted_at is null and r.id = any (v_ids) loop
        if v_row.data ->> 'output_state' = 'draft' then
          perform custom._output_mark_with_contained(p_organization_id, v_row.id,
            jsonb_build_object('output_state', 'superseded', 'output_reason', 'rewound'),
            jsonb_build_object('output_state', 'superseded'));
          v_superseded := v_superseded || v_row.id;
        end if;
        if nullif(v_row.data ->> 'output_chain', '') is not null
           and not ((v_row.data ->> 'output_chain')::uuid = any (v_chains)) then
          v_chains := v_chains || (v_row.data ->> 'output_chain')::uuid;
        end if;
      end loop;

    elsif v_mode = 'out_of_date' then
      if not (v_keys ? 'output_out_of_date') then
        raise exception 'This output table has no output_out_of_date field.' using errcode = '23514', hint = 'Nothing was saved.';
      end if;
      v_flag := coalesce((v_chainarg ->> 'value')::boolean, true);
      if jsonb_typeof(v_chainarg -> 'record_ids') = 'array' then
        select array_agg((x #>> '{}')::uuid) into v_ids from jsonb_array_elements(v_chainarg -> 'record_ids') x;
      elsif nullif(v_chainarg ->> 'record_id', '') is not null then
        v_ids := array[(v_chainarg ->> 'record_id')::uuid];
      end if;
      if coalesce(cardinality(v_ids), 0) = 0 then
        raise exception 'This call does not say which outputs are out of date.' using errcode = '22004',
                hint = 'Pass p_chain.record_ids. Nothing was saved.';
      end if;
      for v_id in select r.id from custom.record r
                   where r.organization_id = p_organization_id and r.table_id = p_table_id
                     and r.deleted_at is null and r.id = any (v_ids) loop
        perform custom._output_mark(p_organization_id, v_id, jsonb_build_object('output_out_of_date', v_flag));
      end loop;
    end if;

    -- ── A CHAIN LEFT WITH NO CURRENT ROW TAKES ITS NEWEST REMAINING ONE (split, move, rewind) ────
    foreach v_chain in array v_chains loop
      if not exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.table_id = p_table_id and r.deleted_at is null
                        and r.data ->> 'output_chain' = v_chain::text and r.data ->> 'output_state' = 'draft') then
        select r.id into v_id from custom.record r
         where r.organization_id = p_organization_id and r.table_id = p_table_id and r.deleted_at is null
           and r.data ->> 'output_chain' = v_chain::text
           and not (r.id = any (coalesce(v_ids, '{}'::uuid[])))
         order by nullif(r.data ->> 'output_generation', '')::numeric desc nulls last, r.created_at desc
         limit 1;
        if v_id is not null then
          perform custom._output_mark_with_contained(p_organization_id, v_id,
            jsonb_build_object('output_state', 'draft', 'output_replaced_by', null),
            jsonb_build_object('output_state', 'draft'));
          v_revived := v_revived || v_id;
        end if;
        v_id := null;
      end if;
    end loop;
    if v_mode in ('split', 'move') then
      v_chain := nullif(coalesce((select r.data ->> 'output_chain' from custom.record r
                                   where r.organization_id = p_organization_id and r.id = v_target), ''), '')::uuid;
    end if;

    -- ── A data_table GENERATION'S ROWS TAKE ONE STATE (§3.2) ────────────────────────────────────
    if p_rows_state is not null and jsonb_typeof(p_rows_state) = 'object' then
      v_rs_table := nullif(p_rows_state ->> 'table_id', '')::uuid;
      v_rs_gen := nullif(p_rows_state ->> 'generation', '')::numeric;
      v_rs_state := p_rows_state ->> 'state';
      if v_rs_table is null or v_rs_gen is null or v_rs_state not in ('draft', 'superseded') then
        raise exception 'The rows to mark are named by a table, a generation and a state (draft or superseded).'
          using errcode = '22023', hint = 'Nothing was saved.';
      end if;
      if custom.table_add_rung(p_organization_id, v_rs_table) <> 'viewer'::public.permission_level then
        raise exception 'Rows are marked only in a table the app keeps for agent outputs, and that table is not one.'
          using errcode = '22023', hint = 'Nothing was saved.';
      end if;
      perform custom.assert_client_may_change(p_organization_id, v_rs_table, c_door, 'viewer'::public.permission_level, 'table');
      for v_id in select r.id from custom.record r
                   where r.organization_id = p_organization_id and r.table_id = v_rs_table and r.deleted_at is null
                     and nullif(r.data ->> 'output_generation', '')::numeric = v_rs_gen
                     and r.data ->> 'output_state' is distinct from v_rs_state loop
        perform custom._output_mark(p_organization_id, v_id, jsonb_build_object('output_state', v_rs_state));
      end loop;
    end if;
  exception when others then
    perform set_config('custom.output_chain_door', coalesce(v_held, ''), true);
    raise;
  end;
  perform set_config('custom.output_chain_door', coalesce(v_held, ''), true);

  return jsonb_build_object(
    'status', 'landed',
    'mode', v_mode,
    'parent_id', v_parent::text,
    'chain', v_chain::text,
    'generation', to_jsonb(v_gen),
    'edited_in_place', v_edited and not v_land,
    'child_ids', v_child_ids,
    'superseded_ids', to_jsonb(v_superseded::text[]),
    'made_current_ids', to_jsonb(v_revived::text[]),
    'kept_ids', to_jsonb(v_kept::text[]));
end;
$function$

;

