-- HR domain L5 — migration 19 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 DELETING MY SECOND BODY OF A RULE THAT JUST GREW ARMS.
--
-- This lane carried the position_assignment → location → jurisdiction walk **twice** — once inline
-- in `hr.leave_ledger_post`, once in `hr._leave_jurisdiction_key_or_federal` — each wrapped in
-- `exception when others then null`. Both were written when `hr._subject_jurisdiction_key` raised
-- `subject_carries_no_jurisdiction` for everything a leave row could hand it, and both were
-- reasonable then.
--
-- They are not reasonable now. The L5-A8 fix gave that helper a **derivation set**:
-- `hr_leave_enrollment` resolves through its employment's work location, effective-dated, and
-- refuses with `as_of_required` rather than substituting today (AR 1.4). So the rule has one owner
-- again — and a copy of it that swallows *every* exception is precisely where the next divergence
-- lives silently. `when others then null` would have hidden a genuine outage in that helper and
-- stamped `US` on a wage-adjacent snapshot without a word.
--
-- Both copies are deleted. One resolver, called through the ENROLLMENT (which is what the helper
-- now knows how to answer for), and the only exception caught is the helper's own named refusal —
-- recorded in the snapshot, never swallowed.
--
-- Verified before writing: `hr._subject_jurisdiction_key('hr_employment', …, current_date)` still
-- raises — an employment carries no stamp and is NOT in the derivation set. Delegating on the
-- employment would have re-broken what L5-A8 fixed; the enrollment is the subject that answers.
--
-- Authority: SPEC-JURISDICTION §2.0 / AR 1.4; the L5-A8 resolution; the no-duplicate-rule-body law.
-- Applied live as `hr_l5_19_one_jurisdiction_rule_body`. Idempotent.

drop function if exists hr._leave_jurisdiction_key_or_federal(uuid);

