-- LANE STORE-TXN-3 — THE GREEN SUITE. A graph with children LANDS, from the seat
-- `authenticated`, in one transaction that ends in ROLLBACK. This is VERIFIER-13's item 4,
-- re-walked: the exact shape that was refused at COMMIT on the main database this morning.
--
-- RUN IT:
--   "$PSQL" "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storetxn3_green.sql
--
-- THE REAL USE CASE, NAMED BEFORE A SINGLE VALUE IS TYPED (owner law 2026-09-21). Rincon
-- Plumbing Co dispatches two vans around Ashport. Every callout the crew runs is a row in the
-- store, and the PARTS the crew actually pulled off the van are rows in their own right — the
-- office reconciles them against the truck binder at the end of the week, so "3/4in copper
-- coupling" has to be a record with a part number and a price, not a word inside a job note.
-- That is a parent and its lines, and it is the whole reason `custom.record_write_graph` exists.
--
-- WHAT IT PROVES, AND WHAT MAKES EACH CLAUSE FAIL:
--   0  the seat is `authenticated`, `custom.record` is not readable from it, and the DEFERRED
--      halves guard stands on both halves. Without clause 0 the rest proves nothing: a suite
--      run as the owner, or on a database without the guard, is the mistake that let this
--      defect ship (STORE-TXN's suite was green on a clone that had no guard).
--   1  ONE CALL LANDS THE WHOLE GRAPH — parent, three children, three relation edges.
--      Put `platform.relation_set` back to the edge-only body and this refuses at clause 4.
--   2  THE PARENT'S DOCUMENT HOLDS THE THREE CHILD IDS under the relation field's key, in the
--      order they were handed in. This is the half that was never written.
--   3  THREE ASSOCIATION ROWS, role = the field key, each naming the field it came from, at
--      positions 1, 2, 3 — the order of the document, not of the call.
--   4  `set constraints all immediate` FORCES the deferred guard, and it is satisfied. This is
--      the clause that reproduces the production refusal; on the old body it raises 23514
--      "a relation's ASSOCIATION landed with no value beside it".
--   5  A SECOND INPUT WITH A DIFFERENT EXPECTED ANSWER, so a door that refused everything
--      could not pass: the relation field's key handed to `platform.relation_set` is accepted,
--      a TEXT column's key is refused by `platform.relation_set`'s own name, and nothing moves.
--   6  UNLINKING MOVES BOTH HALVES TOO: `platform.relation_unset` takes the id out of the
--      document and withdraws the edge, the guard is forced again, and it is satisfied.
--   7  THE HARD-PURGE DOOR ANSWERS IN ITS OWN WORDS from the seat — the written sentence and
--      its remedy, not PostgreSQL's `permission denied for function migrate_purge_hard` — and
--      it still REFUSES, so chair-only is still chair-only.
--
-- Its red twin is scripts/campaign-tests/storetxn3_red.sql, which runs this lane's inverse
-- bytes inside a rolled-back transaction and asserts the refusal exactly as VERIFIER-13
-- measured it.
\set ON_ERROR_STOP on
\timing off

\set suite 'storetxn3_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_callout uuid;   -- Truck-binder callouts
  v_part    uuid;   -- Parts used on a callout
  v_f_parts uuid;   -- the relation column
  v_boss    text := current_user;
  v_graph   jsonb;
  v_parent  uuid;
  v_kids    text[];
  v_doc     jsonb;
  v_n       integer;
  v_caught  text;
  v_state   text;
  v_hint    text;
begin
  perform set_config('app.actor_system', 'campaign-test/storetxn3_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co', 'rincon-plumbing-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'storetxn3_green');

  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Dispatch')) returning id into v_home;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 0 — THE SEAT, AND THE GUARD THIS SUITE IS ABOUT.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  select count(*) into v_n
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgname = 'zzzz_relation_halves_agree'
     and p.proname = '_relation_halves_agree'
     and t.tgdeferrable and t.tginitdeferred
     and t.tgrelid in ('custom.record'::regclass, 'platform.associations'::regclass);
  if v_n <> 2 then
    raise exception '0: the DEFERRED halves guard is not standing on both halves here (% of 2). This suite is about what that guard refuses, so without it every clause below is theatre — which is exactly how this defect shipped.', v_n;
  end if;

  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice 'CLAUSE 0 PASS — the seat is `authenticated`, custom.record is closed to it, and the DEFERRED halves guard stands on both halves.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- THE FIXTURE: two Tables and the column that joins them, declared from the seat.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_part := custom.table_declare(v_org, jsonb_build_object(
    'name','Parts used on a callout','slug','callout_parts','type','entity',
    'label_singular','Part line','label_plural','Part lines','title_field','part_name',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','part_name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_part, jsonb_build_object('label','Part','key','part_name','type','text'));
  perform custom.field_declare(v_org, v_part, jsonb_build_object('label','Part number','key','part_number','type','text'));
  perform custom.field_declare(v_org, v_part, jsonb_build_object('label','Quantity','key','quantity','type','number'));

  v_callout := custom.table_declare(v_org, jsonb_build_object(
    'name','Truck-binder callouts','slug','truck_binder_callouts','type','entity',
    'label_singular','Callout','label_plural','Callouts','title_field','job_name',
    'display','page','weight','light','ordered',false,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'retention_days',365,
    'fields', jsonb_build_array(jsonb_build_object('name','job_name')),
    'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_callout, jsonb_build_object('label','Job','key','job_name','type','text'));
  perform custom.field_declare(v_org, v_callout, jsonb_build_object('label','Address','key','address','type','text'));
  perform custom.field_declare(v_org, v_callout, jsonb_build_object('label','Problem','key','problem','type','text'));

  v_f_parts := custom.field_declare(v_org, v_callout, jsonb_build_object(
    'label','Parts used','key','parts_used','type','relation',
    'relation_target', v_part::text, 'multi', true, 'relation_max', 40,
    'on_target_delete','set_null', 'config', jsonb_build_object('ordered', true)));
  if v_f_parts is null then raise exception 'fixture: the parts_used relation column was not made'; end if;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 1 — ONE CALL LANDS THE WHOLE GRAPH.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_graph := custom.record_write_graph(
    v_org, v_callout,
    jsonb_build_object(
      'job_name', 'WO-4482 — Ashport duplex, upstairs bath',
      'address',  '118 Ashport Row, Unit B',
      'problem',  'Slow drain both fixtures; snaked 25ft, replaced trap arm and supply stops.'),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('data', jsonb_build_object(
        'part_name','1-1/2in PVC trap arm','part_number','TA-15-PVC','quantity',1),
        'table_id', v_part::text, 'role', 'parts_used'),
      jsonb_build_object('data', jsonb_build_object(
        'part_name','1/4-turn angle stop, 1/2in','part_number','AS-12-QT','quantity',2),
        'table_id', v_part::text, 'role', 'parts_used'),
      jsonb_build_object('data', jsonb_build_object(
        'part_name','3/4in copper coupling','part_number','CC-34-CU','quantity',3),
        'table_id', v_part::text, 'role', 'parts_used')));

  v_parent := (v_graph ->> 'parent_id')::uuid;
  select array_agg(x) into v_kids from jsonb_array_elements_text(v_graph -> 'child_ids') x;
  if (v_graph ->> 'children')::int <> 3 then
    raise exception '1: the graph reports % children, not 3 — %', v_graph ->> 'children', v_graph; end if;
  if (v_graph ->> 'relations')::int <> 3 then
    raise exception '1: the graph reports % relations, not 3 — %', v_graph ->> 'relations', v_graph; end if;
  raise notice 'CLAUSE 1 PASS — one call, one parent (%) and three part lines.', v_parent;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 2 — THE PARENT'S DOCUMENT HOLDS THE THREE IDS. This is the half that was never written.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- READ BACK THROUGH THE DOOR THE PERSON USES. `custom.record` is closed to this seat (clause
  -- 0 proved it), and a value that only the owner role can see is not a value the grid renders.
  v_doc := custom.read_record(v_org, v_parent, false);
  if jsonb_typeof(v_doc -> 'parts_used') <> 'array' then
    raise exception '2: the parent document holds % under parts_used, not a list of ids — %',
      coalesce(jsonb_typeof(v_doc -> 'parts_used'), 'nothing'), v_doc; end if;
  if (select array_agg(x order by ord) from jsonb_array_elements_text(v_doc -> 'parts_used')
        with ordinality t(x, ord)) is distinct from v_kids then
    raise exception '2: the parent names % under parts_used, and its children are % — the two halves disagree',
      v_doc -> 'parts_used', v_kids; end if;
  raise notice 'CLAUSE 2 PASS — the parent document holds the three child ids under `parts_used`, in the order they were handed in.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 3 — AND THREE ASSOCIATION ROWS BESIDE THEM.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- The forward end of the relation, read from the seat through `platform.relations_from` —
  -- the reader every relation surface uses (REL-9).
  select count(*) into v_n from platform.relations_from(v_org, v_parent) f
   where f.role = 'parts_used' and f.field_id = v_f_parts;
  if v_n <> 3 then
    raise exception '3: the parent has % live parts_used edge(s) naming their field, not 3', v_n; end if;
  if (select array_agg(f.target_id::text order by f.position)
        from platform.relations_from(v_org, v_parent) f
       where f.role = 'parts_used') is distinct from v_kids then
    raise exception '3: the edges are not in the document''s own order'; end if;
  if (select array_agg(f.position order by f.position)
        from platform.relations_from(v_org, v_parent) f
       where f.role = 'parts_used') is distinct from array[1,2,3] then
    raise exception '3: the edge positions are not 1, 2, 3'; end if;
  raise notice 'CLAUSE 3 PASS — three association rows, role `parts_used`, each naming its field, at positions 1, 2, 3.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 4 — THE DEFERRED GUARD, FORCED. This is the clause that was RED on production today.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  set constraints all immediate;
  raise notice 'CLAUSE 4 PASS — `set constraints all immediate` fired custom._relation_halves_agree on both halves and it is satisfied. On the pre-STORE-TXN-3 body this raises 23514 "a relation''s ASSOCIATION landed with no value beside it".';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 5 — A FIELD THAT IS NOT A RELATION IS REFUSED BY THIS DOOR'S OWN NAME.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  if platform.relation_set(v_org, v_parent, 'parts_used',
                           jsonb_build_array(jsonb_build_object('entity','record','row_id', v_kids[1]))) <> 1 then
    raise exception '5: re-setting a link the parent already holds did not write one edge'; end if;
  v_caught := null;
  begin
    perform platform.relation_set(v_org, v_parent, 'address',
              jsonb_build_array(jsonb_build_object('entity','record','row_id', v_kids[1])));
  exception when others then
    get stacked diagnostics v_caught = message_text, v_state = returned_sqlstate;
  end;
  if v_caught is null then
    raise exception '5: a TEXT column handed to platform.relation_set was ACCEPTED'; end if;
  if v_caught not like '%platform.relation_set%' or v_caught not like '%not a relation%' then
    raise exception '5: the refusal does not name this door and what is wrong — % (%)', v_caught, v_state; end if;
  set constraints all immediate;
  raise notice 'CLAUSE 5 PASS — the relation key is accepted and a text column is refused by name: %', v_caught;

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 6 — UNLINKING MOVES BOTH HALVES.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  if platform.relation_unset(v_org, v_parent, 'parts_used', v_kids[2]::uuid) <> 1 then
    raise exception '6: relation_unset did not report the one link it unmade'; end if;
  v_doc := custom.read_record(v_org, v_parent, false);
  if exists (select 1 from jsonb_array_elements_text(v_doc -> 'parts_used') x(v) where x.v = v_kids[2]) then
    raise exception '6: the id is still in the parent document after unset — %', v_doc -> 'parts_used'; end if;
  select count(*) into v_n from platform.relations_from(v_org, v_parent) f
   where f.role = 'parts_used';
  if v_n <> 2 then
    raise exception '6: the parent has % live parts_used edges after one unset, not 2', v_n; end if;
  set constraints all immediate;
  raise notice 'CLAUSE 6 PASS — one unset took the id out of the document AND withdrew the edge, and the guard is satisfied.';

  -- ══════════════════════════════════════════════════════════════════════════════════════
  -- 7 — THE HARD-PURGE DOOR ANSWERS IN ITS OWN WORDS, AND STILL REFUSES.
  -- ══════════════════════════════════════════════════════════════════════════════════════
  v_caught := null; v_hint := null;
  begin
    perform custom.migrate_purge_hard(v_org, null,
      'Compliance erasure requested in writing by the customer under a data-deletion obligation.',
      200, true);
  exception when others then
    get stacked diagnostics v_caught = message_text, v_state = returned_sqlstate, v_hint = pg_exception_hint;
  end;
  if v_caught is null then
    raise exception '7: a client seat REACHED the hard-purge door. Chair-only is no longer chair-only.'; end if;
  if v_caught like 'permission denied for function%' then
    raise exception '7: the seat still hears PostgreSQL rather than the door — %', v_caught; end if;
  if v_caught not like '%not something a signed-in caller does here%' then
    raise exception '7: the refusal is not the door''s own written sentence — % (%)', v_caught, v_state; end if;
  if coalesce(v_hint, '') not like '%archive, never delete%' then
    raise exception '7: the refusal carries no remedy — hint was %', coalesce(v_hint, '(none)'); end if;
  raise notice 'CLAUSE 7 PASS — the seat hears the door: "%" · remedy: %', v_caught, left(v_hint, 90);

  perform set_config('role', v_boss, true);
  raise notice 'storetxn3_green: ALL 8 CLAUSES PASS (0-7). Nothing is committed.';
end $t$;

rollback;

\echo ''
\echo 'storetxn3_green: all clauses PASS. Nothing was committed.'
