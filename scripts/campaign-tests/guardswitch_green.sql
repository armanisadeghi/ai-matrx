-- GUARD-SWITCH — THE GREEN SUITE. The store's per-object guards follow the organization's
-- switch, the organization wall is live on the association half, and "who could see this on
-- that day" replays the settings of that day.
--
-- RUN IT (against the MAIN database — this is where the store lives):
--   PSQL="$(pnpm -s exec tsx scripts/lib/psql-path.ts --print)"
--   "$PSQL" "<the five SUPABASE_MATRIX_* values>" -v ON_ERROR_STOP=1 \
--     -f scripts/campaign-tests/guardswitch_green.sql
--
-- IT IS NOT A MIGRATION and never becomes one: it lives outside `migrations/` and is
-- discovered by no sweep.
--
-- WHY REAL TRANSACTIONS AND NOT ONE ROLLED-BACK BLOCK (VIS-2's reason, unchanged): history
-- stamps every row with the TRANSACTION timestamp, so inside one transaction a knob's old
-- value and its new value share a moment to the microsecond and there is no "between" to ask
-- about — which is the whole of PART 3. So this runs REAL transactions against two THROWAWAY
-- organizations with fixed ids and deletes them at the end. Step 0 deletes them FIRST as
-- well, so a run that died half way leaves nothing for the next one, and the last block is a
-- CENSUS that fails unless every trace is gone.
--
-- THE IDENTITIES. `admin@admin.com` owns both throwaway organizations; `test@test.com` (Dana)
-- is a plain MEMBER of the first. Nobody's own records are touched.
--
-- ITS RED TWIN is `guardswitch_red.sql`.

\set ON_ERROR_STOP on
\timing off

\set ORG_A '\'9a5d0000-0000-4a00-8a00-000000000a01\''
\set ORG_B '\'9a5d0000-0000-4a00-8a00-000000000b01\''
\set ADMIN '\'87a6e699-3622-4869-8843-d0867456c0dd\''
\set DANA  '\'4060701e-706a-4c76-b3ca-0bbc69fa5a14\''

-- ════════════════════════════════════════════════════ STEP 0 — a clean slate, both ways
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG_A, :ORG_B));
delete from platform.associations where organization_id in (:ORG_A, :ORG_B);
delete from custom.record where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_outbox where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_comment where organization_id in (:ORG_A, :ORG_B);
delete from custom.record_alias where organization_id in (:ORG_A, :ORG_B);
delete from custom.merge_field_provenance where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_link where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_source where organization_id in (:ORG_A, :ORG_B);
delete from custom.visibility_epoch where organization_id in (:ORG_A, :ORG_B);
delete from custom.organization_visibility_version where organization_id in (:ORG_A, :ORG_B);
delete from history.migration_log where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override where organization_id in (:ORG_A, :ORG_B);
delete from iam.memberships where organization_id in (:ORG_A, :ORG_B);
delete from iam.organizations where id in (:ORG_A, :ORG_B);

insert into iam.organizations (id, name, slug, abbreviation, created_by)
values (:ORG_A, 'GUARD-SWITCH Throwaway A', 'guardswitch-throwaway-a', 'GSA', :ADMIN),
       (:ORG_B, 'GUARD-SWITCH Throwaway B', 'guardswitch-throwaway-b', 'GSB', :ADMIN);
insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
values (:ORG_A, 'organization', :ORG_A, :ADMIN, 'owner',  'active'),
       (:ORG_A, 'organization', :ORG_A, :DANA,  'member', 'active'),
       (:ORG_B, 'organization', :ORG_B, :ADMIN, 'owner',  'active');
commit;


-- ═════════════ PART 1 — EVERY PER-OBJECT GUARD IN THE STORE FOLLOWS THE ORGANIZATION'S SWITCH
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '9a5d0000-0000-4a00-8a00-000000000b01';
  v_keys constant text[] := array['associations_guard', 'entity_custom_fields_guard',
                                  'row_versions_guard', 'field_index_guard'];
  v_k text;
  v_n integer;
  v_left text;
