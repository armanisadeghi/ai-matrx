-- HR domain C4 — migration 14 (register item HRB-008 follow-up, lane workflow-engine).
--
-- 🚨 THE PERIOD PAGE COULD NOT TELL "AWAITING A DECISION" FROM "STUCK", SO A DEAD TIMECARD LOOKED
-- EXACTLY LIKE A LIVE ONE.
--
-- `hr.pay_period_get` returned `counts` over `hr.pay_period_employment.state` only — employments,
-- approved, open, attested, disputed. A row sitting at `open` reads the same whether its
-- attestation instance is ACTIVE and waiting on a person, FAILED with a `hr.workflow_failure` row
-- somebody must work, or was never opened at all. That is precisely the state the G2V period was in
-- for four verification rounds: one `open` row, one `failed` instance, and a page that said
-- "awaiting". Nobody could see the difference, so nobody chased it.
--
-- This adds the smallest honest projection that separates the three, in the idiom the read door
-- already uses (a counts object beside the existing one, plus a small per-row array):
--
--   workflow: { awaiting, stuck, no_flow, done, rows: [ { …, health } ] }
--
-- `health` is the field the page renders: `awaiting` (a live instance waiting on a person),
-- `stuck` (a failed instance with its `failure_class` named), `no_flow` (the period was never
-- submitted, or this row was added afterwards and has no instance), `done`.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS
--
-- 1. THE ROW'S CURRENT INSTANCE IS THE ONE HOLDING THE OPEN BINDING, ELSE THE MOST RECENT.
--    §1.6's binding is exactly "the open flow on this row", so it is the right key while one
--    exists; after a flow closes there is no open binding and the newest instance is what the page
--    should describe. One lateral, ordered `is_open desc, created_at desc`, answers both.
--
-- 2. `stuck` READS THE INSTANCE, AND NAMES THE FAILURE. A `failed` instance always has a
--    `hr.workflow_failure` row (§1.8) and the class is what tells a person what to do —
--    `approver_ineligible` is "grant somebody authority or name a substitute", `unroutable` is
--    "nobody holds it at all". Returning the state without the class would just move the mystery.
--
-- 3. NO NEW TABLE, NO NEW DOOR, NO DENORMALISED COLUMN. This is a read-time projection over rows
--    that already exist, in the door that already exists. A `workflow_state` column on
--    `hr.pay_period_employment` would be a second copy of the engine's own truth, drifting the
--    first time anything moved without the writer remembering.
--
-- 4. AND THE RETRY NOW STAMPS `current_step_order`. Reviving a failed instance
--    (hr_c4_12) left it `active` with `current_step_order = NULL`, because only `hr._wf_route` ever
--    set it — an active instance that could not say which step it was on. Measured on the real G2V
--    instance after its live repair, 2026-08-27.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.6 (the binding IS the open-flow question), §1.8 (the failure
-- class is what a human acts on), §5.1 (the projection is disposable and derived, never a copy).
-- Applied live as `hr_c4_14_period_row_workflow_health`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '30s';

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  perform set_config('matrx.hr_c4_14_cert_bad_before', v_bad::text, true);
end $$;

