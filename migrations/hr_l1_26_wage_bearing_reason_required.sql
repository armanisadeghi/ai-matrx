-- hr_l1_26_wage_bearing_reason_required.sql
--
-- A 40.00 reached a live position row through hr._l1_apply_position with
-- change_reason_category_id NULL and metadata empty. The provenance chain answered WHO
-- and WHEN completely and was silent on WHY. Attribution without a reason answers the
-- audit question nobody asks: whoever reads that row later cannot tell a correction from
-- a raise from a typo.
--
-- SPEC-EMPLOYEES groups "the four classification axes" (worker_class, flsa_status,
-- pay_basis, schedule_class) with FTE and standard hours/week as the assignment fields
-- that decide money. Those six now require a stated reason to MOVE.
--
-- Applied live 2026-08-27 and ledgered in public._schema_migrations. This file is a
-- replay-safe re-statement: it rewrites the function's text in place, so it survives an
-- unrelated edit to the rest of the body and refuses loudly if its anchor is gone.
-- NOTE: hr_l1_27 widens the condition below; run it after this file.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('hr._l1_apply_position(jsonb,uuid,uuid)'::regprocedure);

  if position('WAGE-BEARING FIELDS NEED A STATED REASON' in v_def) > 0 then
    raise notice 'hr_l1_26: already applied'; return;
  end if;

  -- Anchored on arm_write() so the guard lands AFTER v_prior is loaded (it compares old
  -- against new) and BEFORE anything is written.
  v_new := replace(v_def, '  perform hr.arm_write();', $guard$
  -- 🚨 WAGE-BEARING FIELDS NEED A STATED REASON.
  -- SPEC-EMPLOYEES groups "the four classification axes" (worker_class, flsa_status,
  -- pay_basis, schedule_class) with FTE and standard hours/week as the assignment fields
  -- that decide money: overtime eligibility, proration, and what a day of leave costs.
  --
  -- A 40.00 reached a live row through this door with change_reason_category_id NULL and
  -- metadata empty. The chain answered WHO and WHEN completely and was silent on WHY —
  -- and attribution without a reason answers the audit question nobody asks. Whoever
  -- reads that row later cannot tell a correction from a raise from a typo.
  --
  -- Only a CHANGE is gated: re-stating a value somebody already agreed to is not a new
  -- decision, and demanding a reason for it would train people to type one anyway.
  -- Refusal is DATA and NAMES THE FIELDS, because "a reason is required" leaves the
  -- author hunting which of six axes they moved.
  if nullif(p_payload ->> 'change_reason_category_id','') is null then
    declare v_wage text[] := '{}';
    begin
      if p_payload ? 'worker_class' and coalesce(p_payload ->> 'worker_class','')
         is distinct from coalesce(v_prior.worker_class,'') then
        v_wage := array_append(v_wage, 'worker class'); end if;
      if p_payload ? 'flsa_status' and coalesce(p_payload ->> 'flsa_status','')
         is distinct from coalesce(v_prior.flsa_status,'') then
        v_wage := array_append(v_wage, 'FLSA status'); end if;
      if p_payload ? 'pay_basis' and coalesce(p_payload ->> 'pay_basis','')
         is distinct from coalesce(v_prior.pay_basis,'') then
        v_wage := array_append(v_wage, 'pay basis'); end if;
      if p_payload ? 'schedule_class' and coalesce(p_payload ->> 'schedule_class','')
         is distinct from coalesce(v_prior.schedule_class,'') then
        v_wage := array_append(v_wage, 'schedule class'); end if;
      if p_payload ? 'fte' and (p_payload ->> 'fte')::numeric
         is distinct from v_prior.fte then
        v_wage := array_append(v_wage, 'FTE'); end if;
      if p_payload ? 'standard_hours_per_week'
         and nullif(p_payload ->> 'standard_hours_per_week','')::numeric
         is distinct from v_prior.standard_hours_per_week then
        v_wage := array_append(v_wage, 'standard hours a week'); end if;

      if cardinality(v_wage) > 0 then
        return jsonb_build_object('ok', false, 'reason', 'reason_required',
          'field', 'change_reason_category_id',
          'wage_bearing_fields', to_jsonb(v_wage),
          'detail', 'Changing a wage-bearing field requires a reason: '
                     || array_to_string(v_wage, ', ') || '.');
      end if;
    end;
  end if;

  perform hr.arm_write();$guard$);

  if v_new = v_def then
    raise exception 'hr_l1_26: anchor "perform hr.arm_write();" not found in hr._l1_apply_position';
  end if;

  execute v_new;
end $mig$;

-- Prove it landed rather than trusting that the rewrite ran.
do $verify$
declare v_src text;
begin
  select p.prosrc into v_src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = '_l1_apply_position';
  if v_src !~ 'WAGE-BEARING FIELDS NEED A STATED REASON' then
    raise exception 'hr_l1_26: guard did not land';
  end if;
  if v_src !~ 'reason_required' then
    raise exception 'hr_l1_26: refusal envelope missing';
  end if;
end $verify$;
