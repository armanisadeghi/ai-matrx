-- HR domain C4 — migration 5 of 7 (register item HRB-008, lane core-c4-workflow).
--
-- `hr.wf_tick()` — the four-pass sweep of §1.9 (reminders, timeout warnings, timeouts, escalation)
-- plus the two passes §1.9's prose implies and its list omits (external-result window elapse, and
-- instance expiry) — and the five `workflow.*` capabilities the §4.2 RPC surface names but no live
-- role held.
--
-- 🚨 NO CRON JOB IS CREATED HERE, AND THE MIGRATION ASSERTS THAT NONE EXISTS. D23's
-- `hr-workflow-tick` schedule is PROPOSED, NOT CREATED — the no-unapproved-schedules law means
-- Arman approves every automated schedule by exact name and interval, and this lane did not ask.
-- The function is built and proven by DIRECT CALL. Same posture HRB-007 took with
-- `hr-grant-boundary-derive` and `hr-grant-drift-selfheal`.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.9, §3.1, §4.2, §7.1, §9.2, §9.6; SPEC-ACCESS §1.4;
-- /policies/no-unapproved-schedules.md. Applied live as `hr_c4_05_tick`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 FIVE `workflow.*` CAPABILITIES DID NOT EXIST AND THE ENGINE'S OWN RPCs WERE REFUSING
--    EVERYONE. §4.2 gates `wf_cancel` on "HR admin with `workflow.cancel` authority", `wf_reassign_step`
--    on `workflow.reassign`, and `wf_pending` on `workflow.view_queue`. The live capability
--    vocabulary (26 distinct values across nine builtin roles, read today) contains no `workflow.*`
--    value at all, so `hr.capability(uid,'workflow.cancel',org)` was FALSE for every human on the
--    platform — meaning no HR administrator could cancel a request, reassign a stuck step, or read
--    a queue. That is the textbook over-tightening defect, which this program weighs exactly as
--    heavily as a leak, and it would have passed any test that only asserts "the wrong person
--    cannot". Five capabilities are added to the two administrative builtins:
--      hr_owner  <- workflow.cancel, workflow.reassign, workflow.view_queue,
--                   workflow.record_result, workflow.resolve_failure
--      hr_admin  <- workflow.cancel, workflow.reassign, workflow.view_queue,
--                   workflow.resolve_failure          (NOT record_result — see decision 2)
--    OWED: SPEC-ACCESS §1.4's capability list gains five values.
--
-- 2. `workflow.record_result` IS DELIBERATELY NARROWER THAN THE OTHER FOUR. Recording that an
--    external effect actually landed is the one act in this engine that closes a step on somebody's
--    word rather than on a decision. §4.2 gates it on "the declared integration actor". There is no
--    integration-actor registry live, so the gate is `hr_owner` plus `workflow.cancel` holders —
--    and even then the flow type's own `result_fn` probe is consulted and OVERRIDES the claim
--    (file 4 §10). A claim is never the proof.
--
-- 3. THE TICK HAS SIX PASSES, NOT §1.9's FOUR, AND THE TWO EXTRA ONES ARE NOT NEW BEHAVIOUR.
--    §1.9 enumerates reminders / timeout warnings / timeouts / escalation. But §3.1 also declares
--    `verifying -> failed: result window elapsed unverified` and `active -> expired: due_at passed,
--    on_expiry = expire`, and NOTHING ELSE IN THE ENGINE COULD EVER FIRE EITHER — both are pure
--    clock events, and the tick is the only clock. Omitting them would leave §10 test 5 (the
--    access-shutoff branch that never reports back) unprovable and `on_expiry` a dead knob.
--    OWED: SPEC-WORKFLOW-ENGINE §1.9's pass list gains passes 5 and 6.
--
-- 4. THE SWEEP IS BOUNDED AND ORDERED, AND SAYS SO. `hr.workflow.tick_batch_max` (default 500)
--    caps each pass so one sweep can never become an unbounded transaction; passes run in the order
--    warn -> apply -> escalate so a step cannot be warned and timed out in the same tick without
--    the warning having gone out first (autonomy policy rule 4 is about the human seeing it coming,
--    and a warning that arrives in the same second as the action is not a warning).
--
-- 5. THE TICK IS SERVICE-ROLE-ONLY (§4.2) AND RETURNS A COUNT PER PASS. It refuses an ordinary
--    authenticated caller with an envelope rather than a raise, like everything else in this lane.
-- ===================================================================================

