-- HR domain C4 — migration 10 (register item HRB-008 follow-up, lane workflow-engine; closes D275).
--
-- 🚨 A REFUSED REQUEST WAS LEAVING A PERMANENT `validating` INSTANCE BEHIND.
--
-- `hr.wf_request` inserted `hr.workflow_instance` FIRST and `hr.workflow_binding` second. The
-- binding's `unique_violation` was caught in its own block, which RETURNED the `WF_BINDING_OPEN`
-- envelope — so the function returned *normally* and the instance INSERT was never rolled back.
-- Every duplicate submit therefore left an orphan `hr.workflow_instance` in state `validating`
-- with no binding, no steps and no `created` event.
--
-- 🚨 IT CANNOT BE CLEANED UP AFTERWARDS, WHICH IS WHY IT HAD TO BE PREVENTED. SPEC-WORKFLOW-ENGINE
-- §1.3 is explicit that an instance is evidence: "it is cancelled, never deleted", and "no engine
-- RPC ever writes `deleted_at`". A `delete from hr.workflow_instance` inside an engine RPC would
-- have been a hard delete of an evidence-class row to tidy up after a refusal — the exact thing
-- that rule exists to forbid. The row must never be written in the first place.
--
-- Measured on the live engine, 2026-08-26, while fixing the HRB-008 proof: requesting
-- `timecard_approval` on a `hr_pay_period_employment` that already had one open left exactly this
-- row. It is on the path a verifier drives first — double-submitting a request.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 TWO CHANGES, BECAUSE THE PRE-CHECK ALONE DOES NOT CLOSE THE RACE.
--
--    (a) THE PRE-CHECK, before anything is written. `hr.workflow_binding` is read for an open
--        exclusive row on `(target_token, target_id, flow_key)` and the refusal returns from there.
--        This is the whole of the sequential case — a person pressing Submit twice, a client
--        retrying — and it now costs one indexed read and writes nothing at all. It does not even
--        compute the digest.
--
--    (b) THE INSTANCE AND ITS BINDING NOW SHARE ONE EXCEPTION BLOCK. A pre-check cannot answer two
--        concurrent requests: both read no open binding, both insert an instance, one loses on the
--        partial unique index — and under the old shape the loser still stranded its instance. A
--        plpgsql `BEGIN … EXCEPTION` establishes a subtransaction at block entry, so raising inside
--        it rolls back *everything the block did*. Putting both inserts in that one block means the
--        binding's `unique_violation` takes the instance row with it. §1.6 is untouched: exclusivity
--        is still enforced by the DATABASE, by the same partial unique index. What changes is that
--        losing the race no longer leaves a row nobody is allowed to delete.
--
-- 2. `v_inst` TELLS THE TWO COLLISIONS APART, AND IT SURVIVES THE ROLLBACK. One block now catches
--    `unique_violation` from two different inserts: the instance's idempotency-key index (a replay,
--    which must return the existing instance) and the binding's exclusivity index (a refusal).
--    plpgsql variables are NOT transactional, so `v_inst` still holds the id the rolled-back insert
--    returned — NULL means the instance insert itself collided, non-NULL means it succeeded and the
--    binding is what raised. The replay lane is byte-for-byte the code that was there before; it
--    has simply moved inside the same handler.
--
-- 3. THE BODY IS REWRITTEN FROM THE LIVE CATALOG by exact-string replacement, for the reason
--    hr_c4_08 and hr_c4_09 record: `hr.wf_request` has been changed at the source by later lanes
--    (hr_c4_08's arm, hr_c4_09's capability argument), and re-pasting the C4 original would revert
--    them. The migration refuses to run if the exact expected text is not present, so it can never
--    half-apply to a body it does not recognise. Idempotent: the replacement is detected as already
--    applied and skipped.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.3 (an instance is evidence, never deleted), §1.6 (the
-- exclusive binding fails at the database) and §4.2. Closes matrx-frontend FOUND_DEFECTS D275.
-- Applied live as `hr_c4_10_binding_refusal_leaves_no_instance`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the rewrite
do $mig$
declare
  v_oid  oid;
  v_def  text;
  v_new  text;
  v_old  constant text := $old$  v_digest := hr._wf_call_digest(p_flow_key, p_organization_id, p_target_token, p_target_id);

  perform hr.arm_write();
  begin
    insert into hr.workflow_instance
      (organization_id, flow_key, workflow_definition_id, definition_version,
       target_token, target_id, target_version, target_digest,
       requester_employment_id, subject_employment_id, requester_actor_type,
       state, payload, idempotency_key, sensitivity_tier, created_by, updated_by)
    values (p_organization_id, p_flow_key, defn.id, defn.definition_version,
            p_target_token, p_target_id, v_version, v_digest,
            v_requester, v_subject, 'employee',
            case when p_as_draft then 'draft' else 'validating' end,
            coalesce(p_payload,'{}'::jsonb), p_idempotency_key, ft.sensitivity_tier, v_uid, v_uid)
    returning id into v_inst;
  exception when unique_violation then
    select id into v_existing from hr.workflow_instance
     where organization_id = p_organization_id and flow_key = p_flow_key
       and idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return jsonb_build_object('granted', true, 'instance_id', v_existing, 'replayed', true);
    end if;
    raise;
  end;

  -- ---- the exclusive binding. §1.6: a second open instance on the same (target, flow_key) fails
  -- at the DATABASE, not in application logic.
  begin
    insert into hr.workflow_binding (organization_id, workflow_instance_id, target_token, target_id,
                                     flow_key, is_open, exclusive)
    values (p_organization_id, v_inst, p_target_token, p_target_id, p_flow_key, true, true);
  exception when unique_violation then
    return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
      'detail', format('an open %s already exists on this %s', p_flow_key, p_target_token),
      'existing_instance_id', (select workflow_instance_id from hr.workflow_binding
                                where target_token = p_target_token and target_id = p_target_id
                                  and flow_key = p_flow_key and is_open and exclusive));
  end;
