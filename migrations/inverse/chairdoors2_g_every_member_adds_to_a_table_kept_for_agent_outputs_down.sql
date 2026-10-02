-- chair-step: undo chairdoors2_g_every_member_adds_to_a_table_kept_for_agent_outputs.sql — restores the six door bodies exactly as they were (the editor rung on every Table) and drops custom.table_add_rung(uuid, uuid). Nothing else is touched.
-- lane: CHAIR-DOORS-2
-- (based-on lines: run pnpm db:based-on migrations/campaign/chairdoors2_g_every_member_adds_to_a_table_kept_for_agent_outputs.sql after the forward file is applied)

CREATE OR REPLACE FUNCTION custom.record_write(p_organization_id uuid, p_table_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id uuid;
begin
  -- THE ENVELOPE KEY COMES OFF FIRST. Before the door predicates, before the undeclared-key
  -- guard, before storage — `custom.record.data` must never hold it.
  p_data := custom._take_op_id(p_data, 'custom.record_write');

  -- The switch, then the organization, then the Table this record is being added to.
  -- `current_user` in here is already the definer; both predicates read the caller.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
  insert into custom.record (organization_id, table_id, data)
  values (p_organization_id, p_table_id,
          custom._record_defaults_filled(p_organization_id, p_table_id, coalesce(p_data, '{}'::jsonb)))
  returning id into v_id;
  return v_id;
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_write_many(p_organization_id uuid, p_table_id uuid, p_rows jsonb[], p_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_ids   uuid[];
  v_n     integer := coalesce(cardinality(p_rows), 0);
  v_clean jsonb[];
  v_seen  text := null;
  v_this  text;
  ord     integer;
begin
  -- The switch, then the organization, then the Table these records are being added to — the
  -- same two predicates `custom.record_write` asks, in the same order, ONCE for the batch.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_many');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write_many',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null then
    raise exception 'custom.record_write_many: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if v_n = 0 then
    perform set_config('custom.op_id', '', true);
    return '{}'::uuid[];
  end if;
  if p_ids is not null and coalesce(cardinality(p_ids), 0) <> v_n then
    raise exception 'custom.record_write_many: % ids were handed in for % records, so no row could be told from another', coalesce(cardinality(p_ids), 0), v_n
      using errcode = '22023',
            hint = 'Hand in one id per record, in the same order, or hand in none and let the door mint them. Nothing was written.';
  end if;

  -- ONE STATEMENT IS ONE OPERATION. Every row's `_op_id` comes off, and they must AGREE: a
  -- batch is one paste, one import, one click. Two different ids in one statement would make
  -- one notice that could only name one of them, so the other writer would be told to drop an
  -- echo that was never its own — which is the one way an echo filter loses a real change.
  v_clean := array[]::jsonb[];
  for ord in 1..v_n loop
    v_this := case when p_rows[ord] is not null and jsonb_typeof(p_rows[ord]) = 'object'
                   then p_rows[ord] ->> '_op_id' else null end;
    if v_this is not null then
      if v_seen is not null and v_seen <> v_this then
        raise exception 'custom.record_write_many: this batch carries two different _op_id values (% and %), and one statement announces itself once.', left(v_seen, 64), left(v_this, 64)
          using errcode = '22023',
                hint = 'Nothing was written. A batch is ONE client operation — one paste, one import, one click — so every row either carries the same _op_id or carries none. Split the rows into one call per operation, or leave the key out.';
      end if;
      v_seen := v_this;
    end if;
    v_clean := v_clean || case
                 when p_rows[ord] is null or jsonb_typeof(p_rows[ord]) <> 'object' then p_rows[ord]
                 -- DATA-V2-BASICS-2: every value this new record does not name takes its Field's default.
                 else custom._record_defaults_filled(p_organization_id, p_table_id, p_rows[ord] - '_op_id') end;
  end loop;

  -- Validated and remembered ONCE for the batch, through the same one place the single-row
  -- door uses, so a malformed id is refused with the same sentence.
  perform custom._take_op_id(
    case when v_seen is null then '{}'::jsonb else jsonb_build_object('_op_id', v_seen) end,
    'custom.record_write_many');

  if p_ids is null then
    select array_agg(gen_random_uuid() order by s) into v_ids
      from generate_subscripts(v_clean, 1) s;
  else
    v_ids := p_ids;
  end if;

  insert into custom.record (organization_id, table_id, id, data)
  select p_organization_id, p_table_id, v_ids[s], coalesce(v_clean[s], '{}'::jsonb)
    from generate_subscripts(v_clean, 1) s
   order by s;

  return v_ids;
end
$function$;

CREATE OR REPLACE FUNCTION custom.record_write_graph(p_organization_id uuid, p_table_id uuid, p_parent jsonb, p_edges jsonb DEFAULT '[]'::jsonb, p_children jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_parent_id  uuid;
  v_existing   boolean := false;
  v_kind       text;
  v_table      uuid;
  v_child_ids  uuid[] := '{}'::uuid[];
  v_edge_ids   uuid[] := '{}'::uuid[];
  v_op_id      text;
  v_item       jsonb;
  v_data       jsonb;
  v_ord        integer := 0;
  v_run_rows   jsonb[] := '{}'::jsonb[];
  v_run_ids    uuid[] := '{}'::uuid[];
  v_run_table  uuid;
  v_run_open   boolean := false;
  v_this_table uuid;
  v_children   jsonb[];
  v_n          integer;
  v_edge_id    uuid;
  v_role       text;
  v_targets    jsonb;
  v_relations  integer := 0;
  v_dir        text;
  v_where      text;
  v_state      text;
  v_msg        text;
  v_detail     text;
  v_hint       text;
begin
  -- THE SHAPE IS CHECKED BEFORE ANYTHING IS WRITTEN, because a refusal halfway through a graph
  -- is the one outcome this door exists to make impossible, and a caller that handed in the
  -- wrong shape deserves to be told so before it has paid for a single insert.
  if p_organization_id is null then
    raise exception 'custom.record_write_graph: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  -- A PARENT IS EITHER THE DOCUMENT TO MINT OR A REFERENCE TO THE ONE THAT IS ALREADY THERE,
  -- and `_record_id` says which. It is an ENVELOPE key, in the family the store already
  -- reserves (`_op_id`, `_actor`, `_on_behalf_of`; `custom.undeclared_keys` exempts every
  -- `_`-prefixed key), and never `id`, which is an ordinary FIELD of an ordinary document.
  v_kind := coalesce(jsonb_typeof(p_parent), 'null');
  if v_kind <> 'object' then
    raise exception 'custom.record_write_graph: a graph is a PARENT and everything that belongs to it, and no parent document was handed in (got %)', v_kind
      using errcode = '22004',
            hint = 'NOTHING WAS WRITTEN. To MINT the parent, hand it in as one jsonb object, exactly as custom.record_write takes it. To hang these lines on a parent that ALREADY stands, hand in {"_record_id": "<uuid>"}.';
  end if;
  v_existing := nullif(p_parent ->> '_record_id', '') is not null;
  if v_existing then
    -- A REFERENCE IS NOT A DOCUMENT. A caller that handed in both thinks it is minting AND
    -- repairing, and only one of those can happen — so it is told, rather than having one half
    -- of its intention silently dropped.
    if exists (select 1 from jsonb_object_keys(p_parent) k where left(k, 1) <> '_') then
      raise exception 'custom.record_write_graph: the parent names an existing record (_record_id) and also carries the document keys %', (select string_agg(k, ', ' order by k) from jsonb_object_keys(p_parent) k where left(k, 1) <> '_')
        using errcode = '22023',
              hint = 'NOTHING WAS WRITTEN. `_record_id` says "hang these lines on the parent that already stands", so there is no document to write and those keys would be thrown away. Either drop them, or drop `_record_id` and mint a new parent from the whole document.';
    end if;
    begin
      v_parent_id := (p_parent ->> '_record_id')::uuid;
    exception when others then
      raise exception 'custom.record_write_graph: _record_id is %, which is not a record id', left(p_parent ->> '_record_id', 64)
        using errcode = '22004',
              hint = 'NOTHING WAS WRITTEN. `_record_id` is the id of the record these lines belong to; leave the key out entirely to mint a new parent from this document.';
    end;
  else
    v_parent_id := gen_random_uuid();
  end if;
  v_where := case when v_existing then format('the existing parent %s', v_parent_id) else 'the parent record' end;
  if p_edges is not null and jsonb_typeof(p_edges) <> 'array' then
    raise exception 'custom.record_write_graph: p_edges is the list of edges this parent stands on, and this is %', jsonb_typeof(p_edges)
      using errcode = '22023',
            hint = 'NOTHING WAS WRITTEN. One edge is a list of one.';
  end if;
  if p_children is not null and jsonb_typeof(p_children) <> 'array' then
    raise exception 'custom.record_write_graph: p_children is the list of rows that belong to this parent, and this is %', jsonb_typeof(p_children)
      using errcode = '22023',
            hint = 'NOTHING WAS WRITTEN. One child is a list of one.';
  end if;
  if v_existing
     and coalesce(jsonb_array_length(coalesce(p_children, '[]'::jsonb)), 0) = 0
     and coalesce(jsonb_array_length(coalesce(p_edges, '[]'::jsonb)), 0) = 0 then
    raise exception 'custom.record_write_graph: names an existing parent and nothing to hang on it' using errcode = '22004',
            hint = 'NOTHING WAS WRITTEN, and nothing was going to be. The `_record_id` arm exists to give a parent that already stands the lines it never got; a call with no children and no edges would open a transaction, take the parent''s locks and change nothing, which reads to its caller exactly like a graph that landed.',
            detail = jsonb_build_object('parent_id', v_parent_id)::text;
  end if;

  -- THE SWITCH, THEN THE ORGANIZATION, THEN THE TABLE — the same two predicates
  -- `custom.record_write` asks and `custom.record_write_many` asks once for a batch, asked ONCE
  -- here for the whole graph. They are asked BY THIS BODY and not only by the door it calls,
  -- because they are questions about the caller, the organization and the Table, none of which
  -- can change between the parent and child nineteen — and because a door that only ever
  -- decided inside something it calls is a door whose own text says nothing about who may open
  -- it. `custom.record_write_many` asks them again per statement; that is the same two reads,
  -- and the second answer is the one that governs, so nothing here weakens or replaces it.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_graph');

  v_table := p_table_id;
  if v_existing then
    -- THE PARENT HAS TO REALLY BE THERE, and the answer to "it is not" is the same answer as
    -- "it is not yours" and "it has been archived" — one sqlstate, one sentence. A door that
    -- told those three apart would let a caller learn which record ids exist by trying them.
    select r.table_id into v_table
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = v_parent_id
       and r.deleted_at is null;
    if not found then
      raise exception 'custom.record_write_graph: there is no such live record you may write to, so there is no parent to hang these lines on' using errcode = '42501',
              hint = 'NOTHING WAS WRITTEN. A record that is not there, one that belongs to another organization and one that has been archived all answer this way on purpose. Check the id, the organization, and whether the parent was archived — an archived parent is restored before its lines are written, never given children while it is away.',
            detail = jsonb_build_object('parent_id', v_parent_id)::text;
    end if;
    -- THE SAME LADDER, ASKED ABOUT THE PARENT ITSELF. Giving a record lines IS changing it, so
    -- it is the editor rung on THAT record — not merely membership of the organization and not
    -- merely the rung on the children's Table. This is `custom.assert_client_may_change`, the
    -- one predicate every structural door in the store asks; `platform.relation_set` asks it
    -- again per field a moment later and the second answer governs, so nothing here replaces or
    -- weakens it. It is asked HERE as well because a refusal after the children are written is
    -- exactly the half-write this door exists to make impossible.
    perform custom.assert_client_may_change(p_organization_id, v_parent_id, 'custom.record_write_graph',
                                            'editor'::public.permission_level, 'record');
    -- The children default to the PARENT'S OWN Table when the caller named none, which is the
    -- ordinary repair: the lines of a record live where the record lives.
    v_table := coalesce(p_table_id, v_table);
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_table, 'custom.record_write_graph',
                                          'editor'::public.permission_level, 'table');

  -- ONE GRAPH IS ONE CLIENT OPERATION, so the parent's op id is the whole graph's op id. Read
  -- here and NOT removed: `custom.record_write_many` lifts it off through `custom._take_op_id`,
  -- which is the one place the envelope key is validated and the one place it is stripped.
  -- On the existing-parent arm there is no parent document to carry it, so it is read off the
  -- FIRST child and handed to all of them — the same rule, from the only row that can hold it.
  if v_existing then
    v_op_id := case when (p_children -> 0 -> 'data') ? '_op_id'
                    then p_children -> 0 -> 'data' ->> '_op_id' else null end;
  else
    v_op_id := case when p_parent ? '_op_id' then p_parent ->> '_op_id' else null end;
  end if;

  begin
    -- ── THE PARENT ────────────────────────────────────────────────────────────────────────
    -- Through the batch door with a batch of one and an id handed in, so the parent's id is
    -- known before its edges are written and every predicate, guard and trigger is the one
    -- `custom.record_write` would have run.
    if not v_existing then
      perform custom.record_write_many(p_organization_id, v_table,
                                       array[p_parent]::jsonb[], array[v_parent_id]::uuid[]);
    end if;

    -- ── THE EDGES THE PARENT STANDS ON ───────────────────────────────────────────────────
    v_ord := 0;
    for v_item in select * from jsonb_array_elements(coalesce(p_edges, '[]'::jsonb)) loop
      v_ord := v_ord + 1;
      v_where := format('edge %s of %s', v_ord, jsonb_array_length(coalesce(p_edges, '[]'::jsonb)));
      if jsonb_typeof(v_item) <> 'object'
         or nullif(v_item ->> 'entity', '') is null
         or nullif(v_item ->> 'id', '') is null then
        raise exception 'custom.record_write_graph: %s names no entity or no row', v_where
          using errcode = '22004',
                hint = 'An edge is {"entity": <entity token>, "id": <uuid>, "direction": "in"|"out"}. NOTHING WAS WRITTEN.';
      end if;
      v_dir := coalesce(nullif(v_item ->> 'direction', ''), 'in');
      if v_dir not in ('in', 'out') then
        raise exception 'custom.record_write_graph: % says direction %, and an edge points either "in" (that thing produced this record) or "out" (this record points at that thing)', v_where, v_dir
          using errcode = '22023', hint = 'NOTHING WAS WRITTEN.';
      end if;

      -- THE ONE ASSOCIATION WRITER. `public.assoc_add` decides access at BOTH endpoints, derives
      -- the edge's organization from a real endpoint rather than trusting the caller, and revives
      -- a tombstoned edge in place instead of duplicating it. A raw insert here would skip all
      -- three, which is the whole reason the assoc_* family exists.
      if v_dir = 'in' then
        v_edge_id := public.assoc_add(
          p_source_type => v_item ->> 'entity',
          p_source_id   => (v_item ->> 'id')::uuid,
          p_target_type => 'record',
          p_target_id   => v_parent_id,
          p_org_id      => p_organization_id,
          p_label       => nullif(v_item ->> 'label', ''),
          p_metadata    => coalesce(v_item -> 'metadata', '{}'::jsonb),
          p_role        => nullif(v_item ->> 'role', ''),
          p_position    => nullif(v_item ->> 'position', '')::integer);
      else
        v_edge_id := public.assoc_add(
          p_source_type => 'record',
          p_source_id   => v_parent_id,
          p_target_type => v_item ->> 'entity',
          p_target_id   => (v_item ->> 'id')::uuid,
          p_org_id      => p_organization_id,
          p_label       => nullif(v_item ->> 'label', ''),
          p_metadata    => coalesce(v_item -> 'metadata', '{}'::jsonb),
          p_role        => nullif(v_item ->> 'role', ''),
          p_position    => nullif(v_item ->> 'position', '')::integer);
      end if;
      v_edge_ids := v_edge_ids || v_edge_id;
    end loop;

    -- ── THE ROWS THAT BELONG TO THE PARENT ───────────────────────────────────────────────
    select array_agg(e order by n) into v_children
      from jsonb_array_elements(coalesce(p_children, '[]'::jsonb)) with ordinality t(e, n);
    v_n := coalesce(cardinality(v_children), 0);

    if v_n > 0 then
      -- A CHILD THAT NAMES NO FIELD IS REFUSED, and it is refused BEFORE the parent exists
      -- rather than left as a row nothing points at. A graph is a parent and the lines it
      -- promised; a line that cannot say which promise it fills is not one of them.
      for v_ord in 1..v_n loop
        if nullif(v_children[v_ord] ->> 'role', '') is null then
          v_where := format('child %s of %s', v_ord, v_n);
          raise exception 'custom.record_write_graph: % names no field of its parent', v_where
            using errcode = '23514',
                  hint = 'REL-10 / T7: a relation on a record IS a declared field of the parent''s Table, and `role` is that field''s key. Declare the relation field (custom.field_declare) and hand its key in as the child''s `role`. NOTHING WAS WRITTEN.';
        end if;
      end loop;
      for v_ord in 1..v_n loop
        v_item := v_children[v_ord];
        v_where := format('child %s of %s', v_ord, v_n);
        if jsonb_typeof(v_item) <> 'object' or jsonb_typeof(v_item -> 'data') <> 'object' then
          raise exception 'custom.record_write_graph: % carries no document', v_where
            using errcode = '22004',
                  hint = 'A child is {"data": {...}, "table_id": ?, "role": ?, "position": ?}. NOTHING WAS WRITTEN.';
        end if;
        v_this_table := coalesce(nullif(v_item ->> 'table_id', '')::uuid, v_table);
        v_data := v_item -> 'data';
        -- The graph's op id rides every row of the graph: one operation announces itself once,
        -- and `custom.record_write_many` refuses a batch carrying two different ids by name.
        if v_op_id is not null then
          v_data := v_data || jsonb_build_object('_op_id', v_op_id);
        end if;

        -- A CONTIGUOUS RUN OF ONE TABLE IS ONE STATEMENT. The ordinary graph — one parent, N
        -- children of one kind — costs two statements against `custom.record`, not N+1.
        if v_run_open and v_this_table is not distinct from v_run_table then
          v_run_rows := v_run_rows || v_data;
          v_run_ids  := v_run_ids || gen_random_uuid();
        else
          if v_run_open then
            perform custom.record_write_many(p_organization_id, v_run_table, v_run_rows, v_run_ids);
            v_child_ids := v_child_ids || v_run_ids;
          end if;
          v_run_table := v_this_table;
          v_run_rows  := array[v_data]::jsonb[];
          v_run_ids   := array[gen_random_uuid()]::uuid[];
          v_run_open  := true;
        end if;
      end loop;
      if v_run_open then
        perform custom.record_write_many(p_organization_id, v_run_table, v_run_rows, v_run_ids);
        v_child_ids := v_child_ids || v_run_ids;
      end if;

      -- THE PARENT'S OWN RELATION, NAMED BY ITS FIELD — through `platform.relation_set`, the
      -- store's ONE relation writer. Not `public.assoc_add`: an association OUT OF a record
      -- that carries a role and no `relation_field_id` is refused by
      -- `custom._store_relation_edge_names_its_field` (REL-10 / T7, measured on the clone
      -- 2026-09-22), and it is right to refuse — without the field nothing can read what the
      -- relation does when a target is deleted, how many targets it allows, or which tables it
      -- may point at, so the delete rules, the cardinality and the organization wall all
      -- silently do nothing. `relation_set` names the field itself, asks viewer on every target
      -- and editor on the parent, and writes the index into `position` so a parent with TWO
      -- array fields of the same child shape keeps its slots apart (DD-178).
      --
      -- ONE CALL PER FIELD, with that field's children in the order they were handed in.
      for v_role in
        select distinct on (c.role) c.role
          from (select v_children[s] ->> 'role' as role, s
                  from generate_subscripts(v_children, 1) s) c
         where nullif(c.role, '') is not null
         order by c.role, c.s
      loop
        v_where := format('the %I relation from this parent to its children', v_role);
        v_targets := '[]'::jsonb;
        for v_ord in 1..v_n loop
          if nullif(v_children[v_ord] ->> 'role', '') = v_role then
            v_targets := v_targets || jsonb_build_array(
              jsonb_build_object('entity', 'record', 'row_id', v_child_ids[v_ord]::text));
          end if;
        end loop;
        v_relations := v_relations + platform.relation_set(p_organization_id, v_parent_id,
                                                           v_role, v_targets);
      end loop;

    end if;

  exception when others then
    -- ONE REFUSAL REFUSES THE WHOLE GRAPH, BY NAME. The block above is one subtransaction, so
    -- reaching here has already undone the parent, every edge and every child; re-raising
    -- carries that up to the caller's transaction too. The store's OWN sqlstate, message,
    -- detail and hint are carried out whole — a door that re-worded the refusal it caught would
    -- be hiding the one sentence the caller can act on — with the member of the graph that
    -- refused named in front of it, because "a record was refused" is not an answer when
    -- nineteen rows were in flight.
    get stacked diagnostics
      v_state  = returned_sqlstate,
      v_msg    = message_text,
      v_detail = pg_exception_detail,
      v_hint   = pg_exception_hint;
    if v_state = 'PGRST' then
      -- ERRORS-HONEST: a not-found raised by platform.refuse_not_found inside a PostgREST request
      -- arrives here in PostgREST's own shape (the message is the JSON error body). Re-raising it
      -- under errcode PGRST with a plain sentence would be an unreadable fault, so it is unwrapped,
      -- the member of the graph that refused is named in front of it exactly as below, and it is
      -- raised again the one way a not-found is raised.
      perform platform.refuse_not_found(
        format('custom.record_write_graph refused the WHOLE graph on %s: %s', v_where, platform.refusal_message(v_state, v_msg)),
        coalesce(nullif((v_msg::jsonb) ->> 'hint', '') || ' ', '')
          || 'NOTHING WAS WRITTEN — not the parent, not one edge and not one child. A graph is all of it or none of it, which is the only reason this door exists.',
        coalesce(nullif((v_msg::jsonb) ->> 'details', ''), format('%s children and %s edges were in flight under parent %s.',
                                                                  jsonb_array_length(coalesce(p_children, '[]'::jsonb)),
                                                                  jsonb_array_length(coalesce(p_edges, '[]'::jsonb)),
                                                                  v_parent_id)));
    end if;
    raise exception 'custom.record_write_graph refused the WHOLE graph on %: %', v_where, v_msg
      using errcode = v_state,
            detail  = coalesce(nullif(v_detail, ''), format('%s children and %s edges were in flight under parent %s.',
                                                            jsonb_array_length(coalesce(p_children, '[]'::jsonb)),
                                                            jsonb_array_length(coalesce(p_edges, '[]'::jsonb)),
                                                            v_parent_id)),
            hint    = coalesce(nullif(v_hint, ''), '')
                      || case when coalesce(v_hint, '') = '' then '' else ' ' end
                      || 'NOTHING WAS WRITTEN — not the parent, not one edge and not one child. A graph is all of it or none of it, which is the only reason this door exists.';
  end;

  return jsonb_build_object(
    'parent_id',  v_parent_id::text,
    'parent',     case when v_existing then 'existing' else 'minted' end,
    'table_id',   v_table::text,
    'child_ids',  to_jsonb(v_child_ids::text[]),
    'edge_ids',   to_jsonb(v_edge_ids::text[]),
    'children',   coalesce(cardinality(v_child_ids), 0),
    'edges',      coalesce(cardinality(v_edge_ids), 0) + v_relations,
    'relations',  v_relations,
    'how',        case when v_existing
                       then 'the lines a parent that already stands never got — its children and their edges through custom.record_write_many, public.assoc_add and platform.relation_set in ONE transaction, with the editor rung asked about that parent before anything was written. The same doors, every guard, all or nothing.'
                       else 'one parent, its edges and its children through custom.record_write_many, public.assoc_add and platform.relation_set in ONE transaction — the same doors, every guard, all or nothing.' end);
end
$function$;

CREATE OR REPLACE FUNCTION custom.io_import_begin(p_organization_id uuid, p_table_id uuid, p_format text DEFAULT 'csv'::text, p_source_name text DEFAULT NULL::text, p_source_columns jsonb DEFAULT '[]'::jsonb, p_file_hash text DEFAULT NULL::text, p_policy jsonb DEFAULT '{}'::jsonb, p_dedupe_key text DEFAULT NULL::text, p_file_bytes bigint DEFAULT NULL::bigint, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_prior  custom.io_import;
  v_policy jsonb;
  v_dupes  text;
  v_unmap  text;
  v_id     uuid;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- Opening an import is a change to the Table's contents, so it is the editor rung, exactly
  -- as `custom.io_import_open` has always asked.
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_begin');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_begin');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.io_import_begin',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null or p_table_id is null then
    raise exception 'An import belongs to one organization and one table, and this one does not say which.'
      using errcode = '22004';
  end if;
  -- LANE 4 N2 (CHAIR-DOORS-1, 2026-10-02): `rows` — records that are not a file. A kind block's
  -- typed rows (an agent's output) arrive already structured, so there is no parse; everything after
  -- this line — the editor rung above, the duplicate key, the column policy, the run's report — is the
  -- one importer's, unchanged. custom.io_import_rows keeps a typed value as typed for this format.
  if coalesce(p_format, '') not in ('csv', 'xlsx', 'rows') then
    raise exception 'A file is read as a spreadsheet (xlsx) or as a comma-separated file (csv), records arrive as rows, and "%" is none of those.', p_format
      using errcode = '22023',
            hint = 'The parse differs; nothing after it does.';
  end if;

  v_policy := coalesce(p_policy, '{}'::jsonb);
  v_dupes  := lower(coalesce(nullif(btrim(coalesce(v_policy ->> 'on_duplicate', '')), ''), 'skip'));
  v_unmap  := lower(coalesce(nullif(btrim(coalesce(v_policy ->> 'unmapped', '')), ''), 'propose'));
  if v_dupes not in ('skip', 'update') then
    raise exception 'A row that is already here is either left alone ("skip") or brought up to date ("update"), and this import asked for "%".', v_dupes
      using errcode = '22023',
            hint = 'Nothing was opened. Writing a second copy is not one of the choices, which is the whole point of naming a duplicate key.';
  end if;
  if v_unmap not in ('propose', 'create', 'ignore') then
    raise exception 'A column this table does not have is offered as a new column ("propose"), added outright ("create") or left out ("ignore"), and this import asked for "%".', v_unmap
      using errcode = '22023', hint = 'Nothing was opened.';
  end if;
  -- ADDING A COLUMN OUTRIGHT IS AN ADMIN'S ACT, AND IT IS ASKED HERE RATHER THAN AT THE END.
  -- A person who chose "just add them" and is told at the end of a 5,000-row run that they
  -- may not has been made to wait for a refusal the store knew at the start.
  if v_unmap = 'create'
     and custom.my_level(p_organization_id, p_table_id, 'table') <> 'admin'::public.permission_level
     and not custom.query_is_store_owner() then
    raise exception 'Adding columns to this table outright is for its admins. Your columns can still be OFFERED, and whoever admins this table decides.'
      using errcode = '42501',
            hint = 'Open the import with unmapped set to "propose" and every new column goes to the approvals inbox instead. Nothing was opened.';
  end if;
  if nullif(btrim(coalesce(p_dedupe_key, '')), '') is not null
     and not exists (select 1 from custom.applicable_fields(p_organization_id, p_table_id, null) f
                      where f.data ->> 'key' = btrim(p_dedupe_key)) then
    raise exception 'This table has no column called "%", so it cannot be what makes a row the same row.', btrim(p_dedupe_key)
      using errcode = '23503',
            hint = 'The columns are: ' ||
                   coalesce((select string_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), ', ' order by f.data ->> 'key')
                               from custom.applicable_fields(p_organization_id, p_table_id, null) f), '(none yet)') ||
                   '. Nothing was opened.';
  end if;

  -- THE SAME FILE, TWICE. This is the whole of "a re-import doubles nothing", and it is
  -- decided here rather than per row: the second run is never opened at all, so there is no
  -- half-run to reconcile and no second set of proposals for the same columns.
  --
  -- 🚨 FIX-10B (VERIFIER-10 F2). The question is "DID ANYTHING LAND", not "have I seen this
  -- file". A run that wrote nothing and matched nothing is not the time this file was
  -- imported — it is a run that failed — and remembering it turned a guard against DOUBLE
  -- writing into a guard against ANY writing: the file that created a table's columns on its
  -- first pass could never be imported again. A run that landed rows or matched duplicates is
  -- still answered exactly as before, with its own date and its own true count.
  if nullif(btrim(coalesce(p_file_hash, '')), '') is not null and not coalesce(p_force, false) then
    select * into v_prior
      from custom.io_import i
     where i.organization_id = p_organization_id
       and i.table_id = p_table_id
       and i.file_hash = btrim(p_file_hash)
       and i.deleted_at is null
       and (coalesce(i.rows_written, 0) > 0 or coalesce(i.rows_duplicate, 0) > 0)
     order by i.created_at
     limit 1;
    if found then
      return jsonb_build_object(
        'rows_per_call', 25,
        'import_id',     v_prior.id,
        'state',         v_prior.state,
        'already',       true,
        'opened_at',     v_prior.created_at,
        'rows_seen',     v_prior.rows_seen,
        'rows_written',  v_prior.rows_written,
        'rows_duplicate',v_prior.rows_duplicate,
        'source_name',   v_prior.source_name,
        'message',       format('This file was already imported into this table on %s — %s row%s landed then. Nothing was written again.',
                                to_char(v_prior.created_at at time zone 'utc', 'FMDay FMDD FMMonth, HH24:MI'),
                                v_prior.rows_written,
                                case when v_prior.rows_written = 1 then '' else 's' end));
    end if;
  end if;

  insert into custom.io_import (organization_id, table_id, format, source_name, source_columns,
                                file_hash, file_bytes, dedupe_key, policy, state)
  values (p_organization_id, p_table_id, p_format, p_source_name,
          coalesce(p_source_columns, '[]'::jsonb),
          nullif(btrim(coalesce(p_file_hash, '')), ''),
          p_file_bytes,
          nullif(btrim(coalesce(p_dedupe_key, '')), ''),
          jsonb_build_object('on_duplicate', v_dupes, 'unmapped', v_unmap)
            || (v_policy - 'on_duplicate' - 'unmapped')
            || case when coalesce(p_force, false) then jsonb_build_object('forced', true) else '{}'::jsonb end,
          'open')
  returning id into v_id;

  return jsonb_build_object('import_id', v_id, 'state', 'open', 'already', false,
                            'rows_seen', 0, 'rows_written', 0, 'rows_duplicate', 0,
                            'source_name', p_source_name,
                            -- IMPORT-2: THE OPENING GUESS, SAID BY THE DOOR RATHER THAN BY A
                            -- SCREEN. Nothing has been measured yet, so this is the one number
                            -- in the whole walk that is chosen rather than observed, and it is
                            -- chosen HERE so that there is exactly one of it. 25 (lane FOLLOW-BATCH-2; it was 100) because the
                            -- writing phase measured 12-13 ms a row on a quiet database and
                            -- 22-33 ms a row on a loaded one (both measured 2026-09-22 on the
                            -- main database, 250-row batches of a real 8-column dispatch file),
                            -- and 100 x 33 ms is 3.3 s - comfortably inside the ~8 s ceiling on
                            -- the worst moment seen. Every call after the first uses the
                            -- rows_per_call custom.io_import_rows measured on the call before.
                            'rows_per_call', 25,
                            'message', 'Ready. Send the rows in batches.');
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_keep    constant integer := 500;   -- the cap on kept refusals / duplicates, said out loud
  v_run     custom.io_import;
  v_map     jsonb;
  v_fields  jsonb := '{}'::jsonb;      -- field key -> the Field document
  v_f       record;
  v_row     jsonb;
  v_doc     jsonb;
  v_values  jsonb;
  v_src     jsonb;
  v_key     text;
  v_val     jsonb;
  v_word    text;
  v_mapped  text;
  v_cell    jsonb;
  v_order   text;
  v_dk      text;
  v_dkvals  text[];
  v_exist   jsonb := '{}'::jsonb;      -- duplicate-key value -> the record already holding it
  v_seen    integer := 0;
  v_landed  integer := 0;
  v_dupes   integer := 0;
  v_bad     integer := 0;
  v_out     jsonb := '[]'::jsonb;      -- this batch's per-row outcomes
  v_ref     jsonb := '[]'::jsonb;
  v_dup     jsonb := '[]'::jsonb;
  v_unmap   jsonb := '{}'::jsonb;
  v_props   jsonb := '[]'::jsonb;
  v_patch   jsonb;
  v_reason  text;
  v_index   integer;
  v_mode    text;
  v_made    jsonb := '[]'::jsonb;      -- the columns this call had to declare after all
  v_decl    jsonb;
  -- THE PLAN. One entry per row of this batch, in file order, decided before anything is
  -- written; `ord` is a row's place in the batched statement, which is also where its id is.
  v_plan    jsonb := '[]'::jsonb;
  v_entry   jsonb;
  v_ord     integer := 0;
  v_docs    jsonb[] := array[]::jsonb[];
  v_ids     uuid[] := array[]::uuid[];
  v_id      uuid;
  v_fell    text := null;              -- why the batched statement was refused, if it was
  v_failed  jsonb := '{}'::jsonb;      -- ord -> why THAT row could not be written on its own
  -- THE UNIQUE RULE, HELD INSIDE THE BATCH (see the migration header, (c)).
  v_uq      text[] := array[]::text[]; -- the keys of the columns carrying a unique rule
  v_uqlab   jsonb := '{}'::jsonb;      -- key -> the word a person reads
  v_uqseen  jsonb := '{}'::jsonb;      -- "key|lowered value" -> the row that took it
  v_u       text;
  -- IMPORT-2: how long the WRITING phase of this call took, and what that makes a comfortable
  -- number of rows for the next one. Measured, never assumed.
  c_comfort numeric;                   -- the milliseconds of MEASURED writing work a call aims at:
                                       -- HALF of knob copy/max_auth_lock_ms (lane FOLLOW-BATCH-2;
                                       -- it was a fixed 2000). Every call locks the sign-in table
                                       -- from its first insert to its COMMIT (each row names who
                                       -- created it), so a call is a step of a copy; half leaves
                                       -- room for the outcome phase after the writes and for a
                                       -- database that gets twice as busy between two calls.
  v_t0      timestamptz;
  v_wrote   numeric;
  v_perrow  numeric;
  v_next    integer;
  -- B4-03 (2026-09-30): THE VALUES OF A COLUMN THAT WAITS FOR APPROVAL WAIT WITH IT. This batch's
  -- record id -> {header: the pasted word} for every landed row; merged below into each waiting
  -- proposal as `values` (record id -> word), at most `c_hold_max` per column, and a column that
  -- had more says so (`values_cut`).
  c_hold_max constant integer := 20000;
  v_hold    jsonb := '{}'::jsonb;
  v_rest    jsonb;
begin
  c_comfort := greatest(100, 0.5 * (platform.knob_resolve('copy', 'max_auth_lock_ms', p_organization_id) #>> '{}')::numeric);
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_rows');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');

  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here to add rows to.'
      using errcode = '23503',
            hint = 'Open one with custom.io_import_begin first. Nothing was written.';
  end if;
  if v_run.state = 'finished' then
    raise exception 'That import is finished, so no more rows go into it.' using errcode = '23514',
            hint = 'Start a new import for the rest of the file. Nothing was written.',
            detail = jsonb_build_object('finished_at', coalesce(v_run.finished_at, v_run.updated_at))::text;
  end if;
  -- THE RUNG, ON THE TABLE THIS RUN BELONGS TO, on every batch.
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_rows',
                                          'editor'::public.permission_level, 'table');

  v_map   := coalesce(v_run.mapping, '{}'::jsonb) || coalesce(p_mapping, '{}'::jsonb);
  v_order := lower(coalesce(nullif(v_run.policy ->> 'date_order', ''), 'mdy'));
  v_dk    := nullif(btrim(coalesce(v_run.dedupe_key, '')), '');
  v_mode  := lower(coalesce(nullif(v_run.policy ->> 'unmapped', ''), 'propose'));

  -- ── THE COLUMNS. A run whose wizard took the `io_import_declare_columns` step finds every
  --    column already here and declares NOTHING; a caller that skipped it still lands its
  --    rows, because FIX-10B's pre-pass is the safety net rather than the normal path.
  if v_mode = 'create' then
    v_decl := custom._io_declare_unmapped(p_organization_id, v_run.table_id, p_rows, v_map);
    v_map  := v_decl -> 'mapping';
    v_made := (select coalesce(jsonb_agg(c || jsonb_build_object('import_id', p_import_id::text)), '[]'::jsonb)
                 from jsonb_array_elements(v_decl -> 'columns_added') c);
  end if;

  -- THE TABLE'S OWN COLUMNS, READ ONCE FOR THE WHOLE BATCH — after any declaration above, so
  -- the batch is written against what the table actually has.
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, v_run.table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
    if exists (select 1 from jsonb_array_elements(coalesce(v_f.data -> 'rules', '[]'::jsonb)) x
                where x ->> 'kind' = 'unique') then
      v_uq    := v_uq || (v_f.data ->> 'key');
      v_uqlab := v_uqlab || jsonb_build_object(v_f.data ->> 'key',
                              coalesce(nullif(v_f.data ->> 'label', ''), v_f.data ->> 'key'));
    end if;
  end loop;

  -- WHAT IS ALREADY HERE, for exactly the key values this batch carries.
  if v_dk is not null then
    select array_agg(distinct w) into v_dkvals
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r,
           lateral (select btrim(coalesce(
                      r.value ->> coalesce((select k from jsonb_each_text(v_map) m(k, val) where val = v_dk limit 1), v_dk),
                      r.value ->> v_dk, '')) as w) s
     where s.w <> '';
    if v_dkvals is not null and cardinality(v_dkvals) > 0 then
      select coalesce(jsonb_object_agg(t.w, t.id), '{}'::jsonb) into v_exist
        from (select r.data ->> v_dk as w, min(r.id::text) as id
                from custom.record r
               where r.organization_id = p_organization_id
                 and r.table_id = v_run.table_id
                 and r.data_class = 'record'
                 and r.deleted_at is null
                 and r.data ->> v_dk = any (v_dkvals)
               group by 1) t;
    end if;
  end if;

  -- THE SOURCE EVERY VALUE OF THIS RUN POINTS AT.
  v_src := jsonb_strip_nulls(jsonb_build_object(
             'kind',      'import',
             'import_id', p_import_id::text,
             'file',      v_run.source_name,
             'hash',      v_run.file_hash,
             'format',    v_run.format));

  -- ══ PHASE ONE — THE PLAN. Nothing is written here. ═══════════════════════════════════════
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen  := v_seen + 1;
    v_index := coalesce(v_run.rows_seen, 0) + v_seen;
    v_doc   := '{}'::jsonb;
    v_values:= '{}'::jsonb;
    v_reason:= null;

    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      v_mapped := coalesce(v_map ->> v_key,
                           case when v_fields ? v_key then v_key else null end);
      if v_mapped is null then
        -- SCR-N-7: not an error, an OFFER.
        v_unmap := v_unmap || jsonb_build_object(
          v_key, coalesce(v_unmap -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmap -> v_key, '[]'::jsonb)) < 12
                        and coalesce(v_val #>> '{}', '') <> ''
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
        continue;
      end if;
      if not (v_fields ? v_mapped) then
        v_reason := format('This table has no column called "%s", so "%s" has nowhere to go.', v_mapped, v_key);
        exit;
      end if;
      v_word := v_val #>> '{}';
      -- LANE 4 N2: A TYPED VALUE STAYS TYPED. Records that arrive as `rows` carry numbers, booleans,
      -- lists and objects as themselves; reading them back through words would turn a list into its
      -- JSON text. Words (strings) still go through io_cell, so a choice label, an email in a person
      -- column and a relation's title resolve exactly as a file's do, and a worked-out or file column
      -- is refused by io_cell's own sentence whatever the value's type. The write path validates.
      if v_run.format = 'rows' and jsonb_typeof(v_val) in ('number', 'boolean', 'array', 'object')
         and coalesce(custom.parity_type(v_fields -> v_mapped), v_fields -> v_mapped ->> 'type')
             not in ('formula', 'lookup', 'rollup', 'attachment') then
        v_cell := jsonb_build_object('ok', true, 'value', v_val);
      else
        v_cell := custom.io_cell(p_organization_id, v_fields -> v_mapped,
                                 case when v_run.format = 'rows' and jsonb_typeof(v_val) <> 'string'
                                      then coalesce(v_word, '') else v_word end, v_order);
      end if;
      if not (v_cell ->> 'ok')::boolean then
        v_reason := v_cell ->> 'reason';
        exit;
      end if;
      if coalesce((v_cell ->> 'skip')::boolean, false) then
        continue;
      end if;
      v_doc    := v_doc    || jsonb_build_object(v_mapped, v_cell -> 'value');
      v_values := v_values || jsonb_build_object(v_mapped, jsonb_build_object('src', v_src));
    end loop;

    -- LIMITS-FIX 2026-09-21: A ROW WITH NOTHING IN IT IS NOT A RECORD.
    if v_reason is null and v_doc = '{}'::jsonb then
      v_reason := case
        when jsonb_typeof(v_row) = 'object' and (select count(*) from jsonb_object_keys(v_row)) = 0
          then 'This row is empty, so there is nothing to save.'
        when v_unmap = '{}'::jsonb
          then 'Every column in this row was blank, so there is nothing to save.'
        else format('None of this row''s columns go anywhere in this table, so there is nothing to save. Unmatched: %s.',
                    (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_unmap) k))
      end;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    -- ALREADY HERE? The duplicate key decides, and the policy decides what that means.
    -- A key this batch has already PLANNED counts, exactly as a key it had already written
    -- counted before — `v_exist` carries `pending:<ord>` for those, because the id is minted
    -- in the plan and `custom.record_write_many` gives the rows back in input order.
    if v_dk is not null then
      v_word := v_doc ->> v_dk;
      if v_word is not null and v_exist ? v_word then
        v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                    'kind', 'duplicate', 'row', v_index, 'key', v_word,
                    'hit', v_exist ->> v_word, 'doc', v_doc, 'values', v_values, 'source', v_row));
        continue;
      end if;
    end if;

    -- THE UNIQUE RULE, INSIDE THIS BATCH. custom._unique_rule_holds asks custom.record, and a
    -- row written earlier in the SAME statement is not there to be found, so the door holds
    -- the line for the batch with that trigger's own sentence and SQLSTATE. Anything this
    -- batch cannot see — another session, an earlier batch, a record already here — is still
    -- the trigger's to refuse.
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u = '' then continue; end if;
        if v_uqseen ? (v_key || '|' || v_u) then
          v_reason := format('Another record here already has %s "%s", and %s has to be different on every record.',
                             v_uqlab ->> v_key, btrim(v_word), v_uqlab ->> v_key);
          exit;
        end if;
      end loop;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    v_ord  := v_ord + 1;
    v_id   := gen_random_uuid();
    v_ids  := v_ids  || v_id;
    v_docs := v_docs || (
                v_doc
                || case when v_values = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('_values', v_values) end
                || jsonb_build_object('_actor', 'system',
                                      '_source', jsonb_strip_nulls(jsonb_build_object(
                                        'via', 'import', 'import_id', p_import_id::text,
                                        'file', v_run.source_name, 'row', v_index))));
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                'kind', 'write', 'row', v_index, 'ord', v_ord, 'source', v_row));
    if v_dk is not null and v_doc ->> v_dk is not null then
      v_exist := v_exist || jsonb_build_object(v_doc ->> v_dk, 'pending:' || v_ord::text);
    end if;
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u <> '' then v_uqseen := v_uqseen || jsonb_build_object(v_key || '|' || v_u, v_ord); end if;
      end loop;
    end if;
  end loop;

  -- ══ PHASE TWO — ONE STATEMENT. ═══════════════════════════════════════════════════════════
  v_t0 := clock_timestamp();
  if cardinality(v_ids) > 0 then
    begin
      perform custom.record_write_many(p_organization_id, v_run.table_id, v_docs, v_ids);
    exception when others then
      -- A BAD ROW REFUSES THE WHOLE STATEMENT, WHICH IS RIGHT FOR A PASTE AND WRONG FOR AN
      -- IMPORT. The plan is replayed through the single-row door so every row carries its own
      -- outcome and the good rows still land. Only a refused batch pays for this.
      v_fell := sqlerrm;
    end;
  end if;

  if v_fell is not null then
    v_ids := array_fill(null::uuid, array[cardinality(v_ids)]);
    for v_entry in select value from jsonb_array_elements(v_plan) where value ->> 'kind' = 'write' loop
      v_ord := (v_entry ->> 'ord')::integer;
      begin
        v_ids[v_ord] := custom.record_write(p_organization_id, v_run.table_id, v_docs[v_ord]);
      exception when others then
        v_ids[v_ord] := null;
        v_failed := v_failed || jsonb_build_object(v_ord::text,
                      jsonb_build_object('reason', sqlerrm, 'sqlstate', sqlstate));
      end;
    end loop;
  end if;

  -- HOW MANY ROWS THIS DATABASE CAN COMFORTABLY TAKE IN ONE CALL, from what it just did.
  -- Only the writing phase is measured, because that is the part that scales with the batch.
  v_wrote  := extract(epoch from clock_timestamp() - v_t0) * 1000;
  v_perrow := case when cardinality(v_ids) > 0 then v_wrote / cardinality(v_ids) else null end;
  v_next   := case when coalesce(v_perrow, 0) <= 0 then null
                   else greatest(25, least(1000, floor(c_comfort / v_perrow)::integer)) end;

  -- ══ PHASE THREE — WHAT HAPPENED TO EVERY ROW, IN FILE ORDER. ═════════════════════════════
  for v_entry in select value from jsonb_array_elements(v_plan) loop
    v_index := (v_entry ->> 'row')::integer;

    if v_entry ->> 'kind' = 'refused' then
      v_bad := v_bad + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
                 'row', v_index, 'outcome', 'refused', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      if jsonb_array_length(v_ref) < c_keep then
        v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'sqlstate', '22023', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      end if;

    elsif v_entry ->> 'kind' = 'write' then
      v_ord := (v_entry ->> 'ord')::integer;
      if v_ids[v_ord] is null then
        v_bad := v_bad + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'refused',
                   'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        if jsonb_array_length(v_ref) < c_keep then
          v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'sqlstate', coalesce(v_entry ->> 'sqlstate', '22023'),
                     'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        end if;
      else
        v_landed := v_landed + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'landed', 'record_id', v_ids[v_ord]));
        if v_mode = 'propose' then
          select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) into v_rest
            from jsonb_each(v_entry -> 'source') s
           where not (v_map ? s.key) and not (v_fields ? s.key)
             and coalesce(s.value #>> '{}', '') <> '';
          if v_rest <> '{}'::jsonb then
            v_hold := v_hold || jsonb_build_object((v_ids[v_ord])::text, v_rest);
          end if;
        end if;
      end if;

    else  -- a duplicate of something already here, or of a row this very batch planned
      v_word := v_entry ->> 'hit';
      if left(v_word, 8) = 'pending:' then
        v_ord := substr(v_word, 9)::integer;
        if v_ids[v_ord] is null then
          -- The row this one repeats was refused after all, so this copy is not a repeat of
          -- anything that exists. It is written on its own, exactly as it would have been.
          begin
            v_id := custom.record_write(p_organization_id, v_run.table_id,
                      (v_entry -> 'doc')
                      || case when (v_entry -> 'values') = '{}'::jsonb then '{}'::jsonb
                              else jsonb_build_object('_values', v_entry -> 'values') end
                      || jsonb_build_object('_actor', 'system',
                                            '_source', jsonb_strip_nulls(jsonb_build_object(
                                              'via', 'import', 'import_id', p_import_id::text,
                                              'file', v_run.source_name, 'row', v_index))));
            v_landed := v_landed + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'landed', 'record_id', v_id));
            if v_mode = 'propose' then
              select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb) into v_rest
                from jsonb_each(v_entry -> 'source') s
               where not (v_map ? s.key) and not (v_fields ? s.key)
                 and coalesce(s.value #>> '{}', '') <> '';
              if v_rest <> '{}'::jsonb then
                v_hold := v_hold || jsonb_build_object((v_id)::text, v_rest);
              end if;
            end if;
          exception when others then
            v_bad := v_bad + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
            if jsonb_array_length(v_ref) < c_keep then
              v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                         'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
            end if;
          end;
          continue;
        end if;
        v_word := v_ids[v_ord]::text;
      end if;

      v_dupes := v_dupes + 1;
      v_patch := (v_entry -> 'doc') - v_dk;
      if lower(coalesce(v_run.policy ->> 'on_duplicate', 'skip')) = 'update' then
        begin
          if v_patch <> '{}'::jsonb then
            perform custom.record_update(p_organization_id, v_word::uuid,
                      v_patch || jsonb_build_object('_values', (v_entry -> 'values') - v_dk, '_actor', 'system'), null);
          end if;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid,
                     'updated', v_patch <> '{}'::jsonb,
                     'reason', format('A record with %s = "%s" was already here, and it was brought up to date.', v_dk, v_entry ->> 'key')));
        exception when others then
          v_bad := v_bad + 1; v_dupes := v_dupes - 1;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
          if jsonb_array_length(v_ref) < c_keep then
            v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
          end if;
          continue;
        end;
      else
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid, 'updated', false,
                   'reason', format('A record with %s = "%s" was already here, and it was left alone.', v_dk, v_entry ->> 'key')));
      end if;
      if jsonb_array_length(v_dup) < c_keep then
        v_dup := v_dup || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'key', v_dk, 'value', v_entry ->> 'key',
                   'record_id', v_word::uuid, 'source', v_entry -> 'source'));
      end if;
    end if;
  end loop;

  -- THE PROPOSALS, built from everything this batch saw and MERGED with what earlier batches saw.
  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_props
    from (
      select jsonb_build_object('column', u.key,
                                'samples', u.value,
                                'import_id', p_import_id::text)
             || (custom.io_infer_column(p_organization_id, v_run.table_id, u.key, u.value)
                   - 'header' - 'matched')
             || jsonb_build_object('state', 'proposed') as p
        from jsonb_each(v_unmap) u
       where not exists (select 1 from jsonb_array_elements(v_run.proposals) q
                          where q ->> 'column' = u.key)
    ) s;

  update custom.io_import
     set rows_seen      = rows_seen + v_seen,
         rows_written   = rows_written + v_landed,
         rows_duplicate = rows_duplicate + v_dupes,
         refusals       = refusals || v_ref,
         duplicates     = duplicates || v_dup,
         proposals      = case when v_hold = '{}'::jsonb then proposals || v_made || v_props else (
           select coalesce(jsonb_agg(case when coalesce(p ->> 'state', 'proposed') <> 'proposed' then p else p || (
                    select case when count(*) = 0 then '{}'::jsonb else
                             jsonb_build_object('values', coalesce(p -> 'values', '{}'::jsonb) || jsonb_object_agg(k.key, k.word))
                             || case when count(*) < max(k.offered) then jsonb_build_object('values_cut', true) else '{}'::jsonb end
                           end
                      from (select h.key, h.word, count(*) over () as offered,
                                   row_number() over () as n
                              from (select h.key, h.value ->> (p ->> 'column') as word
                                      from jsonb_each(v_hold) h
                                     where coalesce(h.value ->> (p ->> 'column'), '') <> '') h) k
                     where k.n <= c_hold_max - (select count(*) from jsonb_object_keys(coalesce(p -> 'values', '{}'::jsonb))))
                  end order by ord), '[]'::jsonb)
             from jsonb_array_elements(proposals || v_made || v_props) with ordinality as e(p, ord)) end,
         mapping        = v_map,
         state          = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object(
    'import_id',      p_import_id,
    'rows_seen',      v_seen,
    'rows_written',   v_landed,
    'rows_duplicate', v_dupes,
    'rows_refused',   v_bad,
    'outcomes',       v_out,
    'proposals',      v_props,
    'columns_added',  v_made,
    -- Said out loud rather than hidden: this batch could not be written as one statement, so
    -- every row was written on its own and the refusals below name the rows that could not be.
    'one_statement',  v_fell is null,
    -- The measurement, said out loud: what the writing phase of THIS call cost a row, and how
    -- many rows that makes three seconds' worth. A caller that ignores them loses nothing.
    'write_ms',       round(v_wrote),
    'ms_per_row',     round(coalesce(v_perrow, 0), 2),
    'rows_per_call',  v_next,
    'refusals',       v_ref);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_import_finish(p_organization_id uuid, p_import_id uuid, p_unmapped text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run    custom.io_import;
  v_mode   text;
  v_p      jsonb;
  v_spec   jsonb;
  v_next   jsonb := '[]'::jsonb;
  v_filed  integer := 0;
  v_made   integer := 0;
  v_left   integer := 0;
  v_id     uuid;
  v_ask    jsonb;
  v_admin  boolean;
  -- B4-03: how many landed rows hold a value for the column being filed, and for all of them.
  v_held   integer;
  v_heldall integer := 0;
  v_cut    boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_finish');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_finish');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here to finish.' using errcode = '23503';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_finish',
                                          'editor'::public.permission_level, 'table');

  v_mode := lower(coalesce(nullif(btrim(coalesce(p_unmapped, '')), ''),
                           nullif(v_run.policy ->> 'unmapped', ''), 'propose'));
  if v_mode not in ('propose', 'create', 'ignore') then
    raise exception 'A column this table does not have is offered ("propose"), added outright ("create") or left out ("ignore"), and this asked for "%".', v_mode
      using errcode = '22023';
  end if;
  v_admin := custom.my_level(p_organization_id, v_run.table_id, 'table') = 'admin'::public.permission_level
             or custom.query_is_store_owner();
  if v_mode = 'create' and not v_admin then
    raise exception 'Adding columns to this table outright is for its admins. Your columns can still be OFFERED, and whoever admins this table decides.'
      using errcode = '42501',
            hint = 'Finish with "propose" and every new column goes to the approvals inbox instead. The rows that landed are unaffected either way.';
  end if;

  for v_p in select value from jsonb_array_elements(coalesce(v_run.proposals, '[]'::jsonb)) loop
    if coalesce(v_p ->> 'state', 'proposed') <> 'proposed' then
      v_next := v_next || jsonb_build_array(v_p);
      continue;
    end if;
    v_spec := custom.io_proposal_spec(v_p);
    if v_mode = 'ignore' then
      v_left := v_left + 1;
      v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'ignored'));
    elsif v_mode = 'create' then
      -- THE SAME DOOR A HAND-MADE COLUMN GOES THROUGH, so nothing downstream ever has to ask
      -- where a column came from. A refusal is kept ON the proposal rather than ending the
      -- finish: nineteen good columns are not lost because the twentieth collided.
      begin
        v_id := custom.field_declare(p_organization_id, v_run.table_id, v_spec);
        v_made := v_made + 1;
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'accepted', 'field_id', v_id));
      exception when others then
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'refused', 'reason', sqlerrm));
      end;
    else
      -- THE ONE INBOX. A column an import wants and a column an agent wants are the same
      -- waiting change, in the same queue, decided by the same people with the same right —
      -- and approving it runs `custom.field_declare` with THIS spec, in that transaction.
      -- B4-03 (2026-09-30): AND ITS VALUES WAIT WITH IT. An Editor pasted Client, Package,
      -- Sessions and Start into an empty table; Package, Sessions and Start went here, the rows
      -- landed with a name only, and after the admin approved all three every cell was empty —
      -- the values were never kept, and nothing said so. `custom.io_import_rows` now keeps them on
      -- the proposal (`values`), the change names them (`fill`), and approving it fills them in
      -- (`custom._io_fill_held_column`, from `custom.work_approval_decide`).
      v_held := (select count(*) from jsonb_object_keys(coalesce(v_p -> 'values', '{}'::jsonb)));
      v_cut  := coalesce((v_p ->> 'values_cut')::boolean, false);
      begin
        v_ask := custom.work_approval_request(
                   p_organization_id, v_run.table_id,
                   jsonb_build_object('kind', 'field_add', 'field', v_spec)
                   || case when v_held > 0
                           then jsonb_build_object('fill', jsonb_build_object(
                                  'import_id', p_import_id::text,
                                  'column',    v_p ->> 'column',
                                  'values',    v_held))
                           else '{}'::jsonb end,
                   format('The file "%s" has a column called "%s" that this table does not. %s%s',
                          coalesce(v_run.source_name, 'you imported'),
                          v_p ->> 'column',
                          coalesce(v_p ->> 'why', ''),
                          case when v_held > 0
                               then format(' Approving it also fills in the %s value%s the file had for it%s.',
                                           v_held, case when v_held = 1 then '' else 's' end,
                                           case when v_cut then ' (the first 20000 rows kept theirs; the rest were not kept)' else '' end)
                               else '' end),
                   null, 'person', null);
        v_filed := v_filed + 1;
        v_heldall := v_heldall + v_held;
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object(
                    'state', 'waiting', 'approval_id', v_ask ->> 'approval_id'));
      exception when others then
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'refused', 'reason', sqlerrm));
      end;
    end if;
  end loop;

  update custom.io_import
     set proposals   = v_next,
         state       = 'finished',
         finished_at = now(),
         policy      = policy || jsonb_build_object('unmapped', v_mode)
   where organization_id = p_organization_id and id = p_import_id
  returning * into v_run;

  return jsonb_build_object(
    'import_id',       p_import_id,
    'state',           'finished',
    'rows_seen',       v_run.rows_seen,
    'rows_written',    v_run.rows_written,
    'rows_duplicate',  v_run.rows_duplicate,
    'rows_refused',    v_run.rows_seen - v_run.rows_written - v_run.rows_duplicate,
    'columns_offered', v_filed,
    'columns_added',   v_made,
    'columns_ignored', v_left,
    -- The kept values stay on the run for approval; the answer names each column without them.
    'proposals',       (select coalesce(jsonb_agg(p - 'values'), '[]'::jsonb) from jsonb_array_elements(v_next) p),
    'message', format('%s row%s landed, %s were already here, %s refused.%s',
                      v_run.rows_written, case when v_run.rows_written = 1 then '' else 's' end,
                      v_run.rows_duplicate,
                      v_run.rows_seen - v_run.rows_written - v_run.rows_duplicate,
                      case when v_filed > 0 then format(' %s new column%s %s waiting in the approvals inbox%s.',
                                                        v_filed, case when v_filed = 1 then '' else 's' end,
                                                        case when v_filed = 1 then 'is' else 'are' end,
                                                        case when v_heldall > 0
                                                             then format(', and %s value%s wait with %s: approving %s fills %s into these rows',
                                                                         v_heldall, case when v_heldall = 1 then '' else 's' end,
                                                                         case when v_filed = 1 then 'it' else 'them' end,
                                                                         case when v_filed = 1 then 'it' else 'a column' end,
                                                                         case when v_heldall = 1 then 'it' else 'them' end)
                                                             else '' end)
                           when v_made > 0 then format(' %s new column%s added.', v_made,
                                                       case when v_made = 1 then '' else 's' end)
                           else '' end));
end;
$function$;

drop function if exists custom.table_add_rung(uuid, uuid);
