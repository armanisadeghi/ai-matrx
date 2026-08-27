-- HR domain C4 — migration 12 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 A ROUTING FAILURE HELD ITS EXCLUSIVE BINDING OPEN FOREVER, SO THE TARGET RENDERED AS
-- "AWAITING A DECISION" THAT NOBODY COULD EVER TAKE — AND SILENTLY.
--
-- Measured live on the real submitted period (G2V Window Biweekly, 2026-08-27):
--
--   hr.workflow_instance 470e7247…  state=failed  state_reason=approver_ineligible
--                                   current_step_order=NULL
--   hr.workflow_binding  8d7b9b9d…  flow_key=timecard_attestation  is_open=TRUE   ← the defect
--
-- `hr._wf_close_instance` closes the binding for every terminal state it handles — but the routing
-- failure path in `hr._wf_route` never goes through it. It does a bare
-- `update hr.workflow_instance set state='failed'` and returns, leaving the binding OPEN.
--
-- The consequences compound, and every one of them is silent:
--   · §1.6's binding is what a target row's UI badge reads — "is there an open flow on this row?"
--     — so the timecard advertised a pending decision that has no step behind it;
--   · `hr.wf_request` (correctly, since hr_c4_10) refuses a fresh instance with `WF_BINDING_OPEN`,
--     so the flow could never be re-opened from the front either;
--   · the row therefore could never be decided, so its pay period could never reach `approved`.
-- A tombstone that blocks forever while rendering as "awaiting" is the worst of both.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. 🚨 FAILURE RELEASES THE BINDING; THE RETRY RECLAIMS IT. §1.6 defines the binding as the
--    answer to *"is there an OPEN instance on this (target, flow_key)?"* — and a `failed` instance
--    is not one. So the failure path now sets `is_open = false`, exactly as every other terminal
--    state already does through `hr._wf_close_instance`. That un-sticks both directions at once: the
--    badge stops lying, and a fresh `hr.wf_request` can open a new instance once the underlying
--    problem is fixed.
--    The instance itself is NOT closed and NOT cancelled — it stays `failed` with its
--    `hr.workflow_failure` row open, because §1.8's queue is the record of a thing a human must
--    resolve, and `hr.wf_resolve_failure(…, 'retry')` still revives THIS instance rather than
--    making the operator start over.
--
-- 2. THE RETRY RE-OPENS THE BINDING, AND REFUSES PLAINLY IF THE SLOT WAS TAKEN. Releasing the
--    binding creates a race the old code could not have: between the failure and the retry, a fresh
--    request may legitimately have opened a new instance on that target. `hr.wf_resolve_failure`
--    therefore checks for another open exclusive binding BEFORE re-activating and returns
--    `WF_BINDING_OPEN` naming the instance that holds it — an operator is told which one to work,
--    instead of the partial unique index raising in their face.
--
-- 3. THE FAILURE IS NOW AN EVENT, NOT JUST A COLUMN. `hr._wf_route` recorded the failure row and
--    the state change but emitted no `hr.workflow_event`, so the instance's own history had a hole
--    exactly where the interesting thing happened. AD-11 §1.5 lists `failed` among the event kinds
--    the ledger carries; it is emitted now.
--
-- 4. THE BODIES ARE REWRITTEN FROM THE LIVE CATALOG by exact-string replacement, as hr_c4_08…11
--    record, and the migration REFUSES to run if the expected text is absent. Idempotent.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.6 (the binding answers "is there an open flow"), §1.8 (the
-- failure queue is worked, not abandoned), §3.1 (`failed --> …` is not a closed state).
-- Applied live as `hr_c4_12_failed_instance_releases_its_binding`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_12_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the failure releases the binding
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_old constant text := $o$      elsif not (v_res ->> 'granted')::boolean then
        -- an unroutable/invalid step blocks the instance; the failure row is already open
        update hr.workflow_instance
           set state = 'failed', state_reason = v_res ->> 'reason' where id = p_instance;
        return v_res;
      end if;$o$;
  v_rep constant text := $o$      elsif not (v_res ->> 'granted')::boolean then
        -- an unroutable/invalid step blocks the instance; the failure row is already open
        update hr.workflow_instance
           set state = 'failed', state_reason = v_res ->> 'reason' where id = p_instance;
        -- 🚨 AND IT RELEASES ITS EXCLUSIVE BINDING. §1.6's binding answers "is there an OPEN flow
        -- on this row?", and a failed instance is not one. Holding is_open TRUE made the target
        -- render as "awaiting a decision" that had no step behind it, while hr.wf_request refused
        -- every fresh instance with WF_BINDING_OPEN — so the row could never be decided and its
        -- pay period could never be approved. hr.wf_resolve_failure(…, 'retry') reclaims the slot
        -- when it revives this instance.
        update hr.workflow_binding set is_open = false where workflow_instance_id = p_instance;
        perform hr._wf_event(p_instance, r.id, 'failed', inst.state, 'failed', 'automation',
                             null, null,
                             jsonb_build_object('reason', v_res ->> 'reason',
                                                'detail', v_res ->> 'detail',
                                                'binding_released', true));
        return v_res;
      end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_route';
  if v_oid is null then raise exception 'hr_c4_12: hr._wf_route does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_rep in v_def) > 0 then
    raise notice 'hr_c4_12: hr._wf_route already releases the binding on failure';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_12: hr._wf_route does not carry the expected failure path — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_12: hr._wf_route now releases the binding and records the failure';
  end if;