-- ============================================================ 1. the five capabilities (RD 1, RD 2)
select set_config('hr.privileged_write', 'on', false);

do $$
declare v_before integer; v_after integer;
begin
  select count(distinct c) into v_before from hr.access_role, unnest(capabilities) c
   where deleted_at is null;

  update hr.access_role
     set capabilities = (
           select array_agg(distinct x order by x)
             from unnest(capabilities || ARRAY['workflow.cancel','workflow.reassign',
                                               'workflow.view_queue','workflow.record_result',
                                               'workflow.resolve_failure']) x)
   where role_key = 'hr_owner' and is_builtin and deleted_at is null;

  update hr.access_role
     set capabilities = (
           select array_agg(distinct x order by x)
             from unnest(capabilities || ARRAY['workflow.cancel','workflow.reassign',
                                               'workflow.view_queue',
                                               'workflow.resolve_failure']) x)
   where role_key = 'hr_admin' and is_builtin and deleted_at is null;

  -- assert the END STATE, not the delta: this migration is idempotent and gets re-applied.
  select count(distinct c) into v_after from hr.access_role, unnest(capabilities) c
   where deleted_at is null and c like 'workflow.%';
  if v_after <> 5 then
    raise exception 'hr_c4_05: expected 5 workflow.* capabilities live, found % (was % distinct caps before)',
      v_after, v_before;
  end if;
  -- §1.4's separation of duties is unchanged: none of these five reads anything.
  if exists (select 1 from hr.access_role
              where role_key = 'hr_admin' and capabilities @> ARRAY['workflow.record_result']) then
    raise exception 'hr_c4_05: hr_admin must not hold workflow.record_result (RECORDED DECISION 2)';
  end if;
end $$;

-- ============================================================ 2. hr.wf_tick()  (§1.9)
create or replace function hr.wf_tick()
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_max integer;
  v_lead integer;
  v_reminders integer := 0; v_warned integer := 0; v_timeouts integer := 0;
  v_escalated integer := 0; v_results integer := 0; v_expired integer := 0;
  r record; u uuid; v_res jsonb; v_dec uuid;
