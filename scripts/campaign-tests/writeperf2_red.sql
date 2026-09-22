-- WRITE-PERF-2 — THE RED TWIN. It executes the REAL BYTES of all four inverses, so the store is
-- genuinely the one this lane found, and then asserts every clause the green suite asserts —
-- each of which must FAIL. It ends in ROLLBACK and then reads the restored store GREEN again in
-- the same session, so the file cannot pass by leaving the database broken.
--
-- Run: bin/p.sh -f scripts/campaign-tests/writeperf2_red.sql
\set ON_ERROR_STOP on

-- TARGET AND DEPENDENCIES — the one shared preamble. It accepts the MAIN database or the
-- rehearsal branch named in common-docs/.../plan/BRANCH-REF, refuses anything else by name,
-- says which database this is, and SKIPS (never fake-passes) when a declared dependency is
-- absent here. Declare dependencies with `\set requires` above the include; see the preamble.
\set suite 'writeperf2_red.sql'
\set requires 'function:custom.io_record_changed'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
begin;
set local statement_timeout = 0;
set local idle_in_transaction_session_timeout = 0;
set local lock_timeout = '10s';

\echo '=== executing the four inverses for real ==='
\i migrations/inverse/writeperf2_a_batch_of_records_is_one_statement_down.sql
\i migrations/inverse/writeperf2_the_after_triggers_fire_once_per_statement_down.sql
\i migrations/inverse/writeperf2_the_write_path_asks_the_ladder_only_for_a_rule_down.sql
\i migrations/inverse/writeperf2_the_rest_of_the_write_path_plans_once_down.sql

do $t$
declare
  c_admin uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_boss  text := current_user;
  v_org uuid; v_home uuid; v_tbl uuid; v_ids uuid[]; i int;
  n int; v_txt text; v_ok boolean; v_red int := 0; v_blocks int := 7; v_names text[]; v_missing text[];
