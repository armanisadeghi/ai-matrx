-- additive: yes
--
-- chair-step: it GRANTS EXECUTE on a new client door to `authenticated`, and a GRANT is outside
--   the additive allow-list by design — the OFF switch's boundary IS the absence of new client
--   grants. The door it opens is `custom.record_write_graph`, a brand-new function that replaces
--   nothing, declared in `platform.client_callable_door` BEFORE the grant so `platform._ddl_guard`
--   lets the grant stand. It also registers ONE new pair in `platform.association_types`
--   (`message -> record`, non-conveying), which is a registry row, not a change to anybody's
--   data. Nothing is dropped, no live function body is replaced, and the inverse is
--   `migrations/inverse/storetxn_a_record_graph_is_one_transaction_down.sql`.
--
-- STORE-TXN — A PARENT, ITS PROVENANCE EDGE AND ITS CHILDREN ARE ONE TRANSACTION.
--
-- WHY THIS EXISTS. Six `aidream` paths REFUSED the store arm rather than write on it
-- (`aidream/services/kind_records/routed.py`, CUT-N-13-TAIL): the chat kind-emission store,
-- its owned-child fan-out, the two DD-131 amnesty backfills, the D183 keep-the-work proof and
-- the kind-consumer census. Every one of them writes a PARENT record, the edge that says where
-- it came from, and every child row the parent promised, inside ONE `matrx_orm` transaction —
-- precisely so a parent can never stand without the lines it promised. The store's write door
-- (`custom.record_write` / `custom.record_write_many`) opens its own RLS session on its own
-- connection per call, so emitting through a LOOP of those doors would trade that
-- all-or-nothing promise for a half-write. The refusal was the honest answer while the door
-- did not exist. This is the door.
--
-- IT IS NOT A SECOND WRITE PATH AND IT IS NOT A SECOND VALIDATOR. The parent and the children
-- are written by CALLING `custom.record_write_many` — the same body, so the same
-- `custom.assert_store_door`, the same `custom.assert_client_may_change` at the editor rung,
-- the same `_op_id` envelope through `custom._take_op_id`, and every trigger on `custom.record`:
-- the undeclared-key guard, the value envelope, the actor stamp, the field write door, the
-- history capture, the realtime outbox notice. The edges are written by CALLING
-- `public.assoc_add` — the one association writer, which decides access at BOTH endpoints and
-- revives a tombstone rather than duplicating an edge. There is not one raw `insert` in this
-- body. What this door adds is exactly one thing: they all happen in ONE statement, so they are
-- ONE transaction, so a single refusal anywhere takes the whole graph down by name and NOTHING
-- is written.
--
-- THERE IS NO ACTOR ARGUMENT, DELIBERATELY (AGT-N-4). Every other door in this family resolves
-- the operating person from the session (`auth.uid()`), and the actor tier and system arrive as
-- transaction-local GUCs that `matrx_records.principal.declaring` lands at the top-level BEGIN.
-- A `p_actor` argument would be a principal a caller could forge, and it would be the only one
-- in the store. The seat is the session; it is not a parameter.
--
-- THE SHAPES.
--   p_parent    the parent document, exactly as `custom.record_write` takes it. `_op_id` may
--               ride it and is lifted off by the same envelope reader; it is then handed to
--               every child of the graph too, because one graph is ONE client operation and
--               one operation announces itself once.
--   p_edges     a JSON array of the edges the parent stands on. Each is
--               {"entity": <entity token>, "id": <uuid>, "direction": "in"|"out",
--                "label": ?, "role": ?, "position": ?, "metadata": ?}.
--               "in" (the default) means the OTHER thing is the source and the new parent is
--               the target — which is what provenance is: the message PRODUCED the record.
--   p_children  a JSON array of the rows that belong to the parent. Each is
--               {"data": {...}, "table_id": ?, "role": ?, "position": ?, "label": ?}.
--               `role` is the parent FIELD the child fills and `position` its index in that
--               field's list, because the identity of a child slot is (parent, field, position)
--               and never (parent, position) — DD-178. Each child gets its edge to the parent
--               through the same one association writer.
--
-- CONTIGUOUS RUNS, NOT A LOOP PER ROW. Children that name the same Table in a row are written
-- by ONE `custom.record_write_many` call, so the ordinary case (one parent, N children of one
-- kind) is two statements against `custom.record`, not N+1. The ids are minted here and handed
-- in, so every id comes back tied to the child it belongs to.

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

      -- EVERY CHILD'S EDGE TO ITS PARENT, through the same one writer, carrying the FIELD in
      -- `role` and the index in `position` (DD-178): a parent that declares two array fields of
      -- the same child shape gives both of them positions 0, 1, 2 …, so position alone was never
      -- an identity.
      for v_ord in 1..v_n loop
        v_item := v_children[v_ord];
        v_where := format('the edge of child %s of %s to its parent', v_ord, v_n);
        v_edge_id := public.assoc_add(
          p_source_type => 'record',
          p_source_id   => v_child_ids[v_ord],
          p_target_type => 'record',
          p_target_id   => v_parent_id,
          p_org_id      => p_organization_id,
          p_label       => coalesce(nullif(v_item ->> 'label', ''), 'part_of'),
          p_metadata    => coalesce(v_item -> 'metadata', '{}'::jsonb),
          p_role        => nullif(v_item ->> 'role', ''),
          p_position    => nullif(v_item ->> 'position', '')::integer);
        v_edge_ids := v_edge_ids || v_edge_id;
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
    'edges',      coalesce(cardinality(v_edge_ids), 0),
    'how',        'one parent, its edges and its children through custom.record_write_many and public.assoc_add in ONE transaction — the same doors, every guard, all or nothing.');