$old$;
  v_rep  constant text := $new$  -- ---- 🚨 D275: THE EXCLUSIVE BINDING IS CHECKED BEFORE ANYTHING IS WRITTEN. A refusal must
  -- leave nothing behind, and a workflow instance is evidence that is never deleted (§1.3) — so an
  -- orphan `validating` row from a refused request could never be cleaned up afterwards.
  select b.workflow_instance_id into v_existing
    from hr.workflow_binding b
   where b.target_token = p_target_token and b.target_id = p_target_id
     and b.flow_key = p_flow_key and b.is_open and b.exclusive
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
      'detail', format('an open %s already exists on this %s', p_flow_key, p_target_token),
      'existing_instance_id', v_existing);
  end if;

  v_digest := hr._wf_call_digest(p_flow_key, p_organization_id, p_target_token, p_target_id);

  perform hr.arm_write();
  -- 🚨 THE INSTANCE AND ITS BINDING SHARE ONE EXCEPTION BLOCK, so the binding's unique_violation
  -- rolls the instance row back with it. The pre-check above cannot answer two CONCURRENT requests
  -- — both read no open binding, both insert, one loses on the partial unique index — and the
  -- loser must not strand an instance either. §1.6 is unchanged: exclusivity is still enforced by
  -- the database, by the same index.
  begin
    insert into hr.workflow_instance
      (organization_id, flow_key, workflow_definition_id, definition_version,
       target_token, target_id, target_version, target_digest,
       requester_employment_id, subject_employment_id, requester_actor_type,
       state, payload, idempotency_key, sensitivity_tier, created_by, updated_by)
    values (p_organization_id, p_flow_key, defn.id, defn.definition_version,
            p_target_token, p_target_id, v_version, v_digest,
            v_requester, v_subject, 'employee',
            case when p_as_draft then 'draft' else 'validating' end,
            coalesce(p_payload,'{}'::jsonb), p_idempotency_key, ft.sensitivity_tier, v_uid, v_uid)
    returning id into v_inst;

    insert into hr.workflow_binding (organization_id, workflow_instance_id, target_token, target_id,
                                     flow_key, is_open, exclusive)
    values (p_organization_id, v_inst, p_target_token, p_target_id, p_flow_key, true, true);
  exception when unique_violation then
    -- plpgsql variables are not transactional, so v_inst survives this block's rollback and tells
    -- the two collisions apart: NULL = the instance's idempotency index (a replay), non-NULL = the
    -- binding's exclusivity index (a refusal, whose instance row is already gone with it).
    if v_inst is null then
      select id into v_existing from hr.workflow_instance
       where organization_id = p_organization_id and flow_key = p_flow_key
         and idempotency_key = p_idempotency_key;
      if v_existing is not null then
        return jsonb_build_object('granted', true, 'instance_id', v_existing, 'replayed', true);
      end if;
      raise;
    end if;
    return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
      'detail', format('an open %s already exists on this %s', p_flow_key, p_target_token),
      'existing_instance_id', (select workflow_instance_id from hr.workflow_binding
                                where target_token = p_target_token and target_id = p_target_id
                                  and flow_key = p_flow_key and is_open and exclusive));
  end;