begin
  -- THE FIXTURE, as the connected role (an organization, a membership and a knob are not
  -- client doors), and then the seat.
  insert into iam.organizations (name, slug, abbreviation, created_by)
  values ('Coastal Veterinary Clinic Red', 'coastal-vet-red-' || substr(md5(random()::text),1,8), 'CVR', c_admin)
  returning id into v_org;
  insert into iam.memberships (organization_id, user_id, role, status, container_type, container_id)
  values (v_org, c_admin, 'owner', 'active', 'organization', v_org);
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom','system_enabled','organization', v_org, v_org, 'true');
  perform set_config('app.actor_system','campaign-test/writeperf2_red', true);
  perform set_config('request.jwt.claims',
                     jsonb_build_object('sub', c_admin, 'role', 'authenticated')::text, true);

  -- PART 0 — TAKE THE SEAT AND PROVE IT.
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

  -- ── 6  FROM THE SEAT: THE BATCHED DOOR IS UNREACHABLE, AND THE STORE STILL WORKS ──────
  -- The inverses above already ran; this is the product clause, through the doors.
  v_home := custom.record_write(v_org, custom.person_kernel_id(), jsonb_build_object('name','Red Home'));
  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Treatment Plans','slug','treatment_plans_' || substr(md5(random()::text),1,8),'type','entity',
    'label_singular','Treatment','label_plural','Treatments','title_field','treatment','display','page',
    'weight','light','ordered',false,'row_order','sorted','default_sort','[]'::jsonb,
    'agent_writable',true,'retention_days',365,'on_delete','cascade',
    'fields', jsonb_build_array(jsonb_build_object('name','treatment')), 'parent_id', v_home::text));
  perform custom.field_declare(v_org, v_tbl, jsonb_build_object('label','Treatment','key','treatment','type','text'));
  v_ok := false;
  begin
    execute 'select custom.record_write_many($1, $2, $3)' using v_org, v_tbl, array[jsonb_build_object('treatment','x')];
    v_ok := true;
  exception when others then v_txt := sqlerrm;
  end;
  if v_ok then
    raise exception 'RED 6 DID NOT GO RED: a signed-in person can still write a batch in one statement';
  end if;
  v_red := v_red + 1;
  raise notice 'RED 6  a signed-in person asking for a batch gets "%" — the only route left is one row per statement', left(v_txt, 60);
  for i in 1..10 loop
    v_ids := v_ids || custom.record_write(v_org, v_tbl, jsonb_build_object('treatment','Red ' || i));
  end loop;
  select count(*) into n from custom.read_records(v_org, v_tbl, true, 200, 0);
  if n <> 10 then
    raise exception 'RED 7 control: the store itself is broken — the read door sees % of 10 rows written one at a time', n;
  end if;
  v_red := v_red + 1;
  raise notice 'RED 7  the control: ten rows written one statement at a time over the ROW-level triggers read back as ten, so blocks 1-6 are about the conversion and not about a broken store';

  -- The catalogue blocks below read pg_trigger, pg_proc and custom.ladder_replanners. No client
  -- door covers the system catalogue, so the seat steps out for them and asserts no product
  -- clause while it is out.
  perform set_config('role', v_boss, true);
  -- 1  THE AFTER SIDE IS ROW-LEVEL AGAIN
  select count(*) into n from pg_trigger t
   where t.tgrelid='custom.record'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 1;
  if n = 9 then
    v_red := v_red + 1;
    raise notice 'RED 1  all % AFTER triggers on custom.record are ROW-LEVEL again — every one fires once per row', n;
  else
    raise exception 'RED 1 DID NOT GO RED: % AFTER-ROW triggers, expected the 9 the store had', n;
  end if;
  -- BY NAME, NOT BY TOTAL (amended by lane WRITE-PERF-3, 2026-09-21, for the same reason as
  -- clauses 1c and 1d of writeperf2_green.sql). This lane's inverse takes away THIS lane's
  -- fourteen statement triggers; it says nothing about anybody else's, and WRITE-PERF-3's
  -- three `zz_memo_clear_*` triggers are correct and deliberately left standing. Counting the
  -- total made this clause claim the inverse had failed when it had done exactly its job.
  select count(*) into n from pg_trigger t
   where t.tgrelid='custom.record'::regclass and not t.tgisinternal
     and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 0
     and t.tgname in ('io_record_changed_s_i','io_record_changed_s_u','io_record_changed_s_d',
                      'zz_ckl_watch_s_i','zz_ckl_watch_s_u',  -- matrx-real-data:allow live trigger names on custom.record and platform.associations, ordering devices created by applied migrations, not fixture data
                      'zz_w2_containment_association_s_i','zz_w2_containment_association_s_u',  -- matrx-real-data:allow live trigger names on custom.record and platform.associations, ordering devices created by applied migrations, not fixture data
                      'zz_w2a_relation_association_s_i','zz_w2a_relation_association_s_u',  -- matrx-real-data:allow live trigger names on custom.record and platform.associations, ordering devices created by applied migrations, not fixture data
                      'zzz_history_capture_s_i','zzz_history_capture_s_u','zzz_history_capture_s_d',  -- matrx-real-data:allow the live history-capture trigger names on custom.record, created by an applied migration, not fixture data
                      '_gc_assoc_softdelete_s','_gc_assoc_harddelete_s');
  if n <> 0 then raise exception 'RED 1 DID NOT GO RED: % of this lane''s 14 statement-level AFTER triggers survived the inverse', n; end if;

  -- 2  THE BATCHED DOOR IS GONE
  if to_regprocedure('custom.record_write_many(uuid,uuid,jsonb[],uuid[])') is null then
    v_red := v_red + 1;
    raise notice 'RED 2  custom.record_write_many does not exist — a batch of 500 is 500 statements again';
  else
    raise exception 'RED 2 DID NOT GO RED: the batched door is still here';
  end if;
  select count(*) into n from platform.client_callable_door
   where schema_name='custom' and function_name='record_write_many';
  if n <> 0 then raise exception 'RED 2 DID NOT GO RED: the door row outlived the function'; end if;

  -- 3  THE WRITE PATH ASKS THE VISIBILITY LADDER ON EVERY ROW AGAIN
  select pg_get_functiondef(p.oid) into v_txt from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='custom' and p.proname='_record_rule_uses';
  if v_txt not like '%foreach r in array v_validate%'
     and v_txt like '%v_me := custom.query_principal();%' then
    v_red := v_red + 1;
    raise notice 'RED 3  custom._record_rule_uses builds the rule context — custom.effective_level and all — on every row, whether or not a Rule reads it';
  else
    raise exception 'RED 3 DID NOT GO RED: the lazy context survived the inverse';
  end if;

  -- 4  THE REPLANNER CENSUS ON THE WRITE PATH IS NOT EMPTY
  --
  -- 🚨 RE-PINNED, AND THE OLD PIN HID A REAL DEFECT (lane RED-SUITES-3, 2026-09-21). This
  -- clause demanded the NUMBER 20 and got 12, which is the shape of a census ratchet that
  -- names a number measured on one day. Two things were wrong with it.
  --
  -- (a) FIVE of its forty-one roots named nothing: `custom._stamp_actor`, `_stamp_actor_tier`,
  --     `_touch_row`, `_metadata_guard` and `_guard_governance_columns` live in `platform` and
  --     `iam`. `custom.ladder_replanners` walks what a root REACHES, and a name that resolves
  --     to no function reaches nothing — so five trigger functions fired on EVERY write to
  --     `custom.record` were reported clean by never being looked at. Corrected below and in
  --     `writeperf2_green.sql` clause 9. What was behind them is a REAL defect and is written
  --     up in `migrations/campaign/redsuites3_two_helpers_the_write_path_census_could_not_see.sql`.
  --
  -- (b) A COUNT IS THE WRONG ASSERTION HERE. The number moves whenever the write path grows a
  --     root or a peer lane converts a helper, and it moved again the moment (a) was fixed.
  --     What this block actually means is "the helpers this lane converted are back, and they
  --     re-plan on every call", so it names them. Any EXTRA name is reported out loud rather
  --     than failed on, because an extra is a finding for the GREEN suite — which asserts zero
  --     — and never for the twin.
  select array_agg(r.fn order by r.fn) into v_names from custom.ladder_replanners(array[
    'custom.record_write','custom.record_update','custom.io_import_rows',
    'custom._record_rule_uses','custom._value_envelope','custom._resolve_choice_words','custom._derived_fields',
    'custom._record_field_validation','custom._entity_custom_fields_guard','custom._containment_association',
    'custom._relation_associations','custom.io_record_changed','history.record_capture','custom._checklist_watch',
    'custom._pipeline_on_entry','custom._field_type_converts_values','custom._table_owner_stamp',
    'custom._field_class_guard','custom._field_type_parity_guard','custom._unique_rule_holds',
    'custom._work_shape_guard','custom._organization_wall_guard','platform._stamp_actor','platform._stamp_actor_tier',
    'platform._touch_row','platform._metadata_guard','custom._table_shape_guard','custom._rule_shape_guard',
    'custom._rule_topology_guard','custom._merge_field_shape_guard','custom._merge_field_temporal_guard',
    'custom._containment_guard','custom._dated_values_guard','custom._field_shape_guard','custom._field_write_door',
    'custom._promoted_field_cap_guard','custom._workdoors_approval_guard','custom._checklist_step_guard',
    'custom._store_door','iam._guard_governance_columns','platform._gc_entity_associations']) r;
  v_missing := array(select x from unnest(array[
      'custom._checklist_finished','custom._stage_field_key','custom.choice_synonyms',
      'custom.dependency_cycle','custom.dependency_label','custom.portal_admits',
      'custom.record_values','custom.rule_context','custom.rule_field_key','custom.rule_field_label',
      'custom.work_assignment_fields','custom.work_state_id']) x
    where x <> all (coalesce(v_names, '{}'::text[])));
  if array_length(v_missing, 1) is null then
    v_red := v_red + 1;
    raise notice 'RED 4  all twelve helpers this lane converted are back on the write path, each re-planned on every call (census names % in total)', coalesce(array_length(v_names,1), 0);
    if coalesce(array_length(v_names,1), 0) > 12 then
      raise notice 'RED 4  and the census names % more that this lane never converted: % — the GREEN suite''s clause 9 is where that is a failure.',
        array_length(v_names,1) - 12,
        array_to_string(array(select y from unnest(v_names) y where y <> all (array[
          'custom._checklist_finished','custom._stage_field_key','custom.choice_synonyms',
          'custom.dependency_cycle','custom.dependency_label','custom.portal_admits',
          'custom.record_values','custom.rule_context','custom.rule_field_key','custom.rule_field_label',
          'custom.work_assignment_fields','custom.work_state_id'])), ', ');
    end if;
  else
    raise exception 'RED 4 DID NOT GO RED: the inverse was supposed to put these helpers back as non-inlinable SQL and the census does not name them: %. The census names % in total.',
      array_to_string(v_missing, ', '), coalesce(array_length(v_names,1), 0);
  end if;

  -- 5  NO TRANSITION TABLE IS READ ANYWHERE ON custom.record
  -- BY NAME (amended by lane WRITE-PERF-3, 2026-09-21): WRITE-PERF-3's `zz_memo_clear_i` reads a  -- matrx-real-data:allow zz_memo_clear_* is a live trigger name, an ordering device, not data
  -- transition table too, and it is correct and deliberately left standing by this lane's
  -- inverse. What this clause means is that none of THIS lane's fourteen is left.
  select count(*) into n from pg_trigger t
   where t.tgrelid='custom.record'::regclass and not t.tgisinternal
     and (t.tgoldtable is not null or t.tgnewtable is not null)
     and t.tgname in ('io_record_changed_s_i','io_record_changed_s_u','io_record_changed_s_d',
                      'zz_ckl_watch_s_i','zz_ckl_watch_s_u',  -- matrx-real-data:allow live trigger names on custom.record and platform.associations, ordering devices created by applied migrations, not fixture data
                      'zz_w2_containment_association_s_i','zz_w2_containment_association_s_u',  -- matrx-real-data:allow live trigger names on custom.record and platform.associations, ordering devices created by applied migrations, not fixture data
                      'zz_w2a_relation_association_s_i','zz_w2a_relation_association_s_u',  -- matrx-real-data:allow live trigger names on custom.record and platform.associations, ordering devices created by applied migrations, not fixture data
                      'zzz_history_capture_s_i','zzz_history_capture_s_u','zzz_history_capture_s_d',  -- matrx-real-data:allow the live history-capture trigger names on custom.record, created by an applied migration, not fixture data
                      '_gc_assoc_softdelete_s','_gc_assoc_harddelete_s');
  if n = 0 then
    v_red := v_red + 1;
    raise notice 'RED 5  not one trigger on custom.record names a transition table — the statement cannot be seen as a statement';
  else
    raise exception 'RED 5 DID NOT GO RED: % triggers still name a transition table', n;
  end if;

  raise notice '% of % blocks are RED (the defect they assert is back), and the four inverses executed for real', v_red, v_blocks;
end;
$t$;
rollback;

\echo '=== after the rollback, in the same session: the store this lane built is back ==='
select (select count(*) from pg_trigger t
         where t.tgrelid='custom.record'::regclass and not t.tgisinternal
           and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 0) as after_statement_triggers,
       (select count(*) from pg_trigger t
         where t.tgrelid='custom.record'::regclass and not t.tgisinternal
           and (t.tgtype & 2) = 0 and (t.tgtype & 1) = 1) as after_row_triggers,
       to_regprocedure('custom.record_write_many(uuid,uuid,jsonb[],uuid[])') is not null as batched_door_live,
       (select count(*) from custom.ladder_replanners(array[
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
          'custom._store_door','custom._guard_governance_columns','platform._gc_entity_associations'])) as write_path_replanners;
