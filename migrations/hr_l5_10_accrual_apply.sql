-- hr_l5_10_accrual_apply.sql — the ONE door the leave accrual engine writes through.
--
-- Build lane L5 (HRB-017), SPEC-LEAVE §3. Applied live via the Supabase MCP and ledgered in
-- public._schema_migrations; this file is the record, not the mechanism.
--
-- ⚠️ **Numbered 10, not 06 or 08.** This landed as `hr_l5_06_accrual_apply` and collided with the
-- lane lead's `hr_l5_06_cases_and_reinstatement`; 07 and 08 were then each taken twice
-- (`hr_l5_07_zero_hours_refusal` + `hr_l5_07_employee_door_acl`,
-- `hr_l5_08_admin_case_door_acl`) and 09 by `hr_l5_09_ledger_request_state`. 10 is the first
-- ordinal that is genuinely free — verified against `public._schema_migrations`, not assumed.
-- The `hr_l5_06_accrual_apply.sql` ledger row was deleted when this one was written.
--
-- ## Why this wrapper exists at all
--
-- `hr.leave_ledger_post` is THE ONE INSERTER for `hr.leave_ledger` and it is deliberately
-- `{postgres=X/postgres}` — PUBLIC's default EXECUTE was revoked, so the aidream connection
-- cannot reach it. It also cannot be reached "just for a moment" from Python: `hr.arm_write()`
-- mints a token bound to `statement_timestamp()`, so arming in one round trip and inserting in
-- the next can never validate. Every `hr.*` write therefore happens inside a SECURITY DEFINER
-- body, and this is the leave engine's — the exact shape `public.hr_recompute_apply` already
-- has for the time lane.
--
-- ## What it does, and deliberately does not do
--
-- It is a WRAPPER. It contains no accrual arithmetic: eligibility, the per-hours-worked
-- cumulative method, the statutory clamp, the caps and the carryover ordering all live in
-- `aidream/services/hr/leave/engine.py` as pure functions, because a rule that lives in two
-- places drifts in one of them. This function only:
--
--   1. resolves the employment's organization (an unknown employment is a refusal envelope,
--      never a raise, so one bad enrollment cannot abort a whole run);
--   2. records a compliance exception when the engine asks for one — the negative-delta
--      over-accrual of §3.3, which writes NO ledger row and therefore gets no automatic
--      exception from the snapshot writer;
--   3. in prospective mode, freezes an `hr.calculation_snapshot` and writes NOTHING else, so a
--      `/hr/calc/*` what-if still satisfies "computed and did not snapshot is a defect"
--      (SPEC-CONTRACTS §3.1 invariant 1) while `written` stays empty (invariant 5);
--   4. otherwise delegates verbatim to `hr.leave_ledger_post`, which takes the advisory lock,
--      refuses a back-date, computes `balance_after`, writes the snapshot and refreshes the
--      enrollment cache in one transaction.
--
-- 🚨 The clamp array is NOT decoration. `hr.write_calculation_snapshot` raises one
-- `hr.raise_compliance_exception` per element of `p_clamps` on every non-prospective call, so
-- §3.4 step 2's "record the clamp AND raise an exception" is satisfied by passing the clamp
-- through — a caller that drops it silently drops the exception too.
--
-- 🚨 `LEAVE_LEDGER_BACKDATE` still RAISES (P0001) out of `hr.leave_ledger_post`. It is not
-- flattened into an envelope here, because a back-date is a programming error in the caller,
-- not a per-enrollment outcome, and the engine's run loop maps it to a named skip.