$new$;
begin
  select p.oid into v_oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';
  if v_oid is null then
    raise exception 'hr_c4_10: hr.wf_request does not exist';
  end if;

  v_def := pg_get_functiondef(v_oid);

  if position(v_rep in v_def) > 0 then
    raise notice 'hr_c4_10: hr.wf_request already checks the binding before it writes; nothing to do';
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'hr_c4_10: hr.wf_request does not carry the expected two-block shape — refusing to half-apply to a body this migration does not recognise';
  end if;

  v_new := replace(v_def, v_old, v_rep);
  execute v_new;
  raise notice 'hr_c4_10: hr.wf_request now refuses WF_BINDING_OPEN without writing an instance row';
end
$mig$;

-- ============================================================ 2. post-conditions
do $$
declare
  v_src  text;
  v_bad  integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_request';

  -- 2a. the binding is read before the instance is written
  if position('select b.workflow_instance_id into v_existing' in v_src) = 0
     or position('select b.workflow_instance_id into v_existing' in v_src)
        > position('insert into hr.workflow_instance' in v_src) then
    raise exception 'hr_c4_10: hr.wf_request does not read the binding before inserting the instance';
  end if;

  -- 2b. and both inserts sit inside ONE exception block — i.e. there is exactly one
  -- `insert into hr.workflow_binding` and no `exception` handler between the two inserts
  if (select count(*) from regexp_matches(v_src, 'insert into hr\.workflow_binding', 'g')) <> 1 then
    raise exception 'hr_c4_10: hr.wf_request no longer has exactly one workflow_binding insert';
  end if;
  if substring(v_src from position('insert into hr.workflow_instance' in v_src)
                        for position('insert into hr.workflow_binding' in v_src)
                          - position('insert into hr.workflow_instance' in v_src)) ~ 'exception\s+when' then
    raise exception 'hr_c4_10: an exception handler still sits between the instance and binding inserts — the binding collision cannot roll the instance back';
  end if;

  -- 2c. 🚨 and the engine still never deletes an instance. The fix must not have been "tidy up
  -- afterwards" (§1.3: an instance is cancelled, never deleted).
  select count(*) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'delete\s+from\s+hr\.workflow_instance';
  if v_bad > 0 then
    raise exception 'hr_c4_10: % engine function(s) now delete hr.workflow_instance rows', v_bad;
  end if;

  -- 2d. hr_c4_08 and hr_c4_09 are still in force in this body
  if v_src ~ 'privileged_write' then
    raise exception 'hr_c4_10: hr.wf_request went back to the legacy write-guard arm';
  end if;
  if v_src !~ 'hr\.arm_write\(\)' then
    raise exception 'hr_c4_10: hr.wf_request no longer arms the write guard at all';
  end if;

  -- 2e. it is still SECURITY DEFINER on the pinned search_path, and its door kept its grant
  if not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'hr' and p.proname = 'wf_request') then
    raise exception 'hr_c4_10: hr.wf_request stopped being SECURITY DEFINER';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_wf_request(text,text,uuid,uuid,jsonb,uuid,boolean,text)', 'EXECUTE') then
    raise exception 'hr_c4_10: public.hr_wf_request lost the authenticated EXECUTE grant';
  end if;

  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  if v_bad > 0 then
    raise exception 'hr_c4_10: % hr tokens no longer certify', v_bad;
  end if;
end $$;