begin
  -- §4.2: service role only. An envelope, not a raise (THE REFUSAL-ENVELOPE LAW).
  if auth.uid() is not null and not public.is_platform_admin() then
    return jsonb_build_object('granted', false, 'reason', 'service_role_only',
      'detail', 'hr.wf_tick is the scheduled sweep and is not callable by an ordinary user');
  end if;

  v_max  := (hr._knob('hr.workflow','tick_batch_max') #>> '{}')::integer;
  v_lead := (hr._knob('hr.workflow','timeout_warning_lead_hours') #>> '{}')::integer;
  perform set_config('hr.privileged_write','on',true);

  -- ---------------------------------------------------------------- PASS 1 — reminders
  for r in
    select s.id, s.workflow_instance_id, s.resolved_user_ids, s.due_at, s.reminders_sent,
           coalesce(sd.reminder_cadence_hours, d.reminder_cadence_hours) cadence, d.reminder_max
      from hr.workflow_step s
      join hr.workflow_instance i on i.id = s.workflow_instance_id
      join hr.workflow_definition d on d.id = i.workflow_definition_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active'
       and s.reminders_sent < d.reminder_max
       and now() >= coalesce(s.last_reminder_at, s.activated_at)
                    + make_interval(hours => coalesce(sd.reminder_cadence_hours,
                                                      d.reminder_cadence_hours))
     order by s.activated_at
     limit v_max
  loop
    foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
      -- "approvers who have not decided" — a quorum member who already decided is not reminded
      continue when exists (select 1 from hr.workflow_decision dd
                             where dd.workflow_step_id = r.id and dd.actor_user_id = u
                               and not dd.superseded_by_target_change);
      perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.step_reminder', 'reminder',
                            u, null, jsonb_build_object('due_at', r.due_at,
                                                        'reminder_number', r.reminders_sent + 1,
                                                        'reminder_max', r.reminder_max));
    end loop;
    update hr.workflow_step
       set reminders_sent = reminders_sent + 1, last_reminder_at = now() where id = r.id;
    perform hr._wf_event(r.workflow_instance_id, r.id, 'reminder_sent');
    v_reminders := v_reminders + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 2 — timeout warnings
  -- autonomy policy rule 4: the timeout must be visible BEFORE it fires (RD 4 — this pass runs
  -- before pass 3 so a step is never warned and applied in the same sweep).
  for r in
    select s.id, s.workflow_instance_id, s.resolved_user_ids, s.timeout_at
      from hr.workflow_step s
     where s.state = 'active' and s.autonomy_mode = 3
       and s.timeout_at is not null and s.timeout_warned_at is null
       and now() >= s.timeout_at - make_interval(hours => v_lead)
     order by s.timeout_at
     limit v_max
  loop
    foreach u in array coalesce(r.resolved_user_ids,'{}'::uuid[]) loop
      perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.step_timeout_warning',
                            'timeout_warning', u, null,
                            jsonb_build_object('timeout_at', r.timeout_at, 'lead_hours', v_lead));
    end loop;
    update hr.workflow_step set timeout_warned_at = now() where id = r.id;
    perform hr._wf_event(r.workflow_instance_id, r.id, 'timeout_warned');
    v_warned := v_warned + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 3 — timeouts (mode 3)
  for r in
    select s.id, s.workflow_instance_id, s.step_key, s.autonomy_mode, s.timeout_at,
           s.organization_id, sd.timeout_action
      from hr.workflow_step s
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active' and s.autonomy_mode = 3
       and s.timeout_at is not null and now() >= s.timeout_at
     order by s.timeout_at
     limit v_max
  loop
    if r.timeout_action = 'apply' then
      -- §3.2: the step closes `auto_approved`, and the auto-decision is RECORDED as a decision row
      -- with actor_type='automation' — never as a state flip with no author.
      insert into hr.workflow_decision
        (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
         actor_type, approval_basis, autonomy_mode,
         calculation_snapshot)
      values (r.organization_id, r.workflow_instance_id, r.id, r.step_key, 'approved',
              'no decision was taken within the displayed timeout window',
              'automation', 'timeout', 3,
              jsonb_build_object('timeout_at', r.timeout_at, 'timeout_action', 'apply'))
      returning id into v_dec;
      perform hr._wf_event(r.workflow_instance_id, r.id, 'timeout_applied', 'active', 'auto_approved',
                           'automation', null, null, jsonb_build_object('decision_id', v_dec));
      perform hr._wf_close_step(r.id, 'auto_approved', 'mode_3_timeout');
    else
      perform hr.wf_escalate(r.id, 'mode 3 timeout elapsed with no decision');
    end if;
    v_timeouts := v_timeouts + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 4 — escalation
  for r in
    select s.id, s.workflow_instance_id
      from hr.workflow_step s
      join hr.workflow_instance i on i.id = s.workflow_instance_id
      join hr.workflow_definition d on d.id = i.workflow_definition_id
      join hr.workflow_step_definition sd on sd.id = s.step_definition_id
     where s.state = 'active' and s.escalated_at is null
       and ((sd.escalate_after_hours is not null
             and now() >= s.activated_at + make_interval(hours => sd.escalate_after_hours))
            or (s.due_at is not null and now() >= s.due_at and d.on_expiry = 'escalate'))
     order by s.due_at nulls last
     limit v_max
  loop
    -- §1.9 pass 4: if escalation itself resolves to nobody, wf_escalate's activation opens the
    -- `unroutable` failure row. The request is never silently parked.
    perform hr.wf_escalate(r.id, 'SLA elapsed');
    v_escalated := v_escalated + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 5 — external results (RD 3)
  -- 🚨 THE AR2 CASE. A shutoff branch whose integration never reports back leaves the instance in
  -- `verifying` with an open `result_unverified` failure. IT NEVER REACHES `completed`.
  for r in
    select s.id, s.workflow_instance_id, s.result_due_at
      from hr.workflow_step s
     where s.state = 'awaiting_result' and s.result_due_at is not null
       and now() >= s.result_due_at
       and not exists (select 1 from hr.workflow_failure f
                        where f.workflow_step_id = s.id and f.failure_class = 'result_unverified'
                          and f.state in ('open','retrying'))
     order by s.result_due_at
     limit v_max
  loop
    perform hr._wf_failure(r.workflow_instance_id, r.id, 'result_unverified',
      jsonb_build_object('result_due_at', r.result_due_at,
        'detail', 'the external effect was never confirmed within its window; this step cannot self-complete'));
    perform hr._wf_notify(r.workflow_instance_id, r.id, 'hr.workflow.result_unverified', 'failure',
                          null, null, '{}'::jsonb);
    v_results := v_results + 1;
  end loop;

  -- ---------------------------------------------------------------- PASS 6 — instance expiry (RD 3)
  for r in
    select i.id, d.on_expiry
      from hr.workflow_instance i
      join hr.workflow_definition d on d.id = i.workflow_definition_id
     where i.state = 'active' and i.due_at is not null and now() >= i.due_at
       and d.on_expiry in ('expire','auto_approve','hold')
     order by i.due_at
     limit v_max
  loop
    if r.on_expiry = 'expire' then
      perform hr._wf_close_instance(r.id, 'expired', 'due_at elapsed with on_expiry=expire');
    elsif r.on_expiry = 'auto_approve' then
      perform hr._wf_event(r.id, null, 'timeout_applied', 'active', 'approved', 'automation',
                           null, null, jsonb_build_object('on_expiry','auto_approve'));
      update hr.workflow_instance set state = 'approved', decided_at = now() where id = r.id;
      perform hr._wf_apply(r.id);
    else
      -- `hold` parks the instance VISIBLY: a failure row somebody owns, never a quiet stall.
      perform hr._wf_failure(r.id, null, 'definition_invalid',
        jsonb_build_object('on_expiry','hold',
          'detail','this instance passed its SLA and its definition says hold; a human must decide what happens next'));
    end if;
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object(
    'granted', true, 'ran_at', now(), 'batch_max', v_max,
    'reminders', v_reminders, 'timeout_warnings', v_warned, 'timeouts', v_timeouts,
    'escalations', v_escalated, 'results_unverified', v_results, 'instances_expired', v_expired);