end
$function$;

comment on function custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) is
  'STORE-TXN: the store''s ALL-OR-NOTHING door. Writes a parent record, the edges it stands on and every row that belongs to it in ONE transaction, by calling custom.record_write_many and public.assoc_add — no second validator, no raw insert, no actor argument. Any single refusal refuses the whole graph by name and nothing is written.';

-- The provenance pair the chat kind-emission path stands on, on the store arm: a `message`
-- PRODUCED a `record`. `message -> content_ir_kind_instance` has been registered since the
-- legacy path was built; this is the same edge pointing at where those rows now live. Non
-- conveying, exactly like its legacy twin — provenance says where something came from, it does
-- not hand anybody access.
insert into platform.association_types (source_type, target_type, container_side, conveys_max, is_active, notes)
values ('message', 'record', 'none', 'editor'::public.permission_level, true,
        'STORE-TXN: provenance on the store arm. The message a record was produced by, written through custom.record_write_graph. The legacy twin is message -> content_ir_kind_instance.')
on conflict (source_type, target_type) do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   anonymous_callers, signed_in_callers, identity_argtypes, argument_rules)
-- THE TWO IDENTITY COLUMNS ARE READ OFF THE LIVE FUNCTION, never typed by hand: census 9 of
-- `check:store-doors-decide` compares `identity_args` to `pg_get_function_identity_arguments`
-- exactly, and every "is this a declared door" join keys on
-- `platform.door_argtypes(p.proargtypes)`. A hand-typed spelling that renders differently under
-- a shifted search_path is a door that silently stops being declared.
select
  'custom', 'record_write_graph',
   pg_get_function_identity_arguments(p.oid),
   'STORE-TXN',
   'STORE-TXN: the all-or-nothing create door. A parent record, the edges it stands on and every row that belongs to it, in ONE transaction. It is not a second write path: the parent and the children are written by CALLING custom.record_write_many, so the store is switched per organization by custom/system_enabled through custom.assert_store_door, membership and the editor rung on the Table are decided by custom.assert_client_may_change for auth.uid() before anything is admitted to exist, custom._take_op_id lifts the envelope, and every trigger on custom.record — the undeclared-key guard, the value envelope, the actor stamp, the field write door, the history capture and the realtime outbox notice — runs exactly as it does for a single write. The edges are written by CALLING public.assoc_add, which decides access at BOTH endpoints. There is no raw insert in the body and no actor argument (AGT-N-4): the operating person is auth.uid() and the actor tier and system arrive as transaction-local GUCs. One refused member refuses the whole graph by name and NOTHING is written.',
   false, true,
   platform.door_argtypes(p.proargtypes),
   jsonb_build_object(
     'version', 1,
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false, 'entity', 'organization',
         'check', 'this body decides it with custom.assert_store_door(arg1) and custom.assert_client_may_change(arg1) — both reached through custom.record_write_many, which is called before any row of the graph is admitted to exist, and before every other use of this argument in the body. A non-member is refused 42501 and the whole graph is refused with it.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'null_rule', jsonb_build_object('sqlstate', '22004'),
         'verified', '2026-09-22 lane STORE-TXN — read from this body: the door call, its argument position, and that it precedes every write',
         'entity_reason', 'It is an organization id. This door makes no access decision with it of its own: it hands it to custom.record_write_many, whose predicates are custom.record_write''s, and to public.assoc_add, which uses it only as a fallback for an endpoint type with no organization column and re-checks iam.has_org_access when it does. The value is written verbatim as the partition key of every row in the graph.'),
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'optional', false, 'entity', 'custom_record',
         'check', 'this body decides it with custom.assert_client_may_change(arg2) through custom.record_write_many — the record ladder at the editor rung, decided before the parent is admitted to exist, and before every other use of this argument in the body. It is also the default Table of every child that names none, and each such child is put through the same call.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'null_rule', jsonb_build_object('means', 'a kernel record that belongs to no custom Table'),
         'verified', '2026-09-22 lane STORE-TXN — read from this body',
         'entity_reason', 'The custom Table the parent belongs to. Access to the rows is decided by organization_id and the canonical entity policies on custom.record; the Table is what the editor rung is asked about, through custom.assert_client_may_change, exactly as custom.record_write asks it.'),
       'p_parent', jsonb_build_object(
         'type', 'jsonb', 'position', 3, 'optional', false,
         'check', 'the parent document itself; it carries no identifier this door reads and none that reaches an access decision. It is stored verbatim as one jsonb object (REC-36) through custom.record_write_many. The one key that is not stored is _op_id, which custom._take_op_id lifts off and which this door also copies onto every child, because one graph is one client operation.',
         'null_rule', jsonb_build_object('sqlstate', '22004')),
       'p_edges', jsonb_build_object(
         'type', 'jsonb', 'position', 4, 'optional', true,
         'check', 'the edges the parent stands on, each naming the OTHER endpoint by entity token and id. Every one is written through public.assoc_add, which asks iam.has_access at BOTH endpoints — editor on both for an access-conveying pair, editor on one and viewer on the other otherwise — so an id named here decides nothing and reaches nothing the caller could not already reach. An id that names a row the caller may not see is refused 42501 exactly as an invented one is.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'null_rule', jsonb_build_object('default', '[]')),
       'p_children', jsonb_build_object(
         'type', 'jsonb', 'position', 5, 'optional', true,
         'check', 'the rows that belong to the parent. Each child''s document is stored verbatim through custom.record_write_many under the Table it names or the Table in position 2, so the editor rung is asked about that Table by the same call that asks it for the parent; each child''s edge to the parent goes through public.assoc_add. A child names no id of its own — the door mints every one — so nothing here can address an existing row.',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'null_rule', jsonb_build_object('default', '[]'))))
from pg_proc p
where p.oid = 'custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb)'::regprocedure
on conflict do nothing;

-- THE DOOR IS DECLARED FIRST AND THE GRANT COMES AFTER IT: `platform._ddl_guard` takes a client
-- EXECUTE grant back from a SECURITY DEFINER function in a closed schema that has no row in
-- `platform.client_callable_door`.
grant execute on function custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