begin
  -- 1a — WITH THE STORE OFF, NOTHING MOVED. This is the whole safety claim of the change.
  if custom.store_is_open(v_a) then
    raise exception '1a FAILED — a fresh organization already reads as on the store.'; end if;
  if platform.relations_are_on(v_a) then
    raise exception '1a FAILED — relations read ON for an organization whose store is off.'; end if;

  -- 1b — THE SWITCH, AND IT IS THE ONLY ONE. Before this lane, no rung anywhere could make
  -- platform.relations_are_on answer true: custom/associations_guard was false platform-wide
  -- with overridable_by = {}, which is an outage with a name rather than a switch.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'system_enabled', 'organization', v_a, v_a, 'true'::jsonb);
  if not custom.store_is_open(v_a) then
    raise exception '1b FAILED — the store switch did not take for organization A.'; end if;
  if not platform.relations_are_on(v_a) then
    raise exception '1b FAILED — the store is on for A and relations still read off.'; end if;
  if platform.relations_are_on(v_b) then
    raise exception '1b FAILED — turning A on turned B on as well; the rung is not per organization.'; end if;
  -- and the door that stands in front of the surface agrees
  perform platform.assert_relations_door(v_a);
  begin
    -- B's store is off, so B reaches the surface only as the role that OWNS it. This suite
    -- runs as that role, so the door correctly returns — what is asserted here is the KNOB,
    -- not the role.
    if platform.relations_are_on(v_b) then
      raise exception '1b FAILED — B reads on.'; end if;
  end;

  -- 1c — THE CLASS, NOT THE INSTANCE. Every knob this lane retired is read by NOTHING. A
  -- catalogue query, so a body that quietly kept its old read cannot pass.
  foreach v_k in array v_keys loop
    select count(*) into v_n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where p.prosrc like '%knob_resolve(''custom'', ''' || v_k || '''%'
        or p.prosrc like '%knob_resolve(''custom'',''' || v_k || '''%';
    if v_n > 0 then
      select string_agg(n.nspname || '.' || p.proname, ', ') into v_left
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosrc like '%knob_resolve(''custom'', ''' || v_k || '''%'
          or p.prosrc like '%knob_resolve(''custom'',''' || v_k || '''%';
      raise exception '1c FAILED — custom/% is retired and % function(s) still read it: %', v_k, v_n, v_left;
    end if;
  end loop;

  -- 1d — and the retired rows SAY they are retired, so the settings screen does not lie.
  select count(*) into v_n from platform.feature_knob
   where feature = 'custom' and key = any (v_keys) and label like 'Retired:%';
  if v_n <> array_length(v_keys, 1) then
    raise exception '1d FAILED — % of % retired guard knobs carry a Retired label.', v_n, array_length(v_keys, 1); end if;

  -- 1e — THE CENSUS OF WHAT IS LEFT, and it is a fixed list with a reason each (see
  -- guardswitch_the_store_switch_is_the_only_switch.sql). A NEW platform-wide custom/*_guard
  -- appearing with no organization rung is a defect this assertion catches on the next run.
  select string_agg(key, ', ' order by key) , count(*) into v_left, v_n
    from platform.feature_knob
   where feature = 'custom' and key like '%\_guard' and overridable_by = '{}'::text[]
     and not (key = any (v_keys));
  if coalesce(v_left, '') <> 'accessible_entity_ids_guard, emergency_door_guard, entity_types_guard, signup_provisioning_guard' then
    raise exception '1e FAILED — the census of platform-wide guards that stay platform-wide has changed: %', coalesce(v_left, '(none)'); end if;

  raise notice 'PART 1 PASSED (1a off is off, 1b the store switch is the only switch, 1c nothing reads the four retired guards, 1d they say so, 1e the four that stay are the four declared)';
end $t$;
commit;


-- ═════════════════ PART 2 — THE ASSOCIATION HALF OF THE ORGANIZATION WALL IS LIVE (VIS-34)
--
-- VIS-2 proved the wall on the RELATION RECORD (`custom.assert_organization_wall`, always
-- live) and recorded that the ASSOCIATION half — `platform.enforce_relation_edge` on
-- `platform.associations` — was dark for every organization, because it is gated on
-- `platform.relations_are_on` and that read `custom/associations_guard`. It follows the
-- organization's own store switch now, so this part asks that half directly, in an
-- organization whose store is ON.
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '9a5d0000-0000-4a00-8a00-000000000b01';
  v_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_korg constant uuid := '11111111-0000-4000-8000-000000000004';
  v_tbl_a uuid; v_tbl_b uuid;
  v_rec_a uuid; v_rec_b uuid; v_fld uuid;
  v_hq_a uuid; v_hq_b uuid;
begin
  -- REC-1: a Table lives somewhere, so each organization gets its Home first.
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_a, v_korg, 'record', jsonb_build_object('name', 'GUARD-SWITCH HQ A'), v_admin)
  returning id into v_hq_a;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_b, v_korg, 'record', jsonb_build_object('name', 'GUARD-SWITCH HQ B'), v_admin)
  returning id into v_hq_b;

  v_tbl_a := custom.table_declare(v_a, jsonb_build_object(
    'name', 'Case', 'slug', 'gs_case', 'label_singular', 'Case', 'label_plural', 'Cases',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text'),
                                jsonb_build_object('name', 'supplier', 'kind', 'relation')),
    'title_field', 'title', 'parent_id', v_hq_a::text));
  v_tbl_b := custom.table_declare(v_b, jsonb_build_object(
    'name', 'Supplier', 'slug', 'gs_supplier', 'label_singular', 'Supplier', 'label_plural', 'Suppliers',
    'type', 'entity', 'display', 'list', 'ordered', false, 'weight', 'light', 'retention_days', 30,
    'default_sort', '[]'::jsonb, 'row_order', 'sorted', 'agent_writable', true,
    'fields', jsonb_build_array(jsonb_build_object('name', 'title', 'kind', 'text')),
    'title_field', 'title', 'parent_id', v_hq_b::text));

  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_a, v_tbl_a, 'record', jsonb_build_object('title', 'GS Case 1'), v_admin)
  returning id into v_rec_a;
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_b, v_tbl_b, 'record', jsonb_build_object('title', 'Acme Ltd'), v_admin)
  returning id into v_rec_b;

  -- The relation FIELD in A. `target_mode: any` on purpose: REL-8 is not what this part is
  -- about, and a polymorphic relation is the widest possible declaration — so anything that
  -- refuses below is the WALL refusing, never the target list.
  insert into custom.record (organization_id, table_id, data_class, data, created_by)
  values (v_a, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'supplier', 'label', 'Supplier', 'sort', 10, 'type', 'relation',
    'multi', false, 'dated', false, 'required', false, 'source', 'manual',
    'config', jsonb_build_object('target_mode', 'any'),
    -- FLD-13's shape guard wants the declared target whatever the mode says; `target_mode: any`
    -- is what platform.relation_declaration actually reads, and it makes REL-8 not a question.
    'relation_target', v_tbl_a::text, 'relation_max', 5, 'on_target_delete', 'set_null',
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb, 'source_config', '{}'::jsonb,
    'sensitivity', 'internal', 'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_tbl_a::text), v_admin)
  returning id into v_fld;

  -- 2a — THE EDGE THE SWITCH USED TO WAVE THROUGH. Nothing has opened the wall, so it is
  -- refused. Before GUARD-SWITCH this insert SUCCEEDED for every organization on earth,
  -- because gate two of platform.enforce_relation_edge returned NEW untouched.
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);
    raise exception '2a FAILED — a relation edge into another organization was accepted with nothing allowing it.';
  exception when foreign_key_violation then null;
  end;

  -- 2b — the Table the relation STARTS at allows it, and it is STILL refused: one
  --      organization's flag is not consent from the other (VIS-34).
  update custom.record set data = data || jsonb_build_object('cross_organization_relations', true)
   where organization_id = v_a and id = v_tbl_a;
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);
    raise exception '2b FAILED — the source Table''s flag alone opened the wall; the other organization was never asked.';
  exception when foreign_key_violation then null;
  end;

  -- 2c — A says yes. B has not been asked. Still refused.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'cross_organization_links', 'organization', v_a, v_a, 'true'::jsonb);
  if custom.cross_organization_links_open(v_a, v_b) then
    raise exception '2c FAILED — one organization''s knob opened the wall on its own.'; end if;
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);
    raise exception '2c FAILED — one organization''s knob alone let the link through.';
  exception when foreign_key_violation then null;
  end;

  -- 2d — BOTH organizations opted in, and the link is made.
  insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value)
  values ('custom', 'cross_organization_links', 'organization', v_b, v_b, 'true'::jsonb);
  if not custom.cross_organization_links_open(v_a, v_b) then
    raise exception '2d FAILED — both organizations said yes and the wall still reads shut.'; end if;
  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
  values ('record', v_rec_a, 'record', v_rec_b, v_a, 'supplier', v_fld, 'campaign', v_admin);

  -- 2e — AND THE REST OF THE CONTRACT CAME ALIVE WITH IT, which is how we know gate two is
  --      really open rather than the wall being enforced somewhere else. REL-10: the edge's
  --      `role` IS the field's key or the edge belongs to no field.
  begin
    insert into platform.associations
      (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
    values ('record', v_rec_a, 'record', v_rec_b, v_a, 'vendor', v_fld, 'campaign', v_admin);
    raise exception '2e FAILED — an edge whose role does not match its field was accepted (REL-10 is not running).';
  exception when check_violation then null;
  end;

  -- 2f — THE SWITCH IS THE SWITCH. Turn A's store off and the same wrong-role edge is waved
  --      through untouched: that is the state every organization was in before this lane, and
  --      it is now reachable only by switching the store off on purpose.
  update platform.knob_override set value = 'false'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_a;
  if platform.relations_are_on(v_a) then
    raise exception '2f FAILED — the store was switched off and relations still read on.'; end if;
  insert into platform.associations
    (source_type, source_id, target_type, target_id, organization_id, role, relation_field_id, origin, created_by)
  values ('record', v_rec_a, 'record', v_rec_b, v_a, 'vendor', v_fld, 'campaign', v_admin);
  delete from platform.associations where organization_id = v_a and role = 'vendor';
  update platform.knob_override set value = 'true'::jsonb
   where feature = 'custom' and key = 'system_enabled' and organization_id = v_a;

  raise notice 'PART 2 PASSED (2a refused, 2b the table alone is not enough, 2c one side is not both, 2d both opted in and the link was made, 2e the rest of the relation contract is live too, 2f and it all goes dark again when the store is switched off)';
end $t$;
commit;


-- ═══════════════ PART 3 — THE KNOB REGISTRY KEEPS HISTORY, AND THE AS-OF DOOR READS IT
-- Separate transactions on purpose: history stamps the TRANSACTION timestamp, so the "before"
-- and the "after" of a knob change have to be in two of them or there is no between.
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_open timestamptz;
  v_val jsonb; v_rep boolean;
begin
  -- 3a — the two windows are open, so a replay can tell "it did not change" from "nobody was
  --      watching". Before this lane neither existed.
  select w.opened_at into v_open from history.capture_window w where w.entity_type = 'platform.feature_knob';
  if v_open is null then raise exception '3a FAILED — no capture window for platform.feature_knob.'; end if;
  if not exists (select 1 from history.capture_window where entity_type = 'platform.knob_override') then
    raise exception '3a FAILED — no capture window for platform.knob_override.'; end if;

  -- 3b — the BACKFILL claims only today. A moment before the window answers today's value and
  --      says replayed = false rather than inventing what the knob used to say.
  select k.value, k.replayed into v_val, v_rep
    from platform.knob_value_as_of('custom', 'member_default_visibility', v_a, v_open - interval '1 day') k;
  if v_rep then raise exception '3b FAILED — a moment before the settings history began came back as a replay.'; end if;
  if v_val #>> '{}' is distinct from 'all_records' then
    raise exception '3b FAILED — the un-replayed answer is not the live one (%).', v_val; end if;
  raise notice 'PART 3a/3b PASSED (both windows open; before the window it says replayed = false and hands back today''s value)';
end $t$;
commit;

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
-- THE CHANGE: this organization decides that membership alone shows nothing (VIS-33).
insert into platform.knob_override (feature, key, scope_kind, scope_id, organization_id, value, set_note)
values ('custom', 'member_default_visibility', 'organization',
        :ORG_A, :ORG_A, '"shared_only"'::jsonb, 'GUARD-SWITCH green suite');
commit;

begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_dana constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_changed timestamptz;
  v_before  timestamptz;
  v_val jsonb; v_rep boolean;
  v_rec uuid;
  r record;
  v_seen_before boolean := false;
  v_seen_after  boolean := false;
  v_rep_before  boolean;
begin
  -- 3c — THE CHANGE IS ON THE RECORD, in history, written in the same transaction as the knob.
  select h.occurred_at into v_changed
    from history.row_versions h
   where h.entity_type = 'platform.knob_override'
     and h.row_id = platform.knob_history_row_id('custom', 'member_default_visibility', 'organization', v_a)
   order by h.occurred_at desc, h.id desc limit 1;
  if v_changed is null then
    raise exception '3c FAILED — the knob was written and the settings history has no row for it.'; end if;
  v_before := v_changed - interval '1 millisecond';

  -- 3d — ASKED BEFORE THE CHANGE, IT ANSWERS WHAT THE KNOB SAID THEN — replayed, not today's.
  select k.value, k.replayed into v_val, v_rep
    from platform.knob_value_as_of('custom', 'member_default_visibility', v_a, v_before) k;
  if not v_rep then raise exception '3d FAILED — the moment before the change was not a replay.'; end if;
  if v_val #>> '{}' is distinct from 'all_records' then
    raise exception '3d FAILED — before the change this organization read %, not all_records.', v_val; end if;

  select k.value, k.replayed into v_val, v_rep
    from platform.knob_value_as_of('custom', 'member_default_visibility', v_a, v_changed) k;
  if not v_rep then raise exception '3d FAILED — the moment of the change was not a replay.'; end if;
  if v_val #>> '{}' is distinct from 'shared_only' then
    raise exception '3d FAILED — after the change this organization reads %, not shared_only.', v_val; end if;

  -- 3e — AND THE AUDIT DOOR READS IT. "Who could see this on that day" answers Dana for the
  --      moment BEFORE the change and not for the moment after, and marks the row REPLAYED —
  --      which VIS-2 recorded it could not do, because the registry kept no history.
  select r2.id into v_rec from custom.record r2
   where r2.organization_id = v_a and r2.data_class = 'record' and r2.data ->> 'title' = 'GS Case 1';
  if v_rec is null then raise exception '3e FAILED — the fixture record is gone.'; end if;

  for r in select * from custom.visibility_as_of(v_a, v_rec, v_before) loop
    if r.principal_kind = 'user' and r.principal_id = v_dana and r.through_kind = 'organization' then
      v_seen_before := true; v_rep_before := r.replayed;
    end if;
  end loop;
  if not v_seen_before then
    raise exception '3e FAILED — before the change, membership alone reached every record and Dana is not in the answer.'; end if;
  if not v_rep_before then
    raise exception '3e FAILED — the membership row still says replayed = false; the door is not reading the settings history.'; end if;

  for r in select * from custom.visibility_as_of(v_a, v_rec, v_changed) loop
    if r.principal_kind = 'user' and r.principal_id = v_dana and r.through_kind = 'organization' then
      v_seen_after := true;
    end if;
  end loop;
  if v_seen_after then
    raise exception '3e FAILED — after the organization said "only what is shared", Dana is still listed by membership.'; end if;

  raise notice 'PART 3 PASSED (3c the knob write recorded itself, 3d the value before and after replayed, 3e the audit door answers with the settings OF THAT DAY and marks the row replayed)';
end $t$;
commit;


-- ════════════════════════════════ TEARDOWN — and a CENSUS that fails unless it is complete
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
select set_config('app.actor_system', 'guardswitch_green_suite', true);
delete from iam.permissions where resource_type = 'record'
   and resource_id in (select id from custom.record where organization_id in (:ORG_A, :ORG_B));
delete from platform.associations where organization_id in (:ORG_A, :ORG_B);
delete from custom.record where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_outbox where organization_id in (:ORG_A, :ORG_B);
delete from custom.io_comment where organization_id in (:ORG_A, :ORG_B);
delete from custom.record_alias where organization_id in (:ORG_A, :ORG_B);
delete from custom.merge_field_provenance where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_link where organization_id in (:ORG_A, :ORG_B);
delete from custom.external_source where organization_id in (:ORG_A, :ORG_B);
delete from custom.visibility_epoch where organization_id in (:ORG_A, :ORG_B);
delete from custom.organization_visibility_version where organization_id in (:ORG_A, :ORG_B);
delete from history.migration_log where organization_id in (:ORG_A, :ORG_B);
-- The history this run wrote, including the knob history this lane added: a suite that leaves
-- rows behind in the store it is testing is a suite that changes the next run's answer.
delete from history.row_versions where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override where organization_id in (:ORG_A, :ORG_B);
delete from platform.knob_override_audit where organization_id in (:ORG_A, :ORG_B);
delete from iam.memberships where organization_id in (:ORG_A, :ORG_B);
delete from iam.organizations where id in (:ORG_A, :ORG_B);
commit;

-- A SECOND PASS, IN ITS OWN TRANSACTION, and it is not belt-and-braces. The deletes above are
-- themselves recorded: `platform._version_capture` writes a DELETE version for every record
-- and membership removed, and this lane's own `platform._knob_history_capture` writes one for
-- every override cleared. Those rows are written INSIDE the transaction that did the deleting,
-- so a history delete in that same transaction cannot see them. Census zero means zero.
begin;
set local statement_timeout = '300s';
set local lock_timeout = '20s';
delete from history.row_versions where organization_id in (:ORG_A, :ORG_B);
commit;

do $t$
declare
  v_a constant uuid := '9a5d0000-0000-4a00-8a00-000000000a01';
  v_b constant uuid := '9a5d0000-0000-4a00-8a00-000000000b01';
  v_n bigint;
begin
  select (select count(*) from iam.organizations where id in (v_a, v_b))
       + (select count(*) from iam.memberships where organization_id in (v_a, v_b))
       + (select count(*) from custom.record where organization_id in (v_a, v_b))
       + (select count(*) from platform.associations where organization_id in (v_a, v_b))
       + (select count(*) from platform.knob_override where organization_id in (v_a, v_b))
       + (select count(*) from history.row_versions where organization_id in (v_a, v_b))
    into v_n;
  if v_n <> 0 then
    raise exception 'TEARDOWN FAILED — % row(s) of this suite''s throwaway organizations are still here.', v_n; end if;
  raise notice 'TEARDOWN PASSED — census zero';
  raise notice 'ALL PARTS PASSED';
end $t$;
