-- chair-step: it REPLACES the body of `custom.record_write_graph`, a live door, and a
--   replacement of a live body is outside the additive allow-list by design. Nothing is dropped,
--   no grant moves, no row of anybody's data is touched, the signature is BYTE-IDENTICAL and the
--   door's `platform.client_callable_door` row keeps its identity columns and its EXECUTE grant.
--   The `-- based-on:` line below pins the exact body this was written against. The second
--   statement UPDATES that row's `argument_rules` so the declaration still describes the door —
--   a rules blob that no longer matches the body is a door that lies about who may open it.
-- lock: custom,platform
-- lane: STORE-TXN-2
--
-- STORE-TXN-2 — A GRAPH MAY HANG ON A PARENT THAT ALREADY STANDS.
--
-- WHAT WAS MISSING, AND WHO SAID SO. Lane STORE-TXN built this door and then reported, by name,
-- the one shape it did not cover: *"the DD-131 CHILD backfill needs a door the graph door does
-- not provide — children hung on a parent that ALREADY exists, since the graph door mints its
-- own"*. `scripts/dd131_backfill_keyword_research_children.py` reads live
-- `keyword_relationship_research` parents that have been stored for months and writes the child
-- records his K2 ruling asked for — *"those that are lists … store them properly as multiple
-- records"* — which every one of those parents was stored without. On today's tables it does
-- that inside ONE `matrx_orm` transaction. On the store arm it REFUSED, per row, because the
-- only all-or-nothing door in the store minted its parent and so could not repair one. That
-- refusal was honest and it was a hole; this file closes it.
--
-- IT IS ONE DOOR, NOT A SECOND ONE. A separate `custom.record_children_write` would have been a
-- second answer to "what is a graph", with its own copy of the switch, the ladder, the op-id
-- envelope, the contiguous runs, the relation writer and the all-or-nothing refusal — five
-- places for two doors to drift. The graph is the same graph; only the parent differs, and only
-- in whether it has to be minted first.
--
-- HOW THE TWO ARE TOLD APART: `_record_id`, AN ENVELOPE KEY, NOT A FIELD. `p_parent` is still
-- one jsonb object. Carrying `_record_id` makes it a REFERENCE to the parent that already
-- stands; carrying anything else makes it the document to mint. The store already reserves the
-- leading underscore for exactly this — `_op_id`, `_actor`, `_on_behalf_of` are envelope keys
-- the doors lift off, and `custom.undeclared_keys` exempts `_`-prefixed keys from the
-- undeclared-key guard by name — so this adds a word to a vocabulary that exists rather than a
-- convention of its own. It is deliberately NOT `id`: a record's own `id` is an ORDINARY FIELD
-- of an ordinary document (repointed relations keep the legacy row's id as a field, which is why
-- `matrx_records.server.flatten` carries both), so a door that read `p_parent ->> 'id'` as a
-- reference would have silently stopped minting for every kind whose rows carry an id of their
-- own. A reference that also carries real document keys is REFUSED rather than guessed at: it
-- means the caller thinks it is doing both, and only one of them can happen.
--
-- THE SAME LADDER, ASKED ABOUT THE PARENT. Giving a record lines IS changing it, so the
-- existing-parent arm asks `custom.assert_client_may_change` at the EDITOR rung on that record —
-- the one predicate every structural door in the store asks, not a new one — and it asks it
-- BEFORE a single child is written, because a refusal afterwards is the half-write this door
-- exists to make impossible. `platform.relation_set` asks the same question again per field a
-- moment later and its answer governs; nothing here replaces or weakens it. A parent that is not
-- there, one that belongs to another organization and one that has been archived all answer with
-- ONE sqlstate and ONE sentence, so nobody can learn which record ids exist by trying them.
--
-- WHAT IS UNCHANGED: there is no second validator and no raw insert. The children still go
-- through `custom.record_write_many` in contiguous runs, their edges through
-- `platform.relation_set` (REL-10 / T7: a relation on a record IS a declared field), the
-- parent's own edges through `public.assoc_add`, and ONE refusal anywhere still refuses the
-- WHOLE graph by name with NOTHING written. There is still no actor argument (AGT-N-4).
-- The answer gains `parent`, which says `minted` or `existing`.

