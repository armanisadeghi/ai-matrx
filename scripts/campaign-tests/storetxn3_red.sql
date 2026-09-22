-- LANE STORE-TXN-3 — THE RED TWIN of scripts/campaign-tests/storetxn3_green.sql.
--
-- It runs THE REAL BYTES of this lane's inverse — `migrations/inverse/
-- storetxn3_a_link_writes_both_halves_down.sql`, which puts `platform.relation_set` back to the
-- body that wrote the association and nothing else — inside a transaction that ends in ROLLBACK,
-- and then writes the SAME graph the green suite writes, as the SAME seat, into the SAME kind of
-- fixture. It PASSES only when the graph is REFUSED at COMMIT with the exact sentence
-- VERIFIER-13 measured on the main database at 16:0x UTC on 2026-09-22.
--
-- WHY A RED TWIN THAT RUNS THE INVERSE RATHER THAN ONE THAT PLANTS A FAULT. The defect was not a
-- missing check; it was a writer that wrote one half of a two-half fact. The only honest way to
-- show that the green suite is load-bearing is to put that writer back and watch the same call
-- fail — which also proves the inverse is a real inverse.
--
--   1  with the old body, `custom.record_write_graph` is REFUSED, 23514, and the sentence is
--      "a relation's ASSOCIATION landed with no value beside it".
--   2  the parent's document is EMPTY under the relation field's key — the half that was
--      never written, named directly rather than inferred from the refusal.
--   3  nothing survives: the transaction that tried it cannot commit.
--   4  with the old body, `platform.relation_unset` takes the edge away and leaves the value
--      standing, and the halves guard refuses that too — the second member of the class, and
--      the reason the inverse restores two bodies rather than one.
--
-- RUN IT:
--   "$PSQL" "<DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storetxn3_red.sql
\set ON_ERROR_STOP on
\timing off

\set suite 'storetxn3_red.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

-- 🚨 THE OLD BODIES, FROM THE INVERSE ITSELF. Rolled back with everything else below.
\i migrations/inverse/storetxn3_a_link_writes_both_halves_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_callout uuid;
  v_part    uuid;
  v_f_parts uuid;
  v_boss    text := current_user;
  v_graph   jsonb;
  v_parent  uuid;
  v_kids    text[];
  v_doc     jsonb;
  v_caught  text;
  v_state   text;
  v_n       integer;
begin
  perform set_config('app.actor_system', 'campaign-test/storetxn3_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co', 'rincon-plumbing-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'storetxn3_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Dispatch')) returning id into v_home;

  perform set_config('role', 'authenticated', true);

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

  -- ── 1 · THE SAME GRAPH, ON THE OLD BODY ───────────────────────────────────────────────
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

  -- ── 2 · THE HALF THAT WAS NEVER WRITTEN, NAMED DIRECTLY ───────────────────────────────
  v_doc := custom.read_record(v_org, v_parent, false);
  if v_doc ? 'parts_used' then
    raise exception 'RED 2 FAILED: the old body DID write the value half (%). The inverse is not the old body, so this twin proves nothing.', v_doc -> 'parts_used';
  end if;
  raise notice 'RED 2 — as measured: on the old body the parent document has no `parts_used` at all, while three edges point out of it.';

  -- ── 1 · AND THE TRANSACTION CANNOT COMMIT ─────────────────────────────────────────────
  v_caught := null;
  begin
    set constraints all immediate;
  exception when others then
    get stacked diagnostics v_caught = message_text, v_state = returned_sqlstate;
  end;
  if v_caught is null then
    raise exception 'RED 1 FAILED: NOTHING REFUSED IT. The graph committed with one half of every link, which is the defect this lane exists to close — the guard is gone or it is not deferred.';
  end if;
  if v_state <> '23514' or v_caught not like '%ASSOCIATION landed with no value beside it%' then
    raise exception 'RED 1 FAILED: it was refused, but not by the halves guard — % (%)', v_caught, v_state;
  end if;
  raise notice 'RED 1 PASS — refused at COMMIT, % · %', v_state, v_caught;

  raise notice 'RED 3 PASS — nothing survives: the transaction that wrote the graph cannot commit, so on the main database this door had no working path at all.';

  perform set_config('role', v_boss, true);
  raise notice 'storetxn3_red arms 1-3: exactly as VERIFIER-13 measured them. Nothing is committed.';
end $t$;

rollback;

-- 🚨 ARM 4 NEEDS ITS OWN TRANSACTION. Arm 1 deliberately leaves three half-written links
-- standing inside its transaction, and the guard is a CONSTRAINT trigger: every later
-- `set constraints all immediate` in the same transaction re-fires on those rows and answers
-- with arm 1's sentence, so arm 4 could never see its own. Two arms, two transactions — the
-- same trap lane TRIGGER-LOCK wrote down for `triggerlock_red.sql`.

begin;

\i migrations/inverse/storetxn3_a_link_writes_both_halves_down.sql

do $t$
declare
  c_admin   constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_admin_j constant text := '{"sub":"87a6e699-3622-4869-8843-d0867456c0dd","role":"authenticated"}';
  v_org     uuid := gen_random_uuid();
  v_home    uuid;
  v_callout uuid;
  v_part    uuid;
  v_f_parts uuid;
  v_boss    text := current_user;
  v_parent  uuid;
  v_kids    text[];
  v_caught  text;
  v_state   text;
  v_n       integer;
begin
  perform set_config('app.actor_system', 'campaign-test/storetxn3_red', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Rincon Plumbing Co', 'rincon-plumbing-' || substr(v_org::text, 1, 8), 'RPC', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
  values ('custom', 'system_enabled', 'organization', v_org, v_org, 'true'::jsonb, 'storetxn3_red');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Dispatch')) returning id into v_home;

  perform set_config('role', 'authenticated', true);

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

  -- ── 4 · THE MIRROR CLAUSE, THE SECOND MEMBER OF THE CLASS ─────────────────────────────

  -- A record whose value half IS there (written the ordinary way, through the store's own
  -- document door) and whose edge the OLD `platform.relation_unset` takes away alone.
  v_parent := custom.record_write(v_org, v_callout, jsonb_build_object(
    'job_name', 'WO-4483 — Harbour Street cafe, mop sink',
    'address',  '9 Harbour Street',
    'problem',  'Backflow preventer weeping; replaced cartridge.'));
  v_kids := array[ custom.record_write(v_org, v_part, jsonb_build_object(
      'part_name','Backflow cartridge, 3/4in','part_number','BF-34-CR','quantity',1))::text ];
  perform custom.record_update(v_org, v_parent,
            jsonb_build_object('parts_used', jsonb_build_array(to_jsonb(v_kids[1]))));
  select count(*) into v_n from platform.relations_from(v_org, v_parent) f where f.role = 'parts_used';
  if v_n <> 1 then
    raise exception 'RED 4 setup: the ordinary write did not leave one edge behind (it left %)', v_n; end if;
  perform platform.relation_unset(v_org, v_parent, 'parts_used', v_kids[1]::uuid);
  v_caught := null;
  begin
    set constraints all immediate;
  exception when others then
    get stacked diagnostics v_caught = message_text, v_state = returned_sqlstate;
  end;
  if v_caught is null then
    raise exception 'RED 4 FAILED: NOTHING REFUSED IT. The old relation_unset withdrew the edge while the value still named the record and the transaction committed.';
  end if;
  -- EITHER ARM OF THE GUARD IS THE PROOF, and which one speaks first is PostgreSQL's choice of
  -- constraint-trigger firing order, not a fact about the defect: the record was updated in this
  -- transaction too, so its VALUE arm ("a relation landed its VALUE with no association beside
  -- it") and the association's EDGE arm ("an ASSOCIATION was removed while its VALUE still names
  -- the record") both see the same disagreement from their own side. Pinning one sentence here
  -- would make this twin fail on an ordering change that means nothing.
  if v_state <> '23514'
     or not (v_caught like '%with no association beside it%'
             or v_caught like '%was removed while its VALUE still names the record%') then
    raise exception 'RED 4 FAILED: refused, but not by the halves guard — % (%)', v_caught, v_state; end if;
  raise notice 'RED 4 PASS — the unset half of the class, refused at COMMIT: % · %', v_state, v_caught;

  perform set_config('role', v_boss, true);
  raise notice 'storetxn3_red: ALL 4 ARMS behaved exactly as VERIFIER-13 measured them. Nothing is committed.';
end $t$;

rollback;

\echo ''
\echo 'storetxn3_red: the old bodies produce the refusal. Nothing was committed.'
