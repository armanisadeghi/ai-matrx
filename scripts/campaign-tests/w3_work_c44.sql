-- W3-WORK — CHECK C-44, THE WORK LAYER, PROVEN. REC-69 · REC-70 · REC-71.
--
-- RUN IT:
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "$SUPABASE_BRANCH_DATABASE_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/w3_work_c44.sql
--
-- IT IS NOT A MIGRATION: it lives outside `migrations/`, no sweep can see it, and it ROLLS
-- BACK. It refuses to run anywhere but the rehearsal branch, by system identifier.
--
-- ITS RED TWIN is `scripts/campaign-tests/w3_work_red.sql`, which turns this lane's
-- enforcement points off inside one rolled-back transaction and watches every refusal below
-- disappear. The two clauses that CANNOT live in a rolled-back transaction — REC-71's two
-- REAL concurrent sessions and REC-70's mid-graph rollback counted in autocommit — live in
-- `scripts/campaign-tests/w3_work_parallel.sh`, which commits and then deletes its fixture.
--
-- WHAT MAKES IT FAIL — THE CHANGE, NAMED (rule 3): take `next` out of
-- `custom.work_states()` and PART 1's forbidden move lands; let
-- `custom.work_template_refusal` accept `referenced` and PART 2's refusal disappears while an
-- owned edge is written in its place; drop the `unique` from the slot Field in
-- `custom.work_slots_declare` and PART 3's second hold commits; take the
-- `custom.assert_store_door` call out of `custom._work_shape_guard` and PART 4's probe role
-- writes a hold into a switched-off store.

\set ON_ERROR_STOP on
\timing off

begin;

do $t$
declare
  v_org     constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';  -- Matrx System
  v_table   uuid;
  v_take    jsonb;
  v_again   jsonb;
  v_states  uuid;
  v_person  uuid;
  v_rec     uuid;
  v_rec2    uuid;
  v_ns      uuid;
  v_ip      uuid;
  v_done    uuid;
  v_row     record;
  v_turn    integer;
  v_tpl     uuid;
  v_inst    jsonb;
  v_ids     uuid[];
  v_log     jsonb;
  v_slots   jsonb;
  v_stable  uuid;
  v_idx     text;
  v_hold    jsonb;
  v_h2      jsonb;
  v_msg     text;
  v_n       bigint;
  v_doors   text[];
  v_fn      record;