-- based-on: custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) ffb6ed966ef90e7ddecb249eaf048216be053184700d566bddf4c96d27f9f618

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
    raise exception 'custom.record_write_graph: names the existing parent % and nothing to hang on it', v_parent_id
      using errcode = '22004',
            hint = 'NOTHING WAS WRITTEN, and nothing was going to be. The `_record_id` arm exists to give a parent that already stands the lines it never got; a call with no children and no edges would open a transaction, take the parent''s locks and change nothing, which reads to its caller exactly like a graph that landed.';
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
      raise exception 'custom.record_write_graph: there is no live record % you may write to, so there is no parent to hang these lines on', v_parent_id
        using errcode = '42501',
              hint = 'NOTHING WAS WRITTEN. A record that is not there, one that belongs to another organization and one that has been archived all answer this way on purpose. Check the id, the organization, and whether the parent was archived — an archived parent is restored before its lines are written, never given children while it is away.';
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

comment on function custom.record_write_graph(uuid, uuid, jsonb, jsonb, jsonb) is
  'STORE-TXN: the store''s ALL-OR-NOTHING door. Writes a parent record, the edges it stands on and every row that belongs to it in ONE transaction, by calling custom.record_write_many, platform.relation_set and public.assoc_add — no second validator, no raw insert, no actor argument. STORE-TXN-2: p_parent carrying the envelope key _record_id is a REFERENCE to a parent that ALREADY stands — only the children and their edges are written, and the editor rung is asked about that record first; without it the document is minted as the parent, as before. Any single refusal refuses the whole graph by name and nothing is written.';

-- THE DECLARATION FOLLOWS THE BODY. `platform.client_callable_door` is what
-- `check:store-doors-decide` reads to say how each argument of a client door is decided, and
-- `p_parent` now has a second reading in which it NAMES AN EXISTING ROW — the one thing its old
-- rule said it could not do ("a child names no id of its own — the door mints every one — so
-- nothing here can address an existing row"). A rules blob that no longer describes the body is
-- worse than none: it is a door whose own declaration says it is safer than it is. The identity
-- columns are untouched (the signature did not move), so census 9's comparison against
-- `pg_get_function_identity_arguments` is unaffected.
update platform.client_callable_door
   set argument_rules = jsonb_set(
         argument_rules,
         '{arguments,p_parent}',
         jsonb_build_object(
           'type', 'jsonb', 'position', 3, 'optional', false, 'entity', 'custom_record',
           'check', 'TWO READINGS, TOLD APART BY THE ENVELOPE KEY _record_id. WITHOUT it this is the parent DOCUMENT to mint: it carries no identifier this door reads and none that reaches an access decision, and it is stored verbatim as one jsonb object (REC-36) through custom.record_write_many. WITH it the object is a REFERENCE to a parent that already stands (and carrying any non-underscore key beside it is refused 22023, never guessed at), and _record_id IS then an identifier reaching an access decision: this body looks the row up in custom.record under arg1 with deleted_at is null, and asks custom.assert_client_may_change(arg1, that id, editor, record) — the editor rung on that record itself — BEFORE one child is written; platform.relation_set asks the same predicate again per field afterwards and its answer governs. The keys that are never stored are the envelope: _op_id, which custom._take_op_id lifts off, and _record_id, which never reaches a write at all. On the reference arm the op id is read off the first child instead and copied onto every child, because one graph is one client operation.',
           'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
           'null_rule', jsonb_build_object('sqlstate', '22004'),
           'verified', '2026-09-22 lane STORE-TXN-2 — read from this body: the lookup, the assert, its argument position, and that both precede every write',
           'entity_reason', 'On the _record_id reading it is a custom.record id — the parent these lines belong to. A record that is not in this organization, one that was archived and one that never existed answer with the SAME sqlstate 42501 and the same sentence as a row the caller may not write, so an id named here can neither reach nor reveal anything the caller could not already reach.'))
 where schema_name = 'custom'
   and function_name = 'record_write_graph';
