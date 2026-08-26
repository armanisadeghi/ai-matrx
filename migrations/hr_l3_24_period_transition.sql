-- HR domain L3 — migration 5 of 8 (register item HRB-015, lane L3 time-and-attendance, builder SQL-2).
--
-- THE PAY-PERIOD STATE MACHINE, ACTOR-STAMPED (L3-24) — plus the one earning code the lane's own
-- seed was missing. `hr.pay_period_transition` is the actor-stamped caller OVER the existing
-- `hr._pay_period_transition()` BEFORE UPDATE trigger; it does not replace it, does not duplicate
-- its rule set, and exists so a refusal arrives as a sentence a person can act on instead of a
-- Postgres `raise`.
--
-- Authority: SPEC-TIME §1.3, §2.7, §6.4, §7.1, §14 D7/D8; SPEC-DATA-MODEL §7.3, §6.10;
-- R-L3 U-03 / U-13. Applied live as `hr_l3_24_period_transition`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THE REFUSAL ENVELOPE IS THE **CLIENT'S**, NOT `hr._punch_refusal`'s, AND THE DISAGREEMENT IS
--    RECORDED RATHER THAN SPLIT. `features/hr/time/api/rpc.ts` decodes `{ ok, data, error,
--    message, user_message, details }` with `error` a **flat code string** (`code: data.error ??
--    'hr_validation_error'`, and `isPeriodLocked` compares it to `'hr_period_locked'`).
--    `hr._punch_refusal` returns `{ ok:false, error: { code, message, details } }` — a NESTED
--    object. Fed through `callHrTimeRpc` that yields `code === [object Object]`, `isPeriodLocked`
--    never fires, and the post-lock routing this lane depends on silently dies. The client contract
--    wins because it is the one that is observably load-bearing. `hr._time_refusal` below emits the
--    flat shape and `hr._time_ok` wraps success as `{ ok:true, data:{…} }` — which is what
--    `callHrTimeRpc` unwraps.
--    **DEBT, owner the punch lane (SQL-1 / HRB-015 punch half):** `hr._punch_refusal`'s nested
--    `error` object does not decode in `rpc.ts`, and **no `public.hr_punch_*` wrapper exists at all**
--    (verified live: zero rows in `pg_proc` for `public.hr_punch%`), so `hr_punch_record`,
--    `hr_clock_state`, `hr_punch_correct`, `hr_punch_void` and `hr_punch_register` are unreachable
--    from a browser today. Both are that lane's to close; neither is silently patched from here.
--
-- 2. THE LEGAL-PAIR LIST IS MIRRORED, NOT MOVED. `hr._pay_period_transition()` is and stays the
--    gate: it raises on an illegal pair regardless of what calls it. This function checks the same
--    pair FIRST only so the caller gets `hr_period_transition_illegal` with `legal_next_states`
--    named, instead of a P0001 with a message no surface can route on. If the two ever disagree the
--    trigger wins — it is the one that cannot be bypassed. The list is not a second rule set; it is
--    a translation of one.
--
-- 3. 🚨 SUBMIT CREATES THE `hr.pay_period_employment` ROWS, BECAUSE NOTHING ELSE DOES AND THE
--    ATTESTATION FLOW TARGETS THEM. §8.2's flow targets `hr_pay_period_employment`; there is no row
--    to target until somebody writes one, and no lane had. So submit materialises one row per
--    INCLUDED employment — pay-group member, active as of the period end, worker class in the
--    enabled set (§8) — idempotently. **The row's computed figures are NOT fabricated**:
--    `total_hours` takes the column default 0 and `total_amount` stays NULL, with
--    `calc.totals_pending = true` and a sentence saying so, because the recompute engine (E-11,
--    another lane) owns those numbers. A surface that reads 0 as "worked nothing" is reading a
--    default, and the calc block tells it which.
--
-- 4. THE ATTESTATION STATEMENT IS STORED ON THE ROW AT SUBMIT, AS SHOWN. §2.2: the statement the
--    employee saw is evidence; an org editing `hr.time_and_attendance.attestation_statement`
--    afterwards must never change what a past attestation says it was. The knob's value at submit
--    time is copied onto `hr.pay_period_employment.attestation_statement` and never re-read.
--
-- 5. `employee_attestation_required = false` OPENS THE MANAGER FLOW DIRECTLY, AND SAYS SO. The knob
--    exists (§13) and turning it off must not leave a period with no workflow at all. When it is
--    false, submit opens `timecard_approval` per employment instead of `timecard_attestation`, and
--    the response names which flow was opened. Nothing is skipped silently.
--
-- 6. APPROVE IS BLOCKED BY `open` ROWS AND **NEVER** BY A DISPUTE. §2.7 / §6.3: approving over a
--    preserved disagreement is legitimate AND recorded. `disputes_open` is returned as a count so
--    the surface can say it in words ("3 timecards are approved with an open disagreement"). A
--    server that refused here would be quietly deciding a management question.
--
-- 7. 🚨 REOPEN RETURNS THE NOTICE AS TEXT THE CLIENT RENDERS VERBATIM, AND THE NOTICE IS THE LAW,
--    NOT A HINT. Reopening does not un-export and does not re-pay. A delivered export is never
--    regenerated in place because regenerating double-pays; the fix is an adjustment. That is not a
--    knob and nothing here can be configured to change it.
--
-- 8. AUTHORITY IS A CAPABILITY, RESOLVED AS OF THE PERIOD END DATE. §2.7's role variations map onto
--    the live capability set exactly: every transition needs `payroll.read` (hr_admin, hr_owner,
--    payroll_admin — NOT manager, who is read-only here), and `exported` additionally needs
--    `payroll.export` (hr_owner, payroll_admin), which is precisely "HR admin: all transitions
--    except export". `as_of` is `period_end_on`, never `now()` (§0 law 3).
--
-- 9. `UNPAID` CLOSES A GAP THE LANE'S OWN SEED LEFT. `hr.work_interval.hours_category` admits
--    `unpaid_leave` and `earning_code_id` is NOT NULL, so with no unpaid-leave code an unpaid-leave
--    interval was unwritable. SPEC-TIME §5.2 requires it to render "with hours and a zero amount,
--    never omitted", so `multiplier = 0` here is a statement of fact about unpaid leave, not a
--    fabricated money figure. The template count moves 23 → 24 and `hr_l3_20`'s own assertion is
--    updated in place, in this lane's own file, rather than left as a landmine.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

