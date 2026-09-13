-- platform_base_contract_dd173_batch7_mis_variant_components — DD-173 BATCH 7 (3 tokens).
--
-- THE THREE: `tool_binding` (tool.binding), `file_rag_job` (files.file_rag_jobs) and
-- `scope_dataset_instance` (context.scope_dataset_instances) — three tables registered with a
-- variant that is not what they are. B-65 held them back rather than generate them, and named
-- `tool_binding` as the reason the whole set had to wait: generating it under its REGISTERED
-- `system` variant replaces a real user write lane with a staff-only one.
--
-- 🚨 THE VARIANT IS CORRECTED IN THE REGISTRY FIRST, FROM THE DATA AND THE CALLERS.
--
--   `tool_binding` (registered `system`, corrected to `component` of `tool` via `tool_id`)
--     Its live j_insert / j_update / j_delete are `iam.has_access('tool', tool_id, 'editor')`:
--     WHOEVER MAY EDIT A TOOL MAY BIND IT TO AN EXECUTOR. That is a user write, and the `system`
--     variant's write lane is platform staff only — generating as registered would have taken the
--     capability away silently, and a read-only access probe would not even have seen it. The
--     table has no id, no own owner and no own visibility; its PK is (tool_id, executor_name) and
--     every one of its four live policies derives from the parent tool. THE COMPONENT OWNERSHIP
--     LAW (§6d-1) describes exactly this table.
--
--   `file_rag_job` (registered `entity`, corrected to `component` of `file` via `file_id`)
--     Its read lane is already `iam.has_access('file', file_id, 'viewer')` — the job's access IS
--     the file's. It carries `user_id` (who triggered the run) but that is an ACTOR, not an owner:
--     the row belongs to the file. `organization_id` is already NOT NULL and already the file's
--     organization, so the org strategy here is `keep`.
--
--   `scope_dataset_instance` (registered `entity`, corrected to `component` of `scope` via
--     `scope_id`) — a dataset instance materialized INTO a scope. No owner column, no visibility,
--     no client lane today (platform-admin permissive + two restrictive walls). Its organization
--     is the scope's.
--
-- 🚨 THE COMPOSITION EDGE IS PART OF THE CORRECTION. `iam._apply_rls_unchecked` reads a
--    component's parents out of `platform.entity_relationships` and REFUSES a component with no
--    composition row ('component % has no composition parent'). A variant correction without the
--    edge is a half-correction that fails at generation time, so both land in this transaction.
--
-- The named org strategy, the re-read bespoke superset, the one-transaction gate, the UNPROVEN
-- resolution and the guard acknowledgement are batch 1's shape and are documented there.
-- 🚨 NUMBERING. This is batch SEVEN: `platform_base_contract_dd173_batch6_confidential_system_dd185`
--    (lane B-77) took batch six an hour earlier. Its prerequisite,
--    `tool_binding_writers_supply_organization_dd173`, was written and APPLIED before that collision
--    was noticed, so its header still says "batch 6"; its bytes are ledgered and are not re-edited
--    to fix a word (B-65's lesson: an applied file's checksum is the record of what ran).
set local lock_timeout = '20s';