create or replace function public.hr_leave_accrual_apply(
  p_employment_id       uuid,
  p_leave_policy_id     uuid,
  p_entry_kind          text,
  p_hours_delta         numeric,
  p_occurred_on         date,
  p_period_key          text,
  p_note                text                default null,
  p_engine_key          text                default 'accrual_engine',
  p_engine_version      text                default '1',
  p_rule_version_ids    uuid[]              default '{}'::uuid[],
  p_calc                jsonb               default '{}'::jsonb,
  p_snapshot_inputs     jsonb               default '{}'::jsonb,
  p_clamps              jsonb               default '[]'::jsonb,
  p_source_workweek_id  uuid                default null,
  p_amount              numeric             default null,
  p_rate                numeric             default null,
  p_actor_type          text                default 'automation',
  p_actor_employment_id uuid                default null,
  p_actor_user_id       uuid                default null,
  p_prospective         boolean             default false,
  p_subject_id          uuid                default null,
  p_jurisdiction_key    text                default null,
  p_exception           jsonb               default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public', 'hr'
as $function$
declare
  v_org   uuid;
  v_exc   uuid;
  v_snap  uuid;
  v_post  jsonb;
  v_juris text;
  v_snapin jsonb;
begin
  select em.organization_id into v_org
    from hr.employment em
   where em.id = p_employment_id and em.deleted_at is null;

  if v_org is null then
    -- An envelope, not a raise: SPEC-LEAVE §3.6 — a per-enrollment failure never aborts the run.
    return jsonb_build_object(
      'ok', false, 'refused', 'LEAVE_EMPLOYMENT_NOT_FOUND',
      'detail', format('no live hr.employment %s', p_employment_id));
  end if;

  -- §3.3: the downward-timesheet-correction case writes no ledger row, so the snapshot writer
  -- never runs and the exception has to be raised explicitly. Same door, so there is exactly one
  -- place a leave write of any kind happens.
  if p_exception is not null then
    v_exc := hr.raise_compliance_exception(
      v_org,
      p_exception ->> 'jurisdiction_key',
      nullif(p_exception ->> 'rule_id', '')::uuid,
      nullif(p_exception ->> 'rule_version', '')::integer,
      coalesce(p_exception ->> 'class', 'leave-accrual'),
      coalesce(p_exception ->> 'code', 'hr_leave_accrual_exception'),
      coalesce(p_exception ->> 'message',
               'The leave accrual engine raised an exception with no message. That is a bug.'),
      coalesce(p_exception -> 'org_config_ref', '{}'::jsonb));
  end if;

  -- 🚨 `hr.calculation_snapshot.jurisdiction_key` is NOT NULL (verified live), and the engine
  -- legitimately has no key when an employment has no stamped work location. Passing the null
  -- through would be a 23502 on a wage-adjacent record. `hr._leave_jurisdiction_key_or_federal`
  -- is the lane's canonical ladder — the stamped resolver, then the primary assignment's work
  -- location, then the federal key — and it is the SAME ladder `hr.leave_ledger_post` walks, so
  -- a snapshot written by either door names the same jurisdiction for the same person.
  --
  -- Its last rung returns 'US' silently, and a fallback nobody can see IS a fabricated
  -- jurisdiction. So the fallback is stamped into the snapshot's own inputs: a reader can always
  -- tell a resolved key from a substituted one.
  v_juris  := p_jurisdiction_key;
  v_snapin := coalesce(p_snapshot_inputs, '{}'::jsonb);
  if v_juris is null then
    v_juris := hr._leave_jurisdiction_key_or_federal(p_employment_id);
    v_snapin := v_snapin || jsonb_build_object(
      'jurisdiction_key_fallback', true,
      'jurisdiction_key_fallback_reason',
      'the accrual engine resolved no stamped jurisdiction for this employment; '
      || 'hr._leave_jurisdiction_key_or_federal supplied ' || coalesce(v_juris, 'US'));
  end if;

  -- NOTHING DUE. §3.4 step 5: a zero writes no LEDGER entry — a run that posts zero-hour rows
  -- makes the ledger unreadable. It does not follow that the calculation goes unrecorded: when a
  -- subject is named (the `/hr/calc/*` lane, which was asked a direct question and owes a
  -- `snapshot_id` on its answer), the snapshot is still frozen so "nothing was due, and here is
  -- why" is defensible later. The accrual RUN passes no subject and gets no snapshot, because one
  -- row per enrollment per day for every uneventful check is landfill, not evidence.
  if p_hours_delta is null then
    if p_subject_id is not null then
      v_snap := hr.write_calculation_snapshot(
        v_org, 'hr_leave_enrollment', p_subject_id, 'leave_accrual', v_juris,
        p_occurred_on, coalesce(p_engine_key, 'accrual_engine'), coalesce(p_engine_version, '1'),
        jsonb_build_object('rule_version_ids',
                           to_jsonb(coalesce(p_rule_version_ids, '{}'::uuid[]))),
        '{}'::jsonb,
        v_snapin || jsonb_build_object('entry_kind', p_entry_kind, 'period_key', p_period_key),
        jsonb_build_object('hours_delta', null::numeric, 'posted', false),
        coalesce(p_actor_type, 'automation'), p_actor_user_id, p_employment_id,
        coalesce(p_clamps, '[]'::jsonb), coalesce(p_prospective, false), null, null);
    end if;
    return jsonb_build_object(
      'ok', true, 'posted', false, 'prospective', coalesce(p_prospective, false),
      'snapshot_id', v_snap, 'compliance_exception_id', v_exc,
      'detail', 'no ledger entry was offered; any exception supplied was recorded');
  end if;

  if coalesce(p_prospective, false) then
    v_snap := hr.write_calculation_snapshot(
      v_org,
      'hr_leave_enrollment',
      coalesce(p_subject_id, p_employment_id),
      'leave_accrual',
      v_juris,
      p_occurred_on,
      coalesce(p_engine_key, 'accrual_engine'),
      coalesce(p_engine_version, '1'),
      jsonb_build_object('rule_version_ids',
                         to_jsonb(coalesce(p_rule_version_ids, '{}'::uuid[]))),
      '{}'::jsonb,
      v_snapin || jsonb_build_object('entry_kind', p_entry_kind, 'period_key', p_period_key),
      jsonb_build_object('hours_delta', p_hours_delta),
      coalesce(p_actor_type, 'automation'),
      p_actor_user_id,
      p_employment_id,
      coalesce(p_clamps, '[]'::jsonb),
      true,   -- prospective: this result is explicitly NOT evidence
      null, null);

    return jsonb_build_object(
      'ok', true, 'posted', false, 'prospective', true,
      'snapshot_id', v_snap, 'compliance_exception_id', v_exc,
      'would_post', jsonb_build_object('entry_kind', p_entry_kind,
                                       'hours_delta', p_hours_delta,
                                       'occurred_on', p_occurred_on,
                                       'period_key', p_period_key));
  end if;

  v_post := hr.leave_ledger_post(
    p_employment_id, p_leave_policy_id, p_entry_kind, p_hours_delta, p_occurred_on,
    p_note,
    null,                       -- p_leave_request_id: an accrual is never a request's deduction
    null,                       -- p_reverses_entry_id: a reversal is §4.6's, not this engine's
    p_source_workweek_id,
    null,                       -- p_source_work_interval_id: accrual is cumulative over many
    p_amount, p_rate,
    coalesce(p_engine_key, 'accrual_engine'),
    coalesce(p_engine_version, '1'),
    coalesce(p_rule_version_ids, '{}'::uuid[]),
    coalesce(p_calc, '{}'::jsonb),
    coalesce(p_actor_type, 'automation'),
    p_actor_employment_id, p_actor_user_id,
    p_period_key,
    v_snapin,
    coalesce(p_clamps, '[]'::jsonb));

  return coalesce(v_post, '{}'::jsonb)
    || jsonb_build_object(
         'posted', coalesce((v_post ->> 'ok')::boolean, false)
                   and not coalesce((v_post ->> 'idempotent_noop')::boolean, false),
         'prospective', false,
         'compliance_exception_id', v_exc);
end
$function$;

comment on function public.hr_leave_accrual_apply(
  uuid, uuid, text, numeric, date, text, text, text, text, uuid[], jsonb, jsonb, jsonb,
  uuid, numeric, numeric, text, uuid, uuid, boolean, uuid, text, jsonb) is
  'SPEC-LEAVE §3 — the only door aidream writes leave ledger entries, accrual snapshots and '
  'accrual compliance exceptions through. Delegates to hr.leave_ledger_post (THE ONE INSERTER); '
  'contains no accrual arithmetic, which lives in aidream/services/hr/leave/engine.py.';

revoke all on function public.hr_leave_accrual_apply(
  uuid, uuid, text, numeric, date, text, text, text, text, uuid[], jsonb, jsonb, jsonb,
  uuid, numeric, numeric, text, uuid, uuid, boolean, uuid, text, jsonb) from public;

-- 🚨 `revoke ... from public` does NOT remove a role-specific grant, and Supabase's ALTER
-- DEFAULT PRIVILEGES hands `anon` EXECUTE on every new public function. Measured live: after the
-- revoke above the ACL still read `anon=X`. A signed-out caller must never reach a leave writer,
-- so anon is revoked by name — exactly the ACL `public.hr_recompute_apply` carries.
revoke execute on function public.hr_leave_accrual_apply(
  uuid, uuid, text, numeric, date, text, text, text, text, uuid[], jsonb, jsonb, jsonb,
  uuid, numeric, numeric, text, uuid, uuid, boolean, uuid, text, jsonb) from anon;

grant execute on function public.hr_leave_accrual_apply(
  uuid, uuid, text, numeric, date, text, text, text, text, uuid[], jsonb, jsonb, jsonb,
  uuid, numeric, numeric, text, uuid, uuid, boolean, uuid, text, jsonb) to authenticated;

grant execute on function public.hr_leave_accrual_apply(
  uuid, uuid, text, numeric, date, text, text, text, text, uuid[], jsonb, jsonb, jsonb,
  uuid, numeric, numeric, text, uuid, uuid, boolean, uuid, text, jsonb) to service_role;