begin
  if (pg_control_system()).system_identifier <> 7678069749886157684 then
    raise exception 'w3_work_c44.sql refuses to run here: system_identifier is %, and this file may only run on the rehearsal branch (7678069749886157684)',
                    (pg_control_system()).system_identifier;
  end if;

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 1 — REC-69. THE ASSIGNMENT FIELDS, AND "WHOSE TURN IS IT" AS ONE QUERY.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_table := custom.table_declare(v_org, jsonb_build_object(
    'name','ZZ W3 Work C44','slug','zz_w3_work_c44','type','entity',
    'label_singular','Task','label_plural','Tasks','title_field','title',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','title')),
    'parent_id','11111111-0000-4000-8000-000000000001'));

  if custom.work_has_assignment(v_org, v_table) then
    raise exception 'PART 1 — a Table that has taken nothing reports that it holds the assignment fields';
  end if;

  v_take   := custom.work_take_assignment(v_org, v_table);
  v_states := (v_take ->> 'state_table_id')::uuid;
  if (v_take ->> 'fields_created')::int <> 3 or (v_take ->> 'states_created')::int <> 5 then
    raise exception 'PART 1 — taking the kernel fields created % field(s) and % state(s), and it is three and five',
                    v_take ->> 'fields_created', v_take ->> 'states_created';
  end if;
  if not custom.work_has_assignment(v_org, v_table) then
    raise exception 'PART 1 — the fields were created and the Table does not report holding them';
  end if;
  raise notice 'PART 1 —   take: % field(s), % state(s), declared on the Table as %',
               v_take ->> 'fields_created', v_take ->> 'states_created', v_take -> 'declared_on_table';

  -- IDEMPOTENT, and it is a positive control for the count above rather than an absence:
  -- the second take reports `taken: false` AND writes zero of both.
  v_again := custom.work_take_assignment(v_org, v_table);
  if (v_again ->> 'taken')::boolean
     or (v_again ->> 'fields_created')::int <> 0 or (v_again ->> 'states_created')::int <> 0 then
    raise exception 'PART 1 — taking twice wrote something: %', v_again;
  end if;
  raise notice 'PART 1 —   taking twice: taken=%, fields_created=%, states_created=%',
               v_again ->> 'taken', v_again ->> 'fields_created', v_again ->> 'states_created';

  -- THE THREE FIELDS ARE ORDINARY FIELDS. Read back through the store's own definitions view,
  -- not through this lane's declaration, so a Field the store would not accept cannot pass.
  select count(*) into v_n
    from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and nullif(f.data ->> 'entity_definition_id','')::uuid = v_table
     and f.data ->> 'key' in ('assignee','due_date','status')
     and coalesce((f.data ->> 'promoted')::boolean,false);
  if v_n <> 3 then
    raise exception 'PART 1 — % of the three assignment Fields are in the store as promoted Fields', v_n;
  end if;
  for v_fn in select p.field_key, p.parity_type, p.is_unique, p.indexable, p.index_name
                from custom.promoted_fields(v_org, v_table) p loop
    raise notice 'PART 1 —   promoted Field % is a %, indexable=%, index %',
                 v_fn.field_key, v_fn.parity_type, v_fn.indexable, v_fn.index_name;
  end loop;

  select id into v_ns   from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Not started';
  select id into v_ip   from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='In progress';
  select id into v_done from custom.record where organization_id=v_org and table_id=v_states and data->>'name'='Done';

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, custom.person_kernel_id(), 'record', jsonb_build_object('name','Dana Ops'))
  returning id into v_person;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object(
    'title','Send the quote', 'assignee', v_person::text,
    'due_date','2026-09-10', 'status', v_ns::text))
  returning id into v_rec;

  -- AN UNASSIGNED ONE AND A FINISHED ONE, so the one query is answering about a real mix
  -- rather than about a single row that could be right by accident.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('title','Nobody has this yet','status', v_ns::text))
  returning id into v_rec2;
  insert into custom.record (organization_id, table_id, data_class, data)
  values (v_org, v_table, 'record', jsonb_build_object('title','Already shipped','assignee',v_person::text,'status', v_done::text));

  v_turn := 0;
  for v_row in select * from custom.work_whose_turn(v_org, v_table) loop
    v_turn := v_turn + 1;
    raise notice 'PART 1 —   WHOSE TURN: "%" -> % (%, status %)', v_row.title, v_row.turn, v_row.state, v_row.status;
  end loop;
  if v_turn <> 2 then
    raise exception 'PART 1 — "whose turn is it" returned % open row(s) and two are open', v_turn;
  end if;
  select count(*) into v_n from custom.work_whose_turn(v_org, v_table, true);
  if v_n <> 3 then
    raise exception 'PART 1 — including the finished record the one query returned %, and it is three', v_n;
  end if;
  if (select turn from custom.work_whose_turn(v_org, v_table) where title = 'Send the quote') <> 'Dana Ops'
     or (select state from custom.work_whose_turn(v_org, v_table) where title = 'Send the quote') <> 'overdue'
     or (select turn from custom.work_whose_turn(v_org, v_table) where title = 'Nobody has this yet') <> 'unassigned'
     or (select turn from custom.work_whose_turn(v_org, v_table, true) where title = 'Already shipped') <> 'nobody' then
    raise exception 'PART 1 — the one query named the wrong person, or the wrong state, for at least one row';
  end if;

  -- THE ACTION STATES. An allowed move lands; the one the model forbids is refused, naming
  -- both states and where the record CAN go. The allowed move is the positive control.
  update custom.record set data = data || jsonb_build_object('status', v_ip::text)
   where organization_id = v_org and id = v_rec;
  if (select data ->> 'status' from custom.record where organization_id=v_org and id=v_rec) <> v_ip::text then
    raise exception 'PART 1 — an allowed move did not land';
  end if;
  raise notice 'PART 1 —   allowed move: Not started -> In progress landed.';

  -- THE FORBIDDEN MOVE is taken on the record still sitting at Not started, from which the
  -- model allows In progress and Cancelled and nothing else. (Moving the first record BACK to
  -- Not started is forbidden too, and the model said so when this proof first tried it:
  -- "In progress cannot go straight to Not started" - which is the guard working.)
  begin
    update custom.record set data = data || jsonb_build_object('status', v_done::text)
     where organization_id = v_org and id = v_rec2;
    raise exception 'PART 1 — a state the model forbids was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Not started%' or v_msg not like '%Done%' then
      raise exception 'PART 1 — the forbidden move was refused, but not by name. It read: %', v_msg;
    end if;
    raise notice 'PART 1 —   forbidden move REFUSED: %', v_msg;
  end;

  -- AND A STATE THAT IS NOT A STATE AT ALL is refused by the store's own option-membership
  -- check, which is what makes the workflow a Table rather than an enum.
  begin
    update custom.record set data = data || jsonb_build_object('status', gen_random_uuid()::text)
     where organization_id = v_org and id = v_rec2;
    raise exception 'PART 1 — a status that is not one of this table''s choices was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 1 —   a status off the list REFUSED: %', v_msg;
  end;
  raise notice 'PART 1 PASS — REC-69: the three kernel Fields are ordinary Fields, taking them twice writes nothing, and one query answers whose turn it is.';
  raise notice '';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 2 — REC-70. ONE ATOMIC, LOGGED ACT.
  -- ════════════════════════════════════════════════════════════════════════════════════
  v_tpl := custom.work_template_declare(v_org, 'Client onboarding', jsonb_build_object(
    'nodes', jsonb_build_array(
      jsonb_build_object('ref','project','table',v_table::text,'data',jsonb_build_object('title','Onboard Acme')),
      jsonb_build_object('ref','kickoff','table',v_table::text,'data',jsonb_build_object('title','Kick-off call')),
      jsonb_build_object('ref','access', 'table',v_table::text,'data',jsonb_build_object('title','Grant access'))),
    'relations', jsonb_build_array(
      jsonb_build_object('kind','owned','from','project','to','kickoff'),
      jsonb_build_object('kind','owned','from','project','to','access'))));

  v_inst := custom.work_template_instantiate(v_org, v_tpl);
  if (v_inst ->> 'records_created')::int <> 3 or (v_inst ->> 'relations_created')::int <> 2 then
    raise exception 'PART 2 — the instantiation made % record(s) and % relation(s), and the template says three and two',
                    v_inst ->> 'records_created', v_inst ->> 'relations_created';
  end if;
  raise notice 'PART 2 —   instantiated: % records, % relations, log row %',
               v_inst ->> 'records_created', v_inst ->> 'relations_created', v_inst ->> 'instantiation_id';

  -- THE IDS DIFFER FROM THE TEMPLATE'S AND THE SHAPE MATCHES (C-44's own words), and the
  -- shape is a COMPARISON of two documents rather than an eyeball.
  select array_agg(x::uuid) into v_ids from jsonb_array_elements_text(v_inst -> 'records') x;
  if v_tpl = any (v_ids) then
    raise exception 'PART 2 — the instance carries the template''s own id';
  end if;
  if custom.work_template_shape(v_org, v_tpl)
     is distinct from custom.work_instantiation_shape(v_org, (v_inst ->> 'instantiation_id')::uuid) then
    raise exception 'PART 2 — the instance''s shape is not the template''s. template % / instance %',
                    custom.work_template_shape(v_org, v_tpl),
                    custom.work_instantiation_shape(v_org, (v_inst ->> 'instantiation_id')::uuid);
  end if;
  raise notice 'PART 2 —   shape matches, ids differ: %', custom.work_template_shape(v_org, v_tpl);

  -- THE RELATIONS ARE REAL CONTAINMENT, read back from the store rather than from the report.
  select count(*) into v_n
    from custom.record r
   where r.organization_id = v_org
     and custom.containment_parent(r.data) = (v_inst -> 'refs' ->> 'project')::uuid;
  if v_n <> 2 then
    raise exception 'PART 2 — % record(s) ended up inside the project, and the template puts two there', v_n;
  end if;
  select count(*) into v_n
    from custom.record r
   where r.organization_id = v_org and r.data_class = 'relation'
     and r.id = any (select x::uuid from jsonb_array_elements_text(v_inst -> 'relations') x)
     and r.data ->> 'kind' = 'owned' and (r.data ->> 'carrying')::boolean;
  if v_n <> 2 then
    raise exception 'PART 2 — % carrying relation row(s) exist, and the template declares two', v_n;
  end if;

  -- THE LOG. It names the template, the actor, the moment and both id arrays.
  select data into v_log from custom.record
   where organization_id = v_org and id = (v_inst ->> 'instantiation_id')::uuid
     and data_class = 'work_instantiation';
  if v_log is null or (v_log ->> 'template_id')::uuid <> v_tpl
     or jsonb_array_length(v_log -> 'records') <> 3
     or jsonb_array_length(v_log -> 'relations') <> 2
     or nullif(v_log ->> 'actor','') is null or nullif(v_log ->> 'at','') is null then
    raise exception 'PART 2 — the logged act does not say what it did: %', v_log;
  end if;
  raise notice 'PART 2 —   logged: template "%", actor %, at %, % records, % relations',
               v_log ->> 'template', v_log ->> 'actor', v_log ->> 'at',
               jsonb_array_length(v_log -> 'records'), jsonb_array_length(v_log -> 'relations');

  -- WHAT W1-REL HAS NOT BUILT IS REFUSED BY NAME rather than written as an owned edge.
  begin
    perform custom.work_template_declare(v_org, 'ZZ referenced', jsonb_build_object(
      'nodes', jsonb_build_array(jsonb_build_object('ref','a','table',v_table::text),
                                 jsonb_build_object('ref','b','table',v_table::text)),
      'relations', jsonb_build_array(jsonb_build_object('kind','referenced','from','a','to','b'))));
    raise exception 'PART 2 — a relation kind this store has no verb for was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%W1-REL%' then
      raise exception 'PART 2 — the referenced relation was refused without naming who owns it: %', v_msg;
    end if;
    raise notice 'PART 2 —   referenced relation REFUSED: %', v_msg;
  end;

  -- A GRAPH THAT FAILS PART-WAY. The third node is missing a Field the Table requires, so the
  -- store refuses it after two records already exist inside this statement. Counted here in a
  -- SUBTRANSACTION, which is the weaker half of the proof and says so: the real one is
  -- `w3_work_parallel.sh`, which runs the same template in AUTOCOMMIT and counts the rows
  -- from a session that never saw the failed statement.
  update custom.record set data = data || jsonb_build_object('required', true)
   where organization_id = v_org and table_id = custom.field_kernel_id()
     and nullif(data ->> 'entity_definition_id','')::uuid = v_table and data ->> 'key' = 'status';
  select count(*) into v_n from custom.record where organization_id = v_org and table_id = v_table;
  declare v_before bigint := v_n;
  begin
    begin
      perform custom.work_template_instantiate(v_org, custom.work_template_declare(v_org, 'ZZ half', jsonb_build_object(
        'nodes', jsonb_build_array(
          jsonb_build_object('ref','a','table',v_table::text,'data',jsonb_build_object('title','A','status',v_ns::text)),
          jsonb_build_object('ref','b','table',v_table::text,'data',jsonb_build_object('title','B','status',v_ns::text)),
          jsonb_build_object('ref','c','table',v_table::text,'data',jsonb_build_object('title','C'))),
        'relations', jsonb_build_array(jsonb_build_object('kind','owned','from','a','to','b')))));
      raise exception 'PART 2 — a graph whose third record is illegal was instantiated anyway';
    exception when check_violation then
      get stacked diagnostics v_msg = message_text;
      raise notice 'PART 2 —   mid-graph refusal: %', v_msg;
    end;
    select count(*) into v_n from custom.record where organization_id = v_org and table_id = v_table;
    if v_n <> v_before then
      raise exception 'PART 2 — the failed graph left % row(s) behind (% before, % after)',
                      v_n - v_before, v_before, v_n;
    end if;
    raise notice 'PART 2 —   rows in the Table before the failed graph: %, after: % - zero survived.', v_before, v_n;
  end;
  raise notice 'PART 2 PASS — REC-70: one statement makes the whole graph, its relations and its log, and a failure part-way leaves nothing.';
  raise notice '';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 3 — REC-71. THE SLOT HOLD, ITS EXPIRY, AND THE INDEX THAT DECIDES.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- The guard is OFF on the branch, as every campaign guard is. Promotion is switched off
  -- with it, so slots cannot be declared - which is itself the first proof.
  begin
    perform custom.work_slots_declare(v_org, 'ZZ Rooms', 'zz_w3_work_c44_slots');
    raise exception 'PART 3 — slots were declared while the index guard was off';
  exception when feature_not_supported then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 3 —   with custom/field_index_guard off, declaring slots is REFUSED: %', v_msg;
  end;

  update platform.feature_knob set value = 'true'::jsonb
   where feature = 'custom' and key = 'field_index_guard';

  v_slots  := custom.work_slots_declare(v_org, 'ZZ Rooms', 'zz_w3_work_c44_slots');
  v_stable := (v_slots ->> 'table_id')::uuid;
  v_idx    := v_slots ->> 'index_name';
  if not (v_slots ->> 'unique')::boolean then
    raise exception 'PART 3 — the slot key was promoted without UNIQUE, so nothing decides a double-booking';
  end if;
  if v_idx is distinct from custom.work_slot_index_name(v_stable) then
    raise exception 'PART 3 — the name a caller can read ahead of time (%) is not the index that was built (%)',
                    custom.work_slot_index_name(v_stable), v_idx;
  end if;
  raise notice 'PART 3 —   slot table %, decided by %', v_stable, v_idx;

  v_hold := custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'alice', interval '10 minutes');
  raise notice 'PART 3 —   hold taken: % until %', v_hold ->> 'holder', v_hold ->> 'expires_at';

  begin
    perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'bob', interval '10 minutes');
    raise exception 'PART 3 — two holds on one slot both succeeded';
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
    if position(v_idx in v_msg) = 0 then
      raise exception 'PART 3 — the second hold was refused, but not by the index''s own name. It read: %', v_msg;
    end if;
    raise notice 'PART 3 —   second hold REFUSED: %', v_msg;
  end;

  -- A DIFFERENT SLOT IS THE POSITIVE CONTROL: the index refuses a collision, not a booking.
  perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T10:00', 'bob', interval '10 minutes');
  select count(*) into v_n from custom.work_slot_holds(v_org, v_stable);
  if v_n <> 2 then
    raise exception 'PART 3 — % hold(s) are live and two slots were booked', v_n;
  end if;
  raise notice 'PART 3 —   a different slot booked fine: % live hold(s).', v_n;

  -- THE EXPIRY FREES THE SLOT. The hold is aged past its own expiry and the same slot is
  -- taken again by somebody else - through the verb, so the sweep is the one that runs.
  update custom.record
     set data = data || jsonb_build_object('expires_at',
                 to_char((now() - interval '1 minute') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
   where organization_id = v_org and id = (v_hold ->> 'hold_id')::uuid;
  v_h2 := custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'carol', interval '10 minutes');
  if (v_h2 ->> 'expired_swept')::int < 1 then
    raise exception 'PART 3 — the slot was retaken without any expired hold being let go: %', v_h2;
  end if;
  if (select holder from custom.work_slot_holds(v_org, v_stable) where slot_key = '2026-10-01T09:00') <> 'carol' then
    raise exception 'PART 3 — the expired slot was retaken and the store still says somebody else holds it';
  end if;
  raise notice 'PART 3 —   after expiry the same slot was retaken by % (% expired hold swept).',
               v_h2 ->> 'holder', v_h2 ->> 'expired_swept';

  -- A HOLD WITH NO EXPIRY, AND ONE THAT HAS ALREADY RUN OUT, both refused - the two shapes
  -- that would turn a reservation into a permanent claim.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_stable, 'record', jsonb_build_object('slot_key','2026-10-01T11:00','holder','mallory'));
    raise exception 'PART 3 — a hold with no expiry was accepted';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 3 —   hold with no expiry REFUSED: %', v_msg;
  end;
  begin
    perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T12:00', 'mallory', interval '-1 minute');
    raise exception 'PART 3 — a hold that had already expired was accepted';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 3 —   hold already expired REFUSED by the verb: %', v_msg;
  end;
  -- AND THE SAME SHAPE STRAIGHT INTO THE TABLE, past the verb, because a rule enforced only
  -- inside `custom.work_slot_hold` is a safe path beside an unsafe one. This is the refusal
  -- that belongs to this lane's trigger and to nothing else: `custom.validate_values` accepts
  -- any parseable date, so a hold dated in the past reaches the store and only
  -- `zz_w3_work_shape_guard` turns it away.
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_stable, 'record', jsonb_build_object('slot_key','2026-10-01T13:00','holder','mallory',
            'expires_at', to_char((now()-interval '1 hour') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    raise exception 'PART 3 — a hold dated in the past was written straight into the store';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 3 —   hold already expired REFUSED at the table: %', v_msg;
  end;

  -- RELEASE frees it, and it says so rather than answering silently.
  if not custom.work_slot_release(v_org, (v_h2 ->> 'hold_id')::uuid) then
    raise exception 'PART 3 — releasing a live hold reported that it released nothing';
  end if;
  if custom.work_slot_release(v_org, (v_h2 ->> 'hold_id')::uuid) then
    raise exception 'PART 3 — releasing the same hold twice reported a second release';
  end if;
  perform custom.work_slot_hold(v_org, v_stable, '2026-10-01T09:00', 'dave', interval '10 minutes');
  raise notice 'PART 3 —   released, then retaken by dave.';
  raise notice 'PART 3 PASS — REC-71: the index decides, by name; the expiry frees the slot; a hold without one is refused.';
  raise notice '';

  -- ════════════════════════════════════════════════════════════════════════════════════
  -- PART 4 — THE ONE DOOR PREDICATE, IN EVERY VERB AND IN THE TRIGGER.
  -- ════════════════════════════════════════════════════════════════════════════════════
  -- A CENSUS, not a list: every W3-WORK function that WRITES is read out of the catalogue and
  -- asserted to consult `custom.assert_store_door`. A verb added later without the door turns
  -- this red rather than passing quietly.
  select array_agg(p.proname order by p.proname) into v_doors
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and (p.proname like 'work\_%' or p.proname = '_work_shape_guard')
     and p.prosrc ~* '(insert|update|delete)\s+(into\s+)?custom\.record|returns trigger'
     and p.prosrc !~ 'assert_store_door';
  if coalesce(array_length(v_doors, 1), 0) > 0 then
    raise exception 'PART 4 — % W3-WORK function(s) write to the store or are triggers and never consult the door: %',
                    array_length(v_doors, 1), array_to_string(v_doors, ', ');
  end if;
  select array_agg(p.proname order by p.proname) into v_doors
    from pg_proc p
   where p.pronamespace = 'custom'::regnamespace
     and (p.proname like 'work\_%' or p.proname = '_work_shape_guard')
     and p.prosrc ~ 'assert_store_door';
  raise notice 'PART 4 —   functions consulting the one door predicate: %', array_to_string(v_doors, ', ');

  -- AND THE DOOR IS LIVE, not merely called. A disposable role that is no member of the
  -- store's owner is refused 42501 by this lane's own trigger while the switch is off - and
  -- the same write as the owner is the positive control, which PART 3 already made.
  create role zz_w3_work_probe nologin bypassrls;
  -- BYPASSRLS on purpose: RLS is a row-VISIBILITY filter and the door is the write barrier,
  -- so a role RLS happens to hide a row from proves nothing about the door (V1-STORE's words).
  -- The grant is needed because `postgres` is not a superuser on this platform.
  execute format('grant zz_w3_work_probe to %I', current_user);
  grant usage on schema custom to zz_w3_work_probe;
  grant insert, select on custom.record to zz_w3_work_probe;
  -- EXECUTE on the schema's functions too, so what the probe meets is the DOOR's own sentence
  -- rather than a missing EXECUTE grant on the door - which is also a 42501 and would look
  -- exactly like a pass while proving nothing about the door.
  grant execute on all functions in schema custom to zz_w3_work_probe;
  set local role zz_w3_work_probe;
  begin
    insert into custom.record (organization_id, table_id, data_class, data)
    values (v_org, v_stable, 'record', jsonb_build_object('slot_key','zz','holder','probe',
            'expires_at', to_char((now()+interval '1 hour') at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));
    reset role;
    raise exception 'PART 4 — a role outside the store''s owner wrote a hold while the store was switched off';
  exception when insufficient_privilege then
    reset role;
    get stacked diagnostics v_msg = message_text;
    raise notice 'PART 4 —   a non-owner writing into a switched-off store: %', v_msg;
  end;
  raise notice 'PART 4 PASS — every W3-WORK writer and the trigger read their guard through custom.assert_store_door, and the door is shut.';
  raise notice '';

  raise notice '=== C-44 — REC-69, REC-70 and REC-71 proven on the rehearsal branch. This transaction rolls back; the two clauses that cannot live in one are w3_work_parallel.sh. ===';
end
$t$;

rollback;