end
$mig$;

-- ============================================================ 2. the retry reclaims it
do $mig$
declare
  v_oid oid; v_def text; v_new text;
  v_old constant text := $o$    elsif f.workflow_step_id is not null then
      perform hr.arm_write();
      update hr.workflow_step set state = 'pending' where id = f.workflow_step_id
        and state = 'unroutable';
      v_res := hr.wf_activate_step(f.workflow_step_id);
    end if;$o$;
  v_rep constant text := $o$    elsif f.workflow_step_id is not null then
      -- 🚨 THE RETRY RECLAIMS THE BINDING THE FAILURE RELEASED, and refuses plainly if a fresh
      -- instance legitimately took the slot in between — an operator is told which instance to
      -- work, instead of the partial unique index raising in their face.
      if exists (select 1 from hr.workflow_binding b
                  where b.target_token = inst.target_token and b.target_id = inst.target_id
                    and b.flow_key = inst.flow_key and b.is_open and b.exclusive
                    and b.workflow_instance_id <> inst.id) then
        return jsonb_build_object('granted', false, 'reason', 'WF_BINDING_OPEN',
          'detail', 'another instance now holds the open binding on this target; work or cancel that one instead of retrying this',
          'existing_instance_id', (select b.workflow_instance_id from hr.workflow_binding b
                                    where b.target_token = inst.target_token
                                      and b.target_id = inst.target_id
                                      and b.flow_key = inst.flow_key and b.is_open and b.exclusive));
      end if;
      perform hr.arm_write();
      update hr.workflow_step set state = 'pending' where id = f.workflow_step_id
        and state = 'unroutable';
      v_res := hr.wf_activate_step(f.workflow_step_id);
      if coalesce((v_res ->> 'granted')::boolean, false) then
        update hr.workflow_binding set is_open = true where workflow_instance_id = inst.id;
        update hr.workflow_instance set state = 'active', state_reason = null
         where id = inst.id and state = 'failed';
        perform hr._wf_event(inst.id, f.workflow_step_id, 'routed', 'failed', 'active',
                             'hr_admin', v_uid, null,
                             jsonb_build_object('failure_id', p_failure_id, 'retry', true,
                                                'binding_reclaimed', true));
      end if;
    end if;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  if v_oid is null then raise exception 'hr_c4_12: hr.wf_resolve_failure does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position(v_rep in v_def) > 0 then
    raise notice 'hr_c4_12: hr.wf_resolve_failure already reclaims the binding';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_12: hr.wf_resolve_failure does not carry the expected retry branch — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_12: hr.wf_resolve_failure now reclaims the binding on a successful retry';
  end if;
end
$mig$;

-- ============================================================ 3. repair the rows already stuck
-- 🚨 THE DEFECT LEFT REAL ROWS BEHIND, AND A FIX THAT ONLY CHANGES THE FUTURE LEAVES THEM STUCK.
-- Every binding still flagged open on an instance that is NOT open is released here — the same
-- state the fixed code would have produced. This touches no instance, no step, no decision and no
-- failure row: only the `is_open` flag that was never meant to be true for a dead instance.
do $$
declare v_n integer;
begin
  perform hr.arm_write();
  with fixed as (
    update hr.workflow_binding b
       set is_open = false
      from hr.workflow_instance i
     where i.id = b.workflow_instance_id
       and b.is_open
       and i.state in ('failed','rejected','rejected_at_intake','withdrawn','cancelled',
                       'expired','superseded','closed','completed')
    returning b.id)
  select count(*) into v_n from fixed;
  raise notice 'hr_c4_12: released % stale open binding(s) on non-open instances', v_n;
end $$;

-- ============================================================ 4. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_wf_route';
  if v_src !~ 'update hr\.workflow_binding set is_open = false where workflow_instance_id = p_instance' then
    raise exception 'hr_c4_12: hr._wf_route still holds the binding open on a routing failure';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  if v_src !~ 'binding_reclaimed' then
    raise exception 'hr_c4_12: hr.wf_resolve_failure does not reclaim the binding on retry';
  end if;

  -- 🚨 the invariant the defect violated, asserted over the LIVE table: no binding is open on an
  -- instance that is not open. This is the check that would have caught it on day one.
  select count(*) into v_bad
    from hr.workflow_binding b join hr.workflow_instance i on i.id = b.workflow_instance_id
   where b.is_open
     and i.state not in ('draft','validating','routing','active','approved','applying',
                         'verifying','returned');
  if v_bad > 0 then
    raise exception 'hr_c4_12: % binding(s) are still open on an instance that is not open', v_bad;
  end if;

  -- hr_c4_08…11 all still in force
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'privileged_write';
  if v_bad > 0 then
    raise exception 'hr_c4_12: % engine function(s) went back to the legacy write-guard arm', v_bad;
  end if;
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname ~ '^wf_' or p.proname ~ '^_wf_')
     and p.prosrc ~ 'delete\s+from\s+hr\.workflow_instance';
  if v_bad > 0 then
    raise exception 'hr_c4_12: % engine function(s) delete hr.workflow_instance rows', v_bad;
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'no_reach' then
    raise exception 'hr_c4_12: hr_c4_11''s self-step lane is no longer in the resolver';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_12: % hr CONFORMANCE finding(s) — this lane changed a table property it must not have', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_12_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_12: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