create or replace function hr._leave_jurisdiction_key_or_federal(
  p_employment_id uuid, p_leave_policy_id uuid, p_as_of date default current_date
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_enr uuid; v_key text; v_state text; v_detail text;
begin
  select e.id into v_enr
    from hr.leave_enrollment e
   where e.employment_id = p_employment_id and e.leave_policy_id = p_leave_policy_id
     and e.deleted_at is null
   order by (e.effective_from <= p_as_of
             and (e.effective_to is null or e.effective_to >= p_as_of)) desc,
            e.effective_from desc
   limit 1;

  if v_enr is null then
    return jsonb_build_object('key','US', 'derived', false,
      'fallback_reason','no leave enrollment joins this employment to this policy, so there is '
                     || 'nothing to derive a jurisdiction through');
  end if;

  begin
    -- THE ONE RESOLVER. hr_leave_enrollment is in its derivation set; this lane no longer holds a
    -- second copy of how an enrollment reaches a jurisdiction.
    v_key := hr._subject_jurisdiction_key('hr_leave_enrollment', v_enr, p_as_of);
  exception
    -- ONLY the resolver's own named refusal. `when others` would swallow a real outage and stamp
    -- a federal key on a wage-adjacent record without a word — which is the shape this migration
    -- exists to delete, not to relocate.
    when sqlstate 'P0001' then
      get stacked diagnostics v_detail = MESSAGE_TEXT;
      v_key := null;
      v_state := v_detail;
  end;

  if v_key is null then
    return jsonb_build_object('key','US', 'derived', false,
      'fallback_reason', coalesce(v_state,
        'the jurisdiction resolver returned nothing for this enrollment'));
  end if;
  return jsonb_build_object('key', v_key, 'derived', true);
end
$function$;

comment on function hr._leave_jurisdiction_key_or_federal(uuid, uuid, date) is
  'The jurisdiction behind a leave ledger entry, resolved through the ENROLLMENT by the ONE '
  'resolver (hr._subject_jurisdiction_key, which gained hr_leave_enrollment in its derivation set '
  'with the L5-A8 fix). This lane holds no second copy of the position_assignment walk. Catches '
  'only the resolver''s named refusal — never `when others` — and every fallback to the federal '
  'key returns its own reason so the snapshot can record why.';

-- -----------------------------------------------------------------------------------
-- The writer stops walking the chain itself
-- -----------------------------------------------------------------------------------

do $$
declare v_def text; v_new text; v_start int; v_end int;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_ledger_post';

  v_start := position('    -- 🚨 `hr._subject_jurisdiction_key` RAISES' in v_def);
  v_end   := position('    end if;' in substring(v_def from v_start)) + v_start + length('    end if;');
  if v_start = 0 then
    raise exception 'hr_l5_19: the ledger writer''s jurisdiction block did not match — re-derive it';
  end if;

  v_new := substring(v_def from 1 for v_start - 1)
    || E'    -- ONE RESOLVER (hr_l5_19). The position_assignment walk that used to live here was a\n'
    || E'    -- second body of a rule hr._subject_jurisdiction_key now owns, and it swallowed every\n'
    || E'    -- exception. Deleted. The fallback still exists because\n'
    || E'    -- hr.calculation_snapshot.jurisdiction_key is NOT NULL — but it arrives with a REASON,\n'
    || E'    -- which is written into the snapshot inputs below rather than left invisible.\n'
    || E'    v_juris_res := hr._leave_jurisdiction_key_or_federal(p_employment_id, p_leave_policy_id,\n'
    || E'                                                         p_occurred_on);\n'
    || E'    v_juris := v_juris_res ->> ''key'';\n'
    || E'    if (v_juris_res ->> ''derived'')::boolean is not true then\n'
    || E'      p_snapshot_inputs := coalesce(p_snapshot_inputs, ''{}''::jsonb)\n'
    || E'        || jsonb_build_object(''jurisdiction_key_fallback'', true,\n'
    || E'             ''jurisdiction_key_fallback_reason'', v_juris_res ->> ''fallback_reason'');\n'
    || E'    end if;'
    || substring(v_def from v_end);

  v_new := replace(v_new,
    E'  v_juris     text;',
    E'  v_juris     text;\n  v_juris_res jsonb;');
  if v_new not like '%v_juris_res jsonb;%' then
    raise exception 'hr_l5_19: could not declare the resolver result variable — re-derive';
  end if;
  execute v_new;
end $$;

-- the adjustment door used the old one-arg form
do $$
declare v_def text; v_new text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.proname = 'leave_adjust';
  v_new := replace(v_def,
    E'coalesce(hr._leave_jurisdiction_key_or_federal(p_employment_id), ''US'')',
    E'coalesce(hr._leave_jurisdiction_key_or_federal(p_employment_id, p_leave_policy_id,\n                                                     current_date) ->> ''key'', ''US'')');
  if v_new = v_def then
    raise exception 'hr_l5_19: the adjustment door''s jurisdiction call did not match — re-derive';
  end if;
  execute v_new;
end $$;

-- -----------------------------------------------------------------------------------
-- Self-proof — no second body survives anywhere in the lane
-- -----------------------------------------------------------------------------------

do $$
declare v_bad text; v_res jsonb;
begin
  -- No leave function may resolve A LEDGER ENTRY'S jurisdiction by walking the chain itself.
  --
  -- 🚨 Scoped by QUESTION, not by table names. A first draft forbade the
  -- position_assignment→jurisdiction join outright, and then a full in-order replay failed on
  -- `hr.leave_operating_jurisdictions` and `hr.leave_policy_floors` — functions written LATER
  -- (hr_l5_20/22) that legitimately walk the same tables to answer a DIFFERENT question: which
  -- jurisdictions does this organization operate in. Same join, different fact. A guard that
  -- cannot tell those apart fails on correct code, and a guard that fails on correct code gets
  -- deleted by whoever is unblocking themselves at 2am.
  --
  -- The sanctioned owners are named, and naming them is the point: adding a third requires
  -- editing this list, which is a deliberate act rather than an accident.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname like 'leave%' or p.proname like '_leave%')
     and p.proname not in ('_leave_manages','_leave_has_reports',
                           'leave_operating_jurisdictions','leave_policy_floors')
     and pg_get_functiondef(p.oid) like '%join hr.jurisdiction j on j.id = loc.jurisdiction_id%';
  if v_bad is not null then
    raise exception 'hr_l5_19: a second jurisdiction walk still lives in: %', v_bad;
  end if;

  -- And no leave function that CALLS a jurisdiction resolver may swallow every exception around
  -- it. Scoped to the actual call, not to the word: a first draft matched any function mentioning
  -- "jurisdiction" and flagged hr._leave_policy_probe — core C5's test harness, whose `when
  -- others` handlers ARE its assertions (it catches inserts it expects to be refused) and which
  -- resolves no key at all. A check that fires on a passing neighbour teaches people to ignore it.
  select string_agg(n.nspname || '.' || p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and (p.proname like 'leave%' or p.proname like '_leave%')
     and pg_get_functiondef(p.oid) like '%when others then%'
     and (pg_get_functiondef(p.oid) like '%_subject_jurisdiction_key%'
          or pg_get_functiondef(p.oid) like '%_leave_jurisdiction_key_or_federal%');
  if v_bad is not null then
    raise exception 'hr_l5_19: a swallowing handler still wraps a jurisdiction resolution in: %', v_bad;
  end if;

  -- the fallback must arrive WITH a reason, not silently
  v_res := hr._leave_jurisdiction_key_or_federal(
             '00000000-0000-0000-0000-000000000000'::uuid,
             '00000000-0000-0000-0000-000000000000'::uuid, current_date);
  if (v_res ->> 'derived')::boolean is not false or (v_res ->> 'fallback_reason') is null then
    raise exception 'hr_l5_19: a federal fallback came back without saying why: %', v_res;
  end if;
end $$;