end $fn$;

comment on function hr.wf_tick is
  'SPEC-WORKFLOW-ENGINE §1.9 — the whole clock. Six bounded passes: reminders, timeout warnings, mode-3 timeouts, escalation, external-result window elapse (the AR2 access-shutoff case), instance expiry. NO CRON JOB EXISTS: D23''s hr-workflow-tick schedule is proposed, not created, per /policies/no-unapproved-schedules.md. Run it by direct call until Arman approves a schedule by exact name and interval.';

revoke all on function hr.wf_tick() from public;
grant execute on function hr.wf_tick() to service_role;

-- ============================================================ 3. 🚨 assert NO cron job was created
do $$
declare v_n integer; v_names text;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    select count(*), string_agg(jobname, ', ')
      into v_n, v_names
      from cron.job
     where command ilike '%wf_tick%' or jobname ilike '%workflow-tick%' or jobname ilike '%hr_workflow%';
    if v_n > 0 then
      raise exception 'hr_c4_05: % cron job(s) reference the HR workflow tick (%) — D23''s schedule is PROPOSED, NOT CREATED, and this lane did not ask Arman for it',
        v_n, v_names;
    end if;
  end if;

  if exists (select 1 from information_schema.tables
              where table_schema = 'scheduler' and table_name = 'sch_task') then
    execute $q$select count(*) from scheduler.sch_task
                where deleted_at is null
                  and (title ilike '%workflow tick%' or title ilike '%workflow-tick%')$q$ into v_n;
    if v_n > 0 then
      raise exception 'hr_c4_05: a scheduler.sch_task named for the workflow tick already exists';
    end if;
  end if;
end $$;

-- ============================================================ assertions
do $$
declare v jsonb;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = 'wf_tick') then
    raise exception 'hr_c4_05: hr.wf_tick was not created';
  end if;
  -- it runs, and on an empty engine it reports six zeros rather than raising
  v := hr.wf_tick();
  if not (v ->> 'granted')::boolean then
    raise exception 'hr_c4_05: hr.wf_tick refused its own migration-time call: %', v;
  end if;
  if (v ->> 'reminders')::integer <> 0 or (v ->> 'escalations')::integer <> 0 then
    raise exception 'hr_c4_05: the first tick was not a no-op on an engine with no instances: %', v;
  end if;

  if not exists (select 1 from hr.access_role
                  where role_key = 'hr_owner' and capabilities @> ARRAY['workflow.cancel',
                        'workflow.reassign','workflow.view_queue','workflow.record_result',
                        'workflow.resolve_failure']) then
    raise exception 'hr_c4_05: hr_owner did not receive the five workflow capabilities';
  end if;
end $$;
