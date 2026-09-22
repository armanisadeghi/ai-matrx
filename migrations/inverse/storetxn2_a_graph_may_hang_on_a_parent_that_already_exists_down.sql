-- chair-step: the inverse of
--   `migrations/campaign/storetxn2_a_graph_may_hang_on_a_parent_that_already_exists.sql`, for
--   rule 27 (up -> inverse -> up) ON THE CLONE. It REPLACES the body of
--   `custom.record_write_graph`, which is outside the additive allow-list; it is never run on the
--   main database.
-- lock: custom,platform
--
-- It puts back the body BYTE FOR BYTE from
-- `migrations/campaign/storetxn_the_graphs_children_are_a_declared_relation.sql` — the one that
-- mints its parent always and has no existing-parent arm — and puts the `p_parent` rule in
-- `platform.client_callable_door` back to the sentence that described it. A `drop function` would
-- NOT be the inverse: the forward file is a REPLACE and declares the body it is based on, so leg
-- 3 of rule 27 has to find that exact body live.
--
-- based-on: custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) 96894e437c3fc81feb5b2ed02eef182444235d363139873d20887db8b752d6df

create or replace function custom.record_write_graph(p_organization_id uuid,
                                                     p_table_id uuid,
                                                     p_parent jsonb,
                                                     p_edges jsonb default '[]'::jsonb,
                                                     p_children jsonb default '[]'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog'
as $function$
declare
  v_parent_id  uuid := gen_random_uuid();
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
  v_where      text := 'the parent record';
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
  if p_parent is null or jsonb_typeof(p_parent) <> 'object' then
    raise exception 'custom.record_write_graph: a graph is a PARENT and everything that belongs to it, and no parent document was handed in (got %)', coalesce(jsonb_typeof(p_parent), 'null')
      using errcode = '22004',
            hint = 'NOTHING WAS WRITTEN. Hand the parent in as one jsonb object, exactly as custom.record_write takes it.';
  end if;
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

  -- THE SWITCH, THEN THE ORGANIZATION, THEN THE TABLE — the same two predicates
  -- `custom.record_write` asks and `custom.record_write_many` asks once for a batch, asked ONCE
  -- here for the whole graph. They are asked BY THIS BODY and not only by the door it calls,
  -- because they are questions about the caller, the organization and the Table, none of which
  -- can change between the parent and child nineteen — and because a door that only ever
  -- decided inside something it calls is a door whose own text says nothing about who may open
  -- it. `custom.record_write_many` asks them again per statement; that is the same two reads,
  -- and the second answer is the one that governs, so nothing here weakens or replaces it.
  perform custom.assert_store_door(p_organization_id, 'custom.record_write_graph');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.record_write_graph',
                                          'editor'::public.permission_level, 'table');

  -- ONE GRAPH IS ONE CLIENT OPERATION, so the parent's op id is the whole graph's op id. Read
  -- here and NOT removed: `custom.record_write_many` lifts it off through `custom._take_op_id`,
  -- which is the one place the envelope key is validated and the one place it is stripped.
  v_op_id := case when p_parent ? '_op_id' then p_parent ->> '_op_id' else null end;

  begin
    -- ── THE PARENT ────────────────────────────────────────────────────────────────────────
    -- Through the batch door with a batch of one and an id handed in, so the parent's id is
    -- known before its edges are written and every predicate, guard and trigger is the one
    -- `custom.record_write` would have run.
    perform custom.record_write_many(p_organization_id, p_table_id,
                                     array[p_parent]::jsonb[], array[v_parent_id]::uuid[]);

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
        v_this_table := coalesce(nullif(v_item ->> 'table_id', '')::uuid, p_table_id);
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
    'table_id',   p_table_id::text,
    'child_ids',  to_jsonb(v_child_ids::text[]),
    'edge_ids',   to_jsonb(v_edge_ids::text[]),
    'children',   coalesce(cardinality(v_child_ids), 0),
    'edges',      coalesce(cardinality(v_edge_ids), 0) + v_relations,
    'relations',  v_relations,
    'how',        'one parent, its edges and its children through custom.record_write_many and public.assoc_add in ONE transaction — the same doors, every guard, all or nothing.');
end
$function$;

comment on function custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) is
  'STORE-TXN: the store''s ALL-OR-NOTHING door. Writes a parent record, the edges it stands on and every row that belongs to it in ONE transaction, by calling custom.record_write_many and public.assoc_add — no second validator, no raw insert, no actor argument. Any single refusal refuses the whole graph by name and nothing is written.';

update platform.client_callable_door
   set argument_rules = jsonb_set(
         argument_rules,
         '{arguments,p_parent}',
         jsonb_build_object(
           'type', 'jsonb', 'position', 3, 'optional', false,
           'check', 'the parent document itself; it carries no identifier this door reads and none that reaches an access decision. It is stored verbatim as one jsonb object (REC-36) through custom.record_write_many. The one key that is not stored is _op_id, which custom._take_op_id lifts off and which this door also copies onto every child, because one graph is one client operation.',
           'null_rule', jsonb_build_object('sqlstate', '22004')))
 where schema_name = 'custom'
   and function_name = 'record_write_graph';