-- ============================================================ 1. the UNPAID earning code (RD 9)
select set_config('hr.privileged_write', 'on', false);

insert into hr.earning_code
  (organization_id, code, name, hours_category, is_overtime, multiplier, flat_amount,
   counts_toward_ot, counts_toward_hours_of_service, counts_toward_sick_accrual,
   is_statutory_premium, jurisdiction_rule_class, external_code_map, is_seeded, is_active,
   visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
       'UNPAID', 'Unpaid leave', 'unpaid_leave', false, 0.0, null::numeric,
       false, false, false, false, null, '{}'::jsonb, true, true,
       'internal'::platform.visibility
on conflict (organization_id, code) do nothing;

-- ============================================================ 2. the client-shaped envelope (RD 1)
create or replace function hr._time_refusal(p_code text, p_message text,
                                            p_details jsonb default '{}'::jsonb)
returns jsonb language sql immutable as $fn$
  -- THE SHAPE `features/hr/time/api/rpc.ts` ACTUALLY DECODES: a FLAT `error` code string, a
  -- `message`, and a `user_message` rendered verbatim to a person. Never a nested error object.
  select jsonb_build_object(
    'ok', false,
    'error', p_code,
    'message', p_message,
    'user_message', p_message,
    'details', coalesce(p_details, '{}'::jsonb));
$fn$;

comment on function hr._time_refusal is
  'The Time & Attendance refusal envelope, shaped for features/hr/time/api/rpc.ts (flat `error` code, `message`, `user_message`, `details`). Deliberately NOT hr._punch_refusal''s nested object, which that client cannot decode — see hr_l3_24 RD 1.';

create or replace function hr._time_ok(p_data jsonb)
returns jsonb language sql immutable as $fn$
  select jsonb_build_object('ok', true, 'data', coalesce(p_data, '{}'::jsonb));
$fn$;

comment on function hr._time_ok is
  'Success envelope for the Time & Attendance RPC lane. callHrTimeRpc returns `data`, so the payload is exactly what the typed service surface receives.';

-- ============================================================ 3. small shared resolvers
create or replace function hr._time_actor_employment(p_user uuid, p_organization_id uuid)
returns uuid language sql stable security definer set search_path to 'hr','public' as $fn$
  select em.id from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where e.login_user_id = p_user and em.organization_id = p_organization_id
     and em.deleted_at is null
   order by case em.status when 'active' then 0 else 1 end, em.created_at desc
   limit 1;
$fn$;

comment on function hr._time_actor_employment is
  'The acting EMPLOYMENT for a login in one organization — the actor stamp every hr.* write carries. A bare user id is never the actor (SPEC-WORKFLOW-ENGINE §0.1 seam).';

-- ============================================================ 4. hr.pay_period_transition (L3-24)
create or replace function hr.pay_period_transition(p_pay_period_id uuid,
                                                    p_to_state text,
                                                    p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  v_uid      uuid := auth.uid();
  v_per      hr.pay_period%rowtype;
  v_at       date;
  v_actor    uuid;
  v_cap      text;
  v_allow    boolean;
  v_open     integer;
  v_disputes integer;
  v_names    text;
  v_rows     integer := 0;
  v_opened   integer := 0;
  v_flow     text;
  v_stmt     text;
  v_classes  text[];
  v_notice   text;
  v_req      jsonb;
  v_ppe      uuid;
  r          record;
begin
  if v_uid is null then
    return hr._time_refusal('hr_no_authenticated_caller',
      'A pay-period transition is always taken by somebody. Sign in and try again.');
  end if;
  if p_pay_period_id is null or coalesce(btrim(p_to_state), '') = '' then
    return hr._time_refusal('hr_arguments_incomplete',
      'Both the pay period and the state to move it to are required.',
      jsonb_build_object('p_pay_period_id', p_pay_period_id, 'p_to_state', p_to_state));
  end if;

  select * into v_per from hr.pay_period where id = p_pay_period_id;
  if not found then
    return hr._time_refusal('hr_pay_period_not_found',
      'No pay period with that id exists.',
      jsonb_build_object('pay_period_id', p_pay_period_id));
  end if;

  -- RD 8: the EVENT date, never now()
  v_at := v_per.period_end_on;

  -- ---------------------------------------------------------------- RD 2: the pair, as a sentence
  if (v_per.state, p_to_state) not in (
        ('open','submitted'), ('submitted','approved'), ('approved','exported'),
        ('exported','locked'), ('locked','closed'), ('locked','reopened'),
        ('reopened','approved')) then
    return hr._time_refusal('hr_period_transition_illegal',
      format('A pay period cannot move from %s to %s.', v_per.state, p_to_state),
      jsonb_build_object(
        'pay_period_id', v_per.id, 'from_state', v_per.state, 'to_state', p_to_state,
        'legal_next_states', to_jsonb(
          coalesce((select array_agg(t) from (values
              ('open','submitted'), ('submitted','approved'), ('approved','exported'),
              ('exported','locked'), ('locked','closed'), ('locked','reopened'),
              ('reopened','approved')) v(f, t) where v.f = v_per.state), '{}'::text[])),
        'gate', 'hr._pay_period_transition() is the trigger that enforces this; this refusal only names it'));
  end if;

  -- ---------------------------------------------------------------- RD 8: authority
  v_cap := case when p_to_state = 'exported' then 'payroll.export' else 'payroll.read' end;
  if not hr.capability(v_uid, v_cap, null, v_at) then
    return hr._time_refusal('hr_period_transition_authority_required',
      case when p_to_state = 'exported'
           then 'Only payroll can move a period to exported. You do not hold that capability in this organization as of this period.'
           else 'Moving a pay period is an HR or payroll admin act. You do not hold that capability in this organization as of this period. A manager approves timecards; the period itself moves on the periods screen.' end,
      jsonb_build_object('capability_required', v_cap, 'as_of', v_at,
                         'pay_group_id', v_per.pay_group_id, 'to_state', p_to_state));
  end if;

  v_actor := hr._time_actor_employment(v_uid, v_per.organization_id);
  if v_actor is null then
    return hr._time_refusal('hr_actor_not_employed',
      'You hold no employment in this organization, so this transition cannot be attributed to anybody.',
      jsonb_build_object('organization_id', v_per.organization_id));
  end if;

  -- ---------------------------------------------------------------- per-transition preconditions
  if p_to_state = 'submitted' and current_date <= v_per.period_end_on then
    return hr._time_refusal('hr_period_not_ended',
      format('This period runs to %s. A period is submitted after its end date has passed, not before.',
             to_char(v_per.period_end_on, 'FMDay DD FMMonth YYYY')),
      jsonb_build_object('period_end_on', v_per.period_end_on, 'today', current_date));
  end if;

  if p_to_state = 'reopened' then
    v_allow := coalesce((hr._knob('hr.time_and_attendance','allow_period_reopen') #>> '{}')::boolean, true);
    if not v_allow then
      return hr._time_refusal('hr_period_reopen_disabled',
        'Reopening a locked period is switched off for this organization. Correct it with an adjustment instead — the adjustment rides the next export, tagged to this period.',
        jsonb_build_object('knob', 'hr.time_and_attendance.allow_period_reopen',
                           'door', 'hr_time_adjustment_create'));
    end if;
    if coalesce(btrim(p_reason), '') = '' then
      return hr._time_refusal('hr_period_reopen_reason_required',
        'Reopening a locked period requires a written reason. It is recorded on the period and travels with it.');
    end if;
  end if;

  -- 🚨 RD 6: `open` rows block; a DISPUTE NEVER DOES.
  select count(*) into v_open from hr.pay_period_employment
   where pay_period_id = p_pay_period_id and state = 'open';
  select count(*) into v_disputes from hr.pay_period_employment
   where pay_period_id = p_pay_period_id and disputed_at is not null and dispute_resolved_at is null;

  if p_to_state = 'approved' and v_open > 0 then
    select string_agg(e.display_name, ', ' order by e.display_name) into v_names
      from (select ppe.employment_id from hr.pay_period_employment ppe
             where ppe.pay_period_id = p_pay_period_id and ppe.state = 'open'
             limit 10) x
      join hr.employment em on em.id = x.employment_id
      join hr.employee e on e.id = em.employee_id;
    return hr._time_refusal('hr_period_has_open_timecards',
      format('%s timecard(s) in this period are still open and have not been decided. Approve or exclude them first.', v_open),
      jsonb_build_object('open_count', v_open, 'sample', coalesce(v_names, ''),
                         'disputes_open', v_disputes,
                         'note', 'An unresolved disagreement does NOT block approval — only an undecided timecard does.'));
  end if;

  -- ---------------------------------------------------------------- the write
  perform hr.arm_write();
  update hr.pay_period
     set state = p_to_state,
         submitted_at = case when p_to_state = 'submitted' then now() else submitted_at end,
         submitted_by_employment_id = case when p_to_state = 'submitted' then v_actor
                                           else submitted_by_employment_id end,
         approved_at = case when p_to_state = 'approved' then now() else approved_at end,
         approved_by_employment_id = case when p_to_state = 'approved' then v_actor
                                          else approved_by_employment_id end,
         exported_at = case when p_to_state = 'exported' then now() else exported_at end,
         locked_at = case when p_to_state = 'locked' then now() else locked_at end,
         locked_by_employment_id = case when p_to_state = 'locked' then v_actor
                                        else locked_by_employment_id end,
         closed_at = case when p_to_state = 'closed' then now() else closed_at end,
         reopened_at = case when p_to_state = 'reopened' then now() else reopened_at end,
         reopen_reason = case when p_to_state = 'reopened' then btrim(p_reason) else reopen_reason end
   where id = p_pay_period_id;

  -- ---------------------------------------------------------------- submit: rows + instances (RD 3-5)
  if p_to_state = 'submitted' then
    v_classes := hr._time_punch_enabled_worker_classes();
    v_stmt := hr._knob('hr.time_and_attendance','attestation_statement') #>> '{}';
    v_flow := case when coalesce((hr._knob('hr.time_and_attendance','employee_attestation_required')
                                    #>> '{}')::boolean, true)
                   then 'timecard_attestation' else 'timecard_approval' end;

    for r in
      select em.id employment_id
        from hr.employment em
        left join lateral (
          select pa.worker_class from hr.position_assignment pa
           where pa.employment_id = em.id and pa.deleted_at is null
             and pa.effective_from <= v_at
             and (pa.effective_to is null or pa.effective_to >= v_at)
           order by pa.is_primary desc, pa.effective_from desc limit 1
        ) pa on true
       where em.pay_group_id = v_per.pay_group_id
         and em.organization_id = v_per.organization_id
         and em.deleted_at is null
         and em.status in ('active','on_leave','suspended','terminated')
         -- §8: a gated worker class is not in the period at all.
         and coalesce(pa.worker_class, 'employee') = any (v_classes)
    loop
      perform hr.arm_write();
      insert into hr.pay_period_employment
        (organization_id, pay_period_id, employment_id, state, attestation_statement,
         engine_key, engine_version, calc)
      values (v_per.organization_id, p_pay_period_id, r.employment_id, 'open',
              -- RD 4: the statement AS SHOWN, frozen onto the row
              case when v_flow = 'timecard_attestation' then v_stmt else null end,
              'hr.time.period_lifecycle', 'l3.1',
              jsonb_build_object(
                'totals_pending', true,
                'note', 'This row was opened by the period submit. total_hours reads 0 because no total has been computed yet, not because none were worked; total_amount is absent for the same reason. The recompute engine (E-11) writes both.',
                'opened_by', 'hr.pay_period_transition',
                'flow_opened', v_flow))
      on conflict (pay_period_id, employment_id) do nothing;
      if found then v_rows := v_rows + 1; end if;

      select id into v_ppe from hr.pay_period_employment
       where pay_period_id = p_pay_period_id and employment_id = r.employment_id;

      v_req := hr.wf_request(v_flow, 'hr_pay_period_employment', v_ppe, v_per.organization_id,
                 jsonb_build_object('pay_period_id', p_pay_period_id,
                                    'employment_id', r.employment_id,
                                    'period_end_on', v_per.period_end_on,
                                    'attestation_statement',
                                      case when v_flow = 'timecard_attestation' then v_stmt else null end),
                 r.employment_id, false,
                 format('period:%s:emp:%s:%s', p_pay_period_id, r.employment_id, v_flow));
      if coalesce((v_req ->> 'granted')::boolean, false) then
        v_opened := v_opened + 1;
      end if;
    end loop;
  end if;

  -- ---------------------------------------------------------------- RD 7: the reopen notice
  if p_to_state = 'reopened' then
    v_notice := 'Reopening this period does NOT un-export it and does NOT re-pay it. A payroll export that has already been delivered is never regenerated in place, because regenerating it pays the same hours twice. Anything that needs fixing is fixed with an adjustment, which rides the next export tagged to this period.';
  elsif p_to_state = 'approved' and v_disputes > 0 then
    v_notice := format('%s timecard(s) are approved with an open disagreement. The disagreement is preserved and travels to the export.', v_disputes);
  elsif p_to_state = 'submitted' then
    v_notice := format('%s timecard(s) were opened for this period and %s %s instance(s) were started.',
                       (select count(*) from hr.pay_period_employment where pay_period_id = p_pay_period_id),
                       v_opened, v_flow);
  end if;

  return hr._time_ok(jsonb_build_object(
    'payPeriodId', p_pay_period_id,
    'fromState', v_per.state,
    'toState', p_to_state,
    'disputesOpen', v_disputes,
    'transitionedAt', now(),
    'notice', v_notice,
    'actorEmploymentId', v_actor,
    'rowsOpened', v_rows,
    'workflowInstancesOpened', v_opened,
    'workflowFlowKey', case when p_to_state = 'submitted' then v_flow else null end,
    -- the reopen law, returned every time so no surface has to remember it
    'reopenDoesNotUnexport', true,
    'provenance', jsonb_build_object(
      'engine_key', 'hr.time.period_lifecycle', 'engine_version', 'l3.1',
      'rule_version_ids', '[]'::jsonb,
      'as_of', v_at,
      'note', 'A period transition is a state change, not a computed figure: it carries no jurisdictional rule versions. Every HOURS or MONEY figure on this period carries its own {{CALC}} block on hr.work_interval / hr.workweek / hr.pay_period_employment.')));
end $fn$;

comment on function hr.pay_period_transition is
  'SPEC-TIME §1.3 / §2.7 / §7.1 / L3-24 — the pay-period state machine, actor-stamped, over hr._pay_period_transition(). Submit is refused before the period end date and opens one timecard_attestation instance per included employment (or timecard_approval when employee_attestation_required is off). Approve is refused while any employment row is open and is PERMITTED with an unresolved dispute, whose count is returned so the surface can say it in words. Reopen is gated by allow_period_reopen, requires a reason, and returns the plain-words notice that reopening does not un-export and does not re-pay.';

-- ============================================================ 5. the PostgREST wrapper
create or replace function public.hr_pay_period_transition(p_pay_period_id uuid,
                                                           p_to_state text,
                                                           p_reason text default null)
returns jsonb language sql security definer set search_path to 'public','hr' as $fn$
  select hr.pay_period_transition($1, $2, $3);
$fn$;

comment on function public.hr_pay_period_transition is
  'PostgREST-reachable wrapper for hr.pay_period_transition. The `hr` schema is not exposed to PostgREST, so every client-called RPC ships a thin public.hr_<name> delegate carrying no logic (R-L3 U-03). `anon` holds nothing.';

do $$
declare f text;
begin
  foreach f in array ARRAY[
    'hr._time_refusal(text,text,jsonb)',
    'hr._time_ok(jsonb)',
    'hr._time_actor_employment(uuid,uuid)',
    'hr.pay_period_transition(uuid,text,text)',
    'public.hr_pay_period_transition(uuid,text,text)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions
do $$
declare v jsonb; v_n integer; v_missing text;
begin
  if to_regprocedure('hr.pay_period_transition(uuid,text,text)') is null
     or to_regprocedure('public.hr_pay_period_transition(uuid,text,text)') is null then
    raise exception 'hr_l3_24: the transition function or its wrapper was not created';
  end if;
  if has_function_privilege('anon', 'public.hr_pay_period_transition(uuid,text,text)', 'execute') then
    raise exception 'hr_l3_24: anon holds EXECUTE on hr_pay_period_transition';
  end if;

  -- RD 9: every hours_category now has at least one code, so no interval kind is unwritable
  select string_agg(s.c, ', ') into v_missing from (
    select w.c from (values ('worked'),('paid_leave'),('unpaid_leave'),('holiday'),('on_call'),('premium')) w(c)
     where not exists (select 1 from hr.earning_code ec
                        where ec.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                          and ec.hours_category = w.c and ec.is_active and ec.deleted_at is null)) s;
  if v_missing is not null then
    raise exception 'hr_l3_24: hours_category values with no active earning code: %', v_missing;
  end if;
  select count(*) into v_n from hr.earning_code
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and is_seeded and deleted_at is null;
  if v_n <> 24 then
    raise exception 'hr_l3_24: the earning-code template holds % rows, expected 24 (23 from hr_l3_20 + UNPAID)', v_n;
  end if;

  -- the refusal envelope is FLAT, which is the whole point of RD 1
  v := hr._time_refusal('hr_period_locked', 'x');
  if jsonb_typeof(v -> 'error') <> 'string' or (v ->> 'error') <> 'hr_period_locked' then
    raise exception 'hr_l3_24: hr._time_refusal must emit a FLAT error code string; got %', v;
  end if;

  -- the RPC refuses an unauthenticated caller with a NAMED code rather than raising
  v := hr.pay_period_transition('00000000-0000-0000-0000-000000000000'::uuid, 'submitted', null);
  if coalesce((v ->> 'ok')::boolean, true) or coalesce(v ->> 'error','') = '' then
    raise exception 'hr_l3_24: pay_period_transition did not refuse with a named code: %', v;
  end if;
end $$;
