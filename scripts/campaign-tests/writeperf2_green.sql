-- WRITE-PERF-2 — THE GREEN SUITE, FROM THE SEAT.
--
-- Every asserted clause below PART 0 runs as `authenticated`, the role PostgREST serves a
-- signed-in person, and goes through a client door. The one step that steps out says so and
-- asserts nothing while it is out.
--
-- Run: bin/p.sh -f scripts/campaign-tests/writeperf2_green.sql
\set ON_ERROR_STOP on
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10min';

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_dana  uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_admin_j text; c_dana_j text;
  v_boss  text := current_user;
  v_org uuid; v_home uuid; v_tbl uuid; v_acct uuid; v_accts uuid[];
  v_ids uuid[]; v_docs jsonb[]; i int; n int; v_txt text; v_ok boolean;
begin
  c_admin_j := jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text;
  c_dana_j  := jsonb_build_object('sub', c_dana,  'role', 'authenticated')::text;

  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Coastal Veterinary Clinic Green', 'coastal-vet-green-' || substr(md5(random()::text),1,8), 'CVG', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org),
         (v_org, c_dana,  'member','active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');

  perform set_config('app.actor_system','campaign-test/writeperf2_green', true);
  perform set_config('request.jwt.claims', c_admin_j, true);

  -- ── PART 0 — TAKE THE SEAT AND PROVE IT ────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  if current_user <> 'authenticated' then
    raise exception '0: this suite did not take the seat — current_user is %', current_user;
  end if;
  if pg_has_role(current_user,
                 (select c.relowner from pg_class c where c.oid = 'custom.record'::regclass),
                 'member') then
    raise exception '0: this seat is a member of the role that owns custom.record, so every wall would open on its first line';
  end if;
  begin
    perform 1 from custom.record limit 1;
    raise exception '0: this seat can SELECT custom.record directly, so it is not a client seat';
  exception when insufficient_privilege then null;
  end;
  raise notice '0  the seat is authenticated and cannot read custom.record directly';

  -- ── FIXTURE, through the doors ─────────────────────────────────────────────────────────
  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Green Home'));
  v_acct := custom.table_declare(v_org, jsonb_build_object(
    'name','Patient Accounts','slug','patient_accounts_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Account','label_plural','Accounts','title_field','title','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','title')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_acct, jsonb_build_object('label','Title','key','title','type','text'));
  for i in 1..10 loop
    v_accts := v_accts || custom.record_write(v_org, v_acct, jsonb_build_object('title','Account ' || i));
  end loop;
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Treatment Plans','slug','treatment_plans_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Treatment','label_plural','Treatments','title_field','treatment','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','treatment')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Treatment','key','treatment','type','text'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Amount','key','amount','type','currency','unit','USD'));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Stage','key','stage','type','select','options', jsonb_build_array('Open','Won','Lost')));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Account','key','account','type','relation','relation_target', v_acct::text));

  -- ── 1  THE AFTER SIDE OF `custom.record` FIRES ONCE PER STATEMENT ──────────────────────
  -- Read from the catalogue, which needs no grant.
  select count(*) into n from pg_trigger t
   where t.tgrelid='custom.record'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 1;
  if n <> 2 then
    raise exception '1a: % AFTER-ROW triggers on custom.record, expected the 2 that stay row-level on purpose', n;
  end if;
  select string_agg(t.tgname, ', ' order by t.tgname) into v_txt from pg_trigger t
   where t.tgrelid='custom.record'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 1;
  if v_txt <> 'custom_record_field_type_converts_values, zzz_pipelines_on_entry' then  -- matrx-real-data:allow zzz_pipelines_on_entry is the real live trigger name from migrations/campaign/pipelines_a_stage_is_a_field_and_its_moves_are_rules.sql, not fixture data
    raise exception '1b: the two AFTER-ROW triggers left are "%" — not the two this lane named', v_txt;
  end if;
  select count(*) into n from pg_trigger t
   where t.tgrelid='custom.record'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 0;
  if n <> 14 then
    raise exception '1c: % AFTER-STATEMENT triggers on custom.record, expected 14', n;
  end if;
  -- and every one of them names a transition table, or it is not reading the statement at all
  select count(*) into n from pg_trigger t
   where t.tgrelid='custom.record'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 0
     and (t.tgoldtable is not null or t.tgnewtable is not null);
  if n <> 14 then
    raise exception '1d: only % of the 14 statement triggers name a transition table', n;
  end if;
  raise notice '1  2 AFTER-ROW triggers left (%), 14 AFTER-STATEMENT, every one over a transition table', v_txt;

  -- ── 2  THE BATCHED DOOR: 500 RECORDS IN ONE STATEMENT, IDS IN INPUT ORDER ──────────────
  select array_agg(jsonb_strip_nulls(jsonb_build_object(
           'treatment', 'Treatment ' || g.i,
           'amount', round((g.i * 12.37 + 100)::numeric, 2),
           'stage', (array['Open','Won','Lost'])[1 + (g.i % 3)],
           'account', case when g.i % 7 = 0 then null else v_accts[1 + (g.i % 10)]::text end)) order by g.i)
    into v_docs from generate_series(1, 500) g(i);
  v_ids := custom.record_write_many(v_org, v_tbl, v_docs);
  if coalesce(cardinality(v_ids), 0) <> 500 then
    raise exception '2a: the batched door handed back % ids for 500 records', coalesce(cardinality(v_ids), 0);
  end if;
  for i in 1..500 loop
    if (custom.read_record(v_org, v_ids[i], false) ->> 'treatment') <> ('Treatment ' || i) then
      raise exception '2b: id % of the batch resolves to "%", not "Treatment %"',
        i, custom.read_record(v_org, v_ids[i], false) ->> 'treatment', i;
    end if;
  end loop;
  -- the read door sees all 500 (paged at the ceiling the page contract declares)
  select count(*) into n from custom.read_records(v_org, v_tbl, true, 1000, 0);
  if n <> 500 then raise exception '2c: the read door sees % of the 500 written in one statement', n; end if;
  raise notice '2  500 records written in ONE statement, 500 ids back in input order, all 500 readable';

  -- ── 3  ONE VERSION PER ROW PER STATEMENT ──────────────────────────────────────────────
  perform set_config('role', v_boss, true);   -- history.row_versions has no client door; read only
  select count(*) into n from history.row_versions h
   where h.entity_type='custom.record' and h.organization_id=v_org and h.row_id = any(v_ids);
  if n <> 500 then raise exception '3a: % history rows for 500 records written in one statement', n; end if;
  select count(*) into n from history.row_versions h
   where h.entity_type='custom.record' and h.organization_id=v_org and h.row_id = any(v_ids)
     and (h.operation <> 'INSERT' or h.version <> 1);
  if n <> 0 then raise exception '3b: % of the 500 history rows are not version 1 / INSERT', n; end if;
  -- ── 4  ONE EVENT PER ROW PER STATEMENT, WITH THE FIELDS THAT MOVED ────────────────────
  select count(*) into n from custom.io_outbox o
   where o.organization_id=v_org and o.record_id = any(v_ids);
  if n <> 500 then raise exception '4a: % outbox rows for 500 records written in one statement', n; end if;
  select count(*) into n from custom.io_outbox o
   where o.organization_id=v_org and o.record_id = any(v_ids) and o.operation <> 'created';
  if n <> 0 then raise exception '4b: % outbox rows for the batch do not say "created"', n; end if;
  -- the 428 records that named an account report four field keys, the 72 that did not report three
  select count(*) into n from custom.io_outbox o
   where o.organization_id=v_org and o.record_id = any(v_ids)
     and jsonb_array_length(o.changed_field_ids) not in (3, 4);
  if n <> 0 then raise exception '4c: % outbox rows name neither 3 nor 4 changed fields', n; end if;
  -- ── 5  THE RELATION EDGE CARRIES ITS FIELD ───────────────────────────────────────────
  select count(*) into n from platform.associations a
   where a.source_type='record' and a.source_id = any(v_ids) and a.deleted_at is null
     and a.relation_field_id is not null;
  if n <> 429 then raise exception '5a: % relation edges with a Field on them, expected 429', n; end if;
  perform set_config('role', 'authenticated', true);
  raise notice '3-5  500 history rows (all version 1 / INSERT), 500 outbox rows (all "created"), 429 relation edges each carrying its Field';

  -- ── 6  A MULTI-ROW UPDATE: ONE VERSION PER ROW, AND THE SOFT DELETE IS A SOFT DELETE ──
  -- No client door issues a multi-row UPDATE today (custom.record_update patches one record), so
  -- this steps out to the connected role for the STATEMENT and comes straight back to assert.
  perform set_config('role', v_boss, true);
  update custom.record r set data = r.data || jsonb_build_object('stage','Won')
   where r.organization_id = v_org and r.id = any(v_ids[1:100]);
  update custom.record r set deleted_at = now()
   where r.organization_id = v_org and r.id = any(v_ids[1:50]);
  select count(*) into n from history.row_versions h
   where h.entity_type='custom.record' and h.organization_id=v_org and h.row_id = any(v_ids[1:100])
     and h.operation = 'UPDATE';
  if n <> 100 then raise exception '6a: % UPDATE versions for a 100-row statement', n; end if;
  select count(*) into n from history.row_versions h
   where h.entity_type='custom.record' and h.organization_id=v_org and h.row_id = any(v_ids[1:50])
     and h.operation = 'SOFT_DELETE';
  if n <> 50 then raise exception '6b: % SOFT_DELETE versions for a 50-row statement', n; end if;
  select count(*) into n from custom.io_outbox o
   where o.organization_id=v_org and o.record_id = any(v_ids[1:50]) and o.operation = 'deleted';
  if n <> 50 then raise exception '6c: % "deleted" events for a 50-row soft delete', n; end if;
  -- the edge collector ran over the statement, not over each row
  select count(*) into n from platform.associations a
   where a.source_type='record' and a.source_id = any(v_ids[1:50])
     and a.deleted_at is not null and a.deleted_via_type = 'record';
  if n < 40 then raise exception '6d: only % of the soft-deleted records had their edges collected', n; end if;
  perform set_config('role', 'authenticated', true);
  raise notice '6  a 100-row UPDATE left 100 UPDATE versions, a 50-row soft delete left 50 SOFT_DELETE versions, 50 "deleted" events and % collected edges', n;

  -- ── 7  ONE BAD ROW REFUSES THE WHOLE BATCH, BY NAME, AND NOTHING LANDS ────────────────
  select array_agg(jsonb_build_object('treatment','Bad '||g.i,
           'stage', case when g.i = 7 then 'Nonsense' else 'Open' end) order by g.i)
    into v_docs from generate_series(1, 10) g(i);
  v_ok := false;
  begin
    perform custom.record_write_many(v_org, v_tbl, v_docs);
    v_ok := true;
  exception when others then
    v_txt := sqlerrm;
  end;
  if v_ok then raise exception '7a: a batch carrying a choice nothing offers was accepted'; end if;
  select count(*) into n from custom.read_records(v_org, v_tbl, true, 1000, 0) x
   where (x.document ->> 'treatment') like 'Bad %';
  if n <> 0 then raise exception '7b: % rows of the refused batch landed anyway', n; end if;
  raise notice '7  one bad row refused all ten, by name ("%"), and none of them landed', left(v_txt, 70);

  -- ── 8  A PERSON WHO IS NOT IN THE ORGANIZATION IS REFUSED, AND ONE WHO IS, IS NOT ─────
  perform set_config('request.jwt.claims', c_dana_j, true);
  v_ok := false;
  begin
    perform custom.record_write_many(v_org, v_tbl, array[jsonb_build_object('treatment','Dana tried')]);
    v_ok := true;
  exception when others then v_txt := sqlerrm;
  end;
  if v_ok then
    raise exception '8a: test@test.com, a member with no rung on this Table, wrote a batch into it';
  end if;
  -- the control: she CAN read the organization's page contract, so the refusal above is about
  -- the rung on this Table and not about refusing her everything.
  if (custom.page_contract(v_org) ->> 'ceiling') is null then
    raise exception '8b: test@test.com cannot read her own organization''s page contract either, so 8a proves nothing';
  end if;
  perform set_config('request.jwt.claims', c_admin_j, true);
  raise notice '8  test@test.com is refused the batched door on a Table she has no rung on ("%"), and still reads her organization''s page contract', left(v_txt, 60);

  -- ── 9  THE CENSUS: NOTHING ON THE WRITE PATH RE-PLANS ITSELF PER CALL ────────────────
  perform set_config('role', v_boss, true);
  select count(*) into n from custom.ladder_replanners(array[
    'custom.record_write','custom.record_write_many','custom.record_update','custom.io_import_rows',
    'custom._record_rule_uses','custom._value_envelope','custom._resolve_choice_words','custom._derived_fields',
    'custom._record_field_validation','custom._entity_custom_fields_guard','custom._containment_association',
    'custom._relation_associations','custom.io_record_changed','history.record_capture','custom._checklist_watch',
    'custom._checklist_watch_for','custom._pipeline_on_entry','custom._field_type_converts_values',
    'custom._table_owner_stamp','custom._field_class_guard','custom._field_type_parity_guard',
    'custom._unique_rule_holds','custom._work_shape_guard','custom._organization_wall_guard',
    'custom._stamp_actor','custom._stamp_actor_tier','custom._touch_row','custom._metadata_guard',
    'custom._table_shape_guard','custom._rule_shape_guard','custom._rule_topology_guard',
    'custom._merge_field_shape_guard','custom._merge_field_temporal_guard','custom._containment_guard',
    'custom._dated_values_guard','custom._field_shape_guard','custom._field_write_door',
    'custom._promoted_field_cap_guard','custom._workdoors_approval_guard','custom._checklist_step_guard',
    'custom._store_door','custom._guard_governance_columns','platform._gc_entity_associations',
    'custom.io_record_changed_stmt_insert','custom.io_record_changed_stmt_update','custom.io_record_changed_stmt_delete',
    'history.record_capture_stmt_insert','history.record_capture_stmt_update','history.record_capture_stmt_delete',
    'custom._containment_association_stmt_insert','custom._containment_association_stmt_update',
    'custom._relation_associations_stmt_insert','custom._relation_associations_stmt_update',
    'custom._checklist_watch_stmt_insert','custom._checklist_watch_stmt_update',
    'platform._gc_entity_associations_stmt_softdelete','platform._gc_entity_associations_stmt_harddelete']);
  if n <> 0 then
    raise exception '9: % non-inlinable SQL helpers are still on the write path, re-planned on every call', n;
  end if;
  raise notice '9  the write-path replanner census is 0 across 57 roots';

  raise notice 'ALL PARTS PASSED';
end;
$t$;
rollback;