-- ============================================================ 1. the health projection
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$           'adjustments_tagged_here', (select count(*) from hr.time_adjustment$o$;
  v_rep constant text := $o$           -- 🚨 WHAT THE ROW-STATE COUNTS CANNOT SAY: is this timecard waiting on a PERSON, or is
           -- its flow dead? An `open` row with a failed instance behind it reads identically to one
           -- with a live instance, which is how a stuck period looked "awaiting" for four rounds.
           'workflow', (select jsonb_build_object(
                'awaiting', count(*) filter (where h.health = 'awaiting'),
                'stuck',    count(*) filter (where h.health = 'stuck'),
                'no_flow',  count(*) filter (where h.health = 'no_flow'),
                'done',     count(*) filter (where h.health = 'done'),
                'rows', coalesce(jsonb_agg(jsonb_build_object(
                          'pay_period_employment_id', h.ppe_id,
                          'employment_id', h.employment_id,
                          'row_state', h.row_state,
                          'health', h.health,
                          'flow_key', h.flow_key,
                          'instance_id', h.instance_id,
                          'instance_state', h.instance_state,
                          'failure_class', h.failure_class,
                          'failure_id', h.failure_id) order by h.health, h.employment_id), '[]'::jsonb))
              from (
                select ppe.id as ppe_id, ppe.employment_id, ppe.state as row_state,
                       i.flow_key, i.id as instance_id, i.state as instance_state,
                       f.failure_class, f.id as failure_id,
                       case when i.id is null then 'no_flow'
                            when i.state = 'failed' then 'stuck'
                            when i.state in ('draft','validating','routing','active','approved',
                                             'applying','verifying','returned') then 'awaiting'
                            else 'done' end as health
                  from hr.pay_period_employment ppe
                  left join lateral (
                    -- §1.6: the open binding IS "the flow on this row"; with none, the newest one
                    select wi.id, wi.state, wi.flow_key
                      from hr.workflow_binding b
                      join hr.workflow_instance wi on wi.id = b.workflow_instance_id
                     where b.target_token = 'hr_pay_period_employment' and b.target_id = ppe.id
                     order by b.is_open desc, wi.created_at desc
                     limit 1) i on true
                  left join lateral (
                    select wf.id, wf.failure_class from hr.workflow_failure wf
                     where wf.workflow_instance_id = i.id and wf.state in ('open','retrying')
                     order by wf.occurred_at desc limit 1) f on true
                 where ppe.pay_period_id = v_per.id) h),
           'adjustments_tagged_here', (select count(*) from hr.time_adjustment$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if v_oid is null then raise exception 'hr_c4_14: hr.pay_period_get does not exist'; end if;
  v_def := pg_get_functiondef(v_oid);
  if position($chk$'workflow', (select jsonb_build_object($chk$ in v_def) > 0 then
    raise notice 'hr_c4_14: hr.pay_period_get already projects workflow health';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_14: hr.pay_period_get does not carry the expected shape — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_14: hr.pay_period_get now separates awaiting from stuck, per row';
  end if;
end
$mig$;

-- ============================================================ 2. the retry stamps current_step_order
do $mig$
declare
  v_oid oid; v_def text;
  v_old constant text := $o$        update hr.workflow_instance set state = 'active', state_reason = null
         where id = inst.id and state = 'failed';$o$;
  v_rep constant text := $o$        -- 🚨 and it says WHICH step it is on. Reviving left current_step_order NULL, because only
        -- hr._wf_route ever set it — an active instance that could not name its own position.
        update hr.workflow_instance
           set state = case when state = 'failed' then 'active' else state end,
               state_reason = case when state = 'failed' then null else state_reason end,
               current_step_order = (select s.step_order from hr.workflow_step s
                                      where s.id = f.workflow_step_id)
         where id = inst.id;$o$;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  v_def := pg_get_functiondef(v_oid);
  if position(v_rep in v_def) > 0 then
    raise notice 'hr_c4_14: the retry already stamps current_step_order';
  else
    if position(v_old in v_def) = 0 then
      raise exception 'hr_c4_14: hr.wf_resolve_failure does not carry hr_c4_12''s revival block — refusing to half-apply';
    end if;
    execute replace(v_def, v_old, v_rep);
    raise notice 'hr_c4_14: the retry now stamps current_step_order on the revived instance';
  end if;
end
$mig$;

-- ============================================================ 3. repair the row already revived
-- The live G2V instance was revived by hand through hr.wf_resolve_failure BEFORE this migration, so
-- it carries the NULL this fix prevents. Any active instance with an active step and no
-- current_step_order is stamped from its own step — derived, never guessed.
do $$
declare v_n integer;
begin
  perform hr.arm_write();
  with fixed as (
    update hr.workflow_instance i
       set current_step_order = s.step_order
      from hr.workflow_step s
     where s.workflow_instance_id = i.id
       and s.state in ('active','awaiting_result')
       and i.state = 'active'
       and i.current_step_order is null
    returning i.id)
  select count(*) into v_n from fixed;
  raise notice 'hr_c4_14: stamped current_step_order on % revived instance(s)', v_n;
end $$;

-- ============================================================ 4. post-conditions
do $$
declare v_src text; v_bad integer; v_bad_before integer;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'pay_period_get';
  if v_src !~ '''no_flow''' or v_src !~ '''stuck''' or v_src !~ '''awaiting''' then
    raise exception 'hr_c4_14: hr.pay_period_get does not separate awaiting / stuck / no_flow';
  end if;
  if v_src !~ 'failure_class' then
    raise exception 'hr_c4_14: the health projection does not name the failure class';
  end if;
  -- the existing contract is untouched: the state counts the page already renders are still there
  if v_src !~ '''counts''' or v_src !~ '''disputed'', count\(\*\) filter' then
    raise exception 'hr_c4_14: the existing counts block was disturbed';
  end if;

  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'wf_resolve_failure';
  if v_src !~ 'current_step_order = \(select s\.step_order' then
    raise exception 'hr_c4_14: the retry does not stamp current_step_order';
  end if;
  if v_src !~ 'binding_reclaimed' then
    raise exception 'hr_c4_14: hr_c4_12''s binding reclaim was lost';
  end if;

  -- no active instance is left unable to name its own step
  select count(*) into v_bad from hr.workflow_instance i
   where i.state = 'active' and i.current_step_order is null
     and exists (select 1 from hr.workflow_step s where s.workflow_instance_id = i.id
                  and s.state in ('active','awaiting_result'));
  if v_bad > 0 then
    raise exception 'hr_c4_14: % active instance(s) still have no current_step_order', v_bad;
  end if;

  -- hr_c4_11/12/13 all still in force
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'wf_resolve_approvers') !~ 'no_reach' then
    raise exception 'hr_c4_14: hr_c4_11''s self-step lane was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_route') !~ 'binding_released' then
    raise exception 'hr_c4_14: hr_c4_12''s binding release was lost';
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = 'pay_period_transition')
     !~ 'state not in \(''approved'',''exported'',''locked''\)' then
    raise exception 'hr_c4_14: hr_c4_13''s completion gate was lost';
  end if;

  select count(*) into v_bad
    from platform.entity_types e, lateral iam.canonical_certify('hr', e.table_name, e.token) c
   where e.schema_name = 'hr' and c.category <> 'broken_dependent_fn';
  if v_bad > 0 then
    raise exception 'hr_c4_14: % hr CONFORMANCE finding(s)', v_bad;
  end if;
  select count(*) into v_bad from platform.entity_types e
   where e.schema_name = 'hr' and not iam.canonical_certify_ok(e.schema_name, e.table_name, e.token);
  v_bad_before := current_setting('matrx.hr_c4_14_cert_bad_before')::integer;
  if v_bad > v_bad_before then
    raise exception 'hr_c4_14: hr certification failures increased from % to %', v_bad_before, v_bad;
  end if;
end $$;