do $dd173b7$
declare
  v_as         timestamptz := now();
  v_before     uuid; v_after uuid; r record;
  v_unapproved text[] := '{}';
  v_unapproven_hard text[] := '{}';
  v_unproven_ok text[] := '{}';
  v_narrower   text[] := '{}';
  v_total      bigint;
  v_res        text;
  v_live       text[]; v_extra text[]; v_drop text[];
  v_policy_fail text[] := '{}'; v_base_fail text[] := '{}';
  f text; v record;
  v_acked      bigint;
  v_policy_checks constant text[] := array[
    'policies_canonical','bespoke_policy_present','privacy_wall','personal_row_wall',
    'rls_enabled','anon_public_lane','class_lanes','component_anon_lane',
    'policy_system_public_read','pub_read_anon','component_public_read',
    'component_not_wider_than_parent','containment_respects_personal'];
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- platform admin, info@aimatrx.com
    '87a6e699-3622-4869-8843-d0867456c0dd',  -- platform admin, admin@admin.com (the testing identity)
    'a4955b5c-d524-4d72-a90e-0658d5d51148',  -- developer111@pixelium.uk: a NON-admin with real rows elsewhere
    'c5e92166-e148-4e73-926e-83af0c453665',  -- seo@titaniumsuccess.com: a plain member of a real organization
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- arman@titaniumsuccess.com: admin of that organization, NOT platform staff
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- test@test.com: a non-member
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['tool_binding','file_rag_job','scope_dataset_instance'];
  v_bespoke constant text[] := array[
    'tool_binding|cfg_select_via_definition,j_delete,j_insert,j_select,j_update',
    'file_rag_job|cld_file_rag_jobs_owner_select,file_rag_jobs_grant_read',
    'scope_dataset_instance|platform_admin_only,scope_dataset_instances_internal_only'];
  -- A WIDENING IS APPROVED BY NAME OR IT IS A FAILURE. 'token|principal'.
  v_approved constant text[] := '{}';
  v_tok text; v_sch text; v_tbl text; v_names text[];
  -- The WRITE gate (see section 0b). A read probe cannot see a write disappear.
  v_ptool   uuid;
  v_porg    uuid;
  v_owner_before boolean; v_owner_after boolean;
  v_other_before boolean; v_other_after boolean;
  v_tester constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';  -- test@test.com, NOT a platform admin
  v_other  constant uuid := 'a4955b5c-d524-4d72-a90e-0658d5d51148';  -- developer111@pixelium.uk
begin
  -- ═══════ 0. THE REGISTRY CORRECTION, with its reason stored in the row ═══════════════════════
  update platform.entity_types et set
    rls_variant = 'component', is_component = true,
    data_class = null, default_list_scope = null,
    data_class_reason = concat_ws(' ', et.data_class_reason,
      '[DD-173 B-83, 2026-09-13] data_class public CLEARED with the variant correction: entity_types_class_scope_ck requires a component to carry no class and no list scope, because a component has no access of its own — it inherits the parent tool''s (db-rules 6d-1).'),
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] rls_variant system -> component. The live j_insert/j_update/j_delete are iam.has_access(''tool'', tool_id, ''editor''): whoever may edit a tool may bind it to an executor. The system variant''s write lane is platform staff only, so generating as registered would have removed that user write in silence. The table has no id, no owner column and no visibility; its PK is (tool_id, executor_name) and all four live policies derive from the parent tool — THE COMPONENT OWNERSHIP LAW (db-rules 6d-1).')
   where et.token = 'tool_binding' and et.is_active;

  update platform.entity_types et set
    rls_variant = 'component', is_component = true,
    data_class = null, default_list_scope = null,
    data_class_reason = concat_ws(' ', et.data_class_reason,
      '[DD-173 B-83, 2026-09-13] data_class confidential CLEARED with the variant correction: a component carries no class and no list scope (entity_types_class_scope_ck); the job''s access is the file''s.'),
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] rls_variant entity -> component of file via file_id. Its live read lane is already iam.has_access(''file'', file_id, ''viewer''): the job''s access IS the file''s. user_id records who triggered the run (an actor, not an owner — db-rules 6d-1), and organization_id is already the file''s organization and already NOT NULL.')
   where et.token = 'file_rag_job' and et.is_active;

  update platform.entity_types et set
    rls_variant = 'component', is_component = true,
    data_class = null, default_list_scope = null,
    data_class_reason = concat_ws(' ', et.data_class_reason,
      '[DD-173 B-83, 2026-09-13] data_class confidential CLEARED with the variant correction: a component carries no class and no list scope (entity_types_class_scope_ck); the instance''s access is the scope''s.'),
    notes = concat_ws(' ', et.notes,
      '[DD-173 B-83, 2026-09-13] rls_variant entity -> component of scope via scope_id. A dataset instance materialized into a scope: no owner column, no visibility, no client lane. Its organization is the scope''s.')
   where et.token = 'scope_dataset_instance' and et.is_active;

  insert into platform.entity_relationships (child_type, parent_type, fk_column, kind, note) values
    ('tool_binding','tool','tool_id','composition',
     'DD-173 B-83: the composition edge iam._apply_rls_unchecked reads to build the component lanes. Without it the generator refuses the token outright.'),
    ('file_rag_job','file','file_id','composition',
     'DD-173 B-83: the composition edge; the pre-existing bespoke read lane was already this edge written by hand.'),
    ('scope_dataset_instance','scope','scope_id','composition',
     'DD-173 B-83: the composition edge; a dataset instance belongs to the scope it was materialized into.')
  on conflict do nothing;

  -- ═══════ 0b. THE WRITE GATE, BEFORE HALF ═══════════════════════════════════════════════════
  -- B-65 held `tool_binding` back because generating it under its REGISTERED `system` variant
  -- would have replaced `iam.has_access('tool', tool_id, 'editor')` — whoever may edit a tool may
  -- bind it — with a staff-only write lane. A READ-ONLY access probe cannot see a write
  -- disappear, so the write is measured here the same way the reads are: the SAME two identities
  -- attempt the SAME insert before and after, and the verdicts must match. A disposable tool owned
  -- by test@test.com carries the probe; it is deleted at the end of this file either way.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_tester::text, 'role', 'authenticated')::text, true);
  insert into tool.definition (name, description, parameters, organization_id, visibility, created_by)
  select 'b83_dd173_write_probe_' || substr(md5(random()::text),1,8),
         'DD-173 B-83 disposable write-probe tool. Deleted before this migration commits.',
         '{}'::jsonb, d.organization_id, 'personal'::platform.visibility, v_tester
    from tool.definition d where d.organization_id is not null limit 1
  returning id into v_ptool;
  perform set_config('request.jwt.claims', null, true);

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_tester::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into tool.binding (tool_id, executor_name) values (v_ptool, 'aidream');
    v_owner_before := true;
    execute 'reset role';
  exception when others then
    v_owner_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from tool.binding where tool_id = v_ptool;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into tool.binding (tool_id, executor_name) values (v_ptool, 'matrx-user');
    v_other_before := true;
    execute 'reset role';
  exception when others then
    v_other_before := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from tool.binding where tool_id = v_ptool;
  raise notice 'dd173b7: write gate BEFORE — owner(test@test.com) can insert a binding: %; a user with no rights on that tool: %',
    v_owner_before, v_other_before;

  -- ═══════ 1. THE BEFORE, pinned to this transaction's instant ═════════════════════════════════
  v_before := iam.access_delta_snapshot('DD-173 b7 BEFORE', v_principals, v_tokens, 400000,
    'DD-173 batch 7: three mis-variant tokens corrected to component, before the retrofit and generation', v_as);
  raise notice 'dd173b7: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  -- ═══════ 2. THE BASE RETROFIT, per token, through the one path ═══════════════════════════════
  v_res := platform.retrofit_entity('tool','binding','tool_binding','parent', null, null, 'tool.definition','tool_id', null, null);
  raise notice 'dd173b7: %', v_res;
  v_res := platform.retrofit_entity('files','file_rag_jobs','file_rag_job','keep', null, null, null, null, null, null);
  raise notice 'dd173b7: %', v_res;
  v_res := platform.retrofit_entity('context','scope_dataset_instances','scope_dataset_instance','parent', null, null, 'context.scopes','scope_id', null, null);
  raise notice 'dd173b7: %', v_res;

  -- ═══════ 3. SUPERSEDE BY NAME, then GENERATE, one pass per token ═════════════════════════════
  foreach f in array v_bespoke loop
    v_tok   := split_part(f, '|', 1);
    v_names := array_remove(string_to_array(split_part(f, '|', 2), ','), '');
    select et.schema_name, et.table_name into v_sch, v_tbl
      from platform.entity_types et where et.token = v_tok and et.is_active;

    select coalesce(array_agg(pol.polname order by pol.polname), '{}') into v_live
      from pg_policy pol
     where pol.polrelid = format('%I.%I', v_sch, v_tbl)::regclass
       and not (pol.polname = any (iam.generated_policy_names()));
    v_extra := array(select unnest(v_live) except select unnest(v_names));
    if v_extra <> '{}' then
      raise exception
        'dd173b7: %.% carries hand-written policy/policies % that this file has never seen. Nothing was dropped. A policy nobody enumerated is not superseded on a guess — re-census and re-write this file.',
        v_sch, v_tbl, array_to_string(v_extra, ', ');
    end if;
    v_drop := array(select unnest(v_names) intersect select unnest(v_live));
    if cardinality(v_drop) > 0 then
      perform iam.supersede_bespoke_policies(v_sch, v_tbl, v_drop, format(
        'DD-173 batch 7 (B-83): %s was registered with the wrong rls_variant and is corrected to `component` in this same transaction. Its hand-written policies ARE the component shape written by hand (parent-derived read and, for tool_binding, parent-editor write); they are superseded by the generated component set iam.apply_rls emits from platform.entity_relationships. Kept unsuperseded the two regimes would OR together and leave the table wider than either intended.',
        v_tok));
    end if;
    perform iam.apply_rls(v_sch, v_tbl, v_tok, 'component');
    raise notice 'dd173b7: generated % (%.%) as component, superseding % of % declared bespoke name(s)',
      v_tok, v_sch, v_tbl, cardinality(v_drop), cardinality(v_names);
  end loop;


  -- ═══════ 3b. THE WRITE GATE, AFTER HALF — the verdicts must MATCH the before half ══════════
  select d.organization_id into v_porg from tool.definition d where d.id = v_ptool;
  -- DD-154's contract: the WRITER names the organization. `organization_id` is now NOT NULL on
  -- tool.binding, so both attempts supply the row's own parent tool's organization — the same one
  -- this file's backfill wrote, and the only one a binding can honestly belong to.
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_tester::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    -- 🚨 VALUES, not INSERT ... SELECT. An `insert ... select ... from tool.definition` run as the
    -- impersonated role reads tool.definition through THAT role's RLS: a user who cannot see the
    -- parent tool selects zero rows, inserts zero rows, and raises nothing — so a refusal would
    -- have been recorded as a success. The organization is resolved ABOVE, as this migration's own
    -- role, and typed into the statement the way a real writer types it (DD-154).
    insert into tool.binding (tool_id, executor_name, organization_id) values (v_ptool, 'aidream', v_porg);
    v_owner_after := true;
    execute 'reset role';
  exception when others then
    v_owner_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from tool.binding where tool_id = v_ptool;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    insert into tool.binding (tool_id, executor_name, organization_id) values (v_ptool, 'matrx-user', v_porg);
    v_other_after := true;
    execute 'reset role';
  exception when others then
    v_other_after := false;
    begin execute 'reset role'; exception when others then null; end;
  end;
  perform set_config('request.jwt.claims', null, true);
  delete from tool.binding where tool_id = v_ptool;

  if not v_owner_before then
    raise exception
      'dd173b7: the write gate proves nothing — the tool OWNER could not insert a binding even BEFORE this file ran. Re-write the probe before trusting its after half.';
  end if;
  if v_owner_after is distinct from v_owner_before then
    raise exception
      'dd173b7: THE USER WRITE MOVED. test@test.com owns tool % and could insert a tool.binding row before this file (%); after the component generation: %. That is exactly the capability B-65 held this token back to protect. Nothing ships.',
      v_ptool, v_owner_before, v_owner_after;
  end if;
  if v_other_after is distinct from v_other_before then
    raise exception
      'dd173b7: THE WRITE LANE MOVED for a user with no rights on tool %: before %, after %. Over-opening and over-tightening are the same class of defect.',
      v_ptool, v_other_before, v_other_after;
  end if;
  raise notice 'dd173b7: write gate AFTER — owner %, other % — IDENTICAL to the before half. The user write lane tool_binding was held back over is intact.',
    v_owner_after, v_other_after;

  -- THE OTHER WRITE PATH: the four SECURITY DEFINER writers of tool.binding, rewritten to name the
  -- organization in `tool_binding_writers_supply_organization_dd173`. Exercised through the real
  -- RPC so the rewrite and the NOT NULL column are proven to agree.
  declare v_rpc uuid;
  begin
    -- The provenance guard on tool.definition refuses a code-actor write that names no system.
    perform set_config('app.actor_system', 'dd173-b83-migration', true);
    -- tool_register types no organization on tool.definition either: it relies on the caller's
    -- context, so the probe supplies one by acting as test@test.com.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_tester::text, 'role', 'authenticated')::text, true);
    v_rpc := public.tool_register(
      jsonb_build_object('name', 'b83_dd173_rpc_probe_' || substr(md5(random()::text),1,8),
                         'description', 'DD-173 B-83 disposable RPC write-probe tool. Deleted below.'),
      array['aidream']::text[]);
    if not exists (select 1 from tool.binding where tool_id = v_rpc) then
      raise exception 'dd173b7: public.tool_register returned without writing its binding row';
    end if;
    delete from tool.binding where tool_id = v_rpc;
    delete from tool.definition where id = v_rpc;
    perform set_config('app.actor_system', null, true);
    perform set_config('request.jwt.claims', null, true);
    raise notice 'dd173b7: public.tool_register still writes a binding through the definer path with organization_id NOT NULL.';
  exception when others then
    perform set_config('request.jwt.claims', null, true);
    if sqlerrm like 'dd173b7:%' then raise; end if;
    raise exception
      'dd173b7: THE RPC WRITE PATH IS BROKEN. public.tool_register — the main tool registration path — could not write a binding after organization_id became NOT NULL: %. Its three sibling writers share the statement and would fail the same way.',
      sqlerrm;
  end;

  delete from tool.definition where id = v_ptool;

  -- ═══════ 4. THE GATE ═════════════════════════════════════════════════════════════════════════
  v_after := iam.access_delta_snapshot('DD-173 b7 AFTER', v_principals, v_tokens, 400000,
    'DD-173 batch 7 confirmation, pinned to the same instant as the baseline', v_as);
  for r in select c.token, c.principal_label, c.count_before, c.count_after, c.verdict,
                  et.schema_name, et.table_name
             from iam.access_delta_compare(v_before, v_after) c
             join platform.entity_types et on et.token = c.token
            where c.verdict <> 'SAME' order by c.verdict, c.token, c.principal_label
  loop
    if r.verdict = 'WIDER' then
      if not ((r.token || '|' || r.principal_label) = any (v_approved)) then
        v_unapproved := array_append(v_unapproved,
          format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      else
        raise notice 'dd173b7: WIDER (approved by name) % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
      end if;
    elsif r.verdict = 'UNPROVEN' then
      execute format('select count(*) from %I.%I', r.schema_name, r.table_name) into v_total;
      if r.count_before = r.count_after and r.count_after = v_total then
        v_unproven_ok := array_append(v_unproven_ok,
          format('%s for %s (all %s rows before and after)', r.token, r.principal_label, v_total));
      else
        v_unapproven_hard := array_append(v_unapproven_hard,
          format('UNPROVEN %s for %s (%s -> %s of %s rows) — the row-by-row comparison is impossible and the read is not the whole table, so nobody can say which rows moved',
                 r.token, r.principal_label, r.count_before, r.count_after, v_total));
      end if;
    elsif r.verdict = 'UNMEASURED' then
      v_unapproved := array_append(v_unapproved,
        format('UNMEASURED %s for %s — the probe itself failed; a gate that could not read proves nothing', r.token, r.principal_label));
    else
      v_narrower := array_append(v_narrower,
        format('%s for %s (%s -> %s)', r.token, r.principal_label, r.count_before, r.count_after));
      raise notice 'dd173b7: NARROWED % for % : % -> %', r.token, r.principal_label, r.count_before, r.count_after;
    end if;
  end loop;
  if cardinality(v_unapproven_hard) > 0 then
    raise exception 'dd173b7: % read(s) this gate could not prove either way: %',
      cardinality(v_unapproven_hard), array_to_string(v_unapproven_hard, ' ; ');
  end if;
  if cardinality(v_unapproved) > 0 then
    raise exception
      'dd173b7: % door(s) opened that nobody approved by name: %. Over-opening and over-tightening are the same class of defect and neither ships on a count.',
      cardinality(v_unapproved), array_to_string(v_unapproved, ' ; ');
  end if;
  raise notice 'dd173b7: 0 unapproved widenings, % narrowing(s), % pair(s) whole-table-identical, across % tokens x % principals',
    cardinality(v_narrower), cardinality(v_unproven_ok), cardinality(v_tokens), cardinality(v_principals);

  -- ═══════ 5. CERTIFICATION — both axes clean ══════════════════════════════════════════════════
  for r in select et.token, et.schema_name, et.table_name, et.rls_variant
             from platform.entity_types et where et.token = any (v_tokens) order by et.token
  loop
    for v in select * from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant)
              where status = 'FAIL'
    loop
      f := format('%s / %s: %s', r.token, v.check_name, coalesce(v.detail,''));
      if v.check_name = any (v_policy_checks) then v_policy_fail := array_append(v_policy_fail, f);
      else v_base_fail := array_append(v_base_fail, f); end if;
    end loop;
  end loop;
  if cardinality(v_base_fail) > 0 then
    raise exception 'dd173b7: % base-contract FAIL(s) remain after the retrofit: %. This file exists to close exactly these.',
      cardinality(v_base_fail), array_to_string(v_base_fail, ' ; ');
  end if;
  if cardinality(v_policy_fail) > 0 then
    raise exception 'dd173b7: % POLICY-family FAIL(s) after generation: %. The generator produced a policy set its own certification refuses; this round does not stand.',
      cardinality(v_policy_fail), array_to_string(v_policy_fail, ' ; ');
  end if;
  raise notice 'dd173b7: iam.verify_canonical — 0 base-contract FAIL and 0 POLICY-family FAIL across all 3 tokens';

  -- ═══════ 6. ACKNOWLEDGE THIS FILE'S OWN GUARD FIRINGS ════════════════════════════════════════
  select count(*) into v_acked from platform.ddl_guard_log
   where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as;
  if v_acked > 0 then
    perform platform.ddl_guard_ack(
      p_reason => 'DD-173 batch 7 (B-83): platform.retrofit_entity added organization_id and set it NOT NULL in the same call, and raises if any row would be left without an organization. The guard saw the ADD COLUMN half of that pair.',
      p_by     => 'DD-173 batch 7 migration',
      p_rule   => 'nullable_org',
      p_before => null,
      p_ids    => (select array_agg(id) from platform.ddl_guard_log
                    where rule = 'nullable_org' and acknowledged_at is null and occurred_at >= v_as));
    raise notice 'dd173b7: acknowledged % nullable_org guard firing(s) raised by this file', v_acked;
  end if;
end $dd173b7$;
