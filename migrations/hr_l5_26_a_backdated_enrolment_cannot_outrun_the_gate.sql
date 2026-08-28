-- HR domain L5 — migration 26 (register item HRB-017, lane L5 Leave & PTO).
--
-- 🚨 THE GATE I SHIPPED ONE MIGRATION AGO HAD A BACK-DATING BYPASS, AND THE EXISTING BAD ROW
-- WALKED STRAIGHT THROUGH IT.
--
-- `hr_l5_25` tested the worker class **as of the enrollment's `effective_from`**. That reads well
-- and is wrong: the fixture enrollment starts **2026-02-09** while the employment's primary
-- assignment starts **2026-08-20**, so on the tested date there was no assignment, the predicate
-- returned `worker_class_unknown` — and `ok: true`. The contractor-on-an-employee-policy row the
-- gate was written to catch **was not returned by the reader written to surface it**, and any
-- future writer could clear the gate simply by back-dating `effective_from` before the hire.
--
-- Found by running the reader instead of trusting the migration that had just passed its own
-- self-proof: the self-proof asserted the predicate exists and treats an empty scope as
-- unrestricted, and never asserted that it FINDS the row everyone already knew about.
--
-- **The ruling.** A worker class is a fact about a person, not about a date they were enrolled.
-- When no assignment is in force on the as-of date, the predicate now falls back to the
-- **earliest primary assignment on record** and says so in `worker_class_basis`. `unknown` is
-- reserved for an employment with no primary assignment at all — a genuinely different fact,
-- which `hr_l5_07` already refuses on a related axis. A back-dated enrollment can no longer
-- outrun the gate, and the reason it resolved is always visible.
--
-- Authority: SPEC-LEAVE §2.8, §3.2 condition 5; D8. Contract row updated below.
-- Applied live as `hr_l5_26_a_backdated_enrolment_cannot_outrun_the_gate`. Idempotent.

create or replace function hr._leave_worker_class_ok(p_employment_id uuid, p_leave_policy_id uuid,
                                                     p_as_of date default current_date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'hr', 'public'
as $function$
declare v_scope text[]; v_class text; v_basis text;
begin
  select p.worker_class_scope into v_scope
    from hr.leave_policy p where p.id = p_leave_policy_id and p.deleted_at is null;

  -- An EMPTY scope means the policy names no restriction, which is not the same as naming none
  -- of them. `'{}'` is the column default, so treating it as "nobody qualifies" would lock every
  -- policy nobody has scoped yet.
  if v_scope is null or array_length(v_scope, 1) is null then
    return jsonb_build_object('ok', true, 'unscoped', true);
  end if;

  -- 1. the assignment in force on the date asked about
  select pa.worker_class into v_class
    from hr.position_assignment pa
   where pa.employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
     and pa.effective_from <= p_as_of
     and (pa.effective_to is null or pa.effective_to > p_as_of)
   order by pa.effective_from desc limit 1;
  if v_class is not null then
    v_basis := 'in_force_on_date';
  end if;

  -- 2. 🚨 THE BACK-DATING FIX. An enrollment can be dated before the person was ever assigned —
  -- the fixture that prompted all of this starts six months before its own employment's
  -- assignment. Falling through to `unknown` there let the row pass the gate. A worker class is
  -- a fact about a PERSON, so we fall back to their earliest primary assignment and say so.
  if v_class is null then
    select pa.worker_class into v_class
      from hr.position_assignment pa
     where pa.employment_id = p_employment_id and pa.is_primary and pa.deleted_at is null
     order by pa.effective_from asc limit 1;
    if v_class is not null then
      v_basis := 'earliest_assignment_on_record';
    end if;
  end if;

  -- 3. genuinely nothing on record. A different fact, and it stays distinguishable.
  if v_class is null then
    return jsonb_build_object('ok', true, 'worker_class_unknown', true,
                              'worker_class_basis', 'no_primary_assignment',
                              'scope', to_jsonb(v_scope));
  end if;

  return jsonb_build_object(
    'ok', (v_class = any(v_scope)),
    'worker_class', v_class,
    'worker_class_basis', v_basis,
    'scope', to_jsonb(v_scope));
end
$function$;

comment on function hr._leave_worker_class_ok(uuid, uuid, date) is
  'SPEC-LEAVE §3.2 condition 5 / §2.8 / D8. ONE body, shared by the enrollment trigger, the '
  'enrollment door and the request submit. An empty scope is unrestricted, never empty-set. When '
  'no assignment is in force on the as-of date it falls back to the EARLIEST primary assignment '
  '(hr_l5_26) — a worker class is a fact about a person, and testing only the enrollment date let '
  'a back-dated row walk past the gate. `worker_class_basis` always says which rung answered.';

update hr.function_contract
   set must_contain = array['worker_class_scope', 'is_primary', 'earliest_assignment_on_record'],
       home_migration = 'hr_l5_26',
       reason = 'hr_l5_25/26: the ONE worker-class predicate, shared by the enrollment trigger, '
             || 'the enrollment door and the request submit. An empty scope is unrestricted. It '
             || 'MUST keep the earliest-assignment fallback: testing only the enrollment date let '
             || 'a back-dated enrollment clear the gate, which is how the original '
             || 'contractor-on-an-employee-policy row survived the migration written to catch it.'
 where schema_name = 'hr' and function_name = '_leave_worker_class_ok';

-- -----------------------------------------------------------------------------------
-- Self-proof — this time it asserts the gate FINDS the row it exists for
-- -----------------------------------------------------------------------------------

do $$
declare v_res jsonb; v_found integer;
begin
  -- the fallback rung must actually answer for a back-dated enrollment
  select count(*) into v_found
    from hr.leave_enrollment e
    join hr.leave_policy p on p.id = e.leave_policy_id
   where e.deleted_at is null and array_length(p.worker_class_scope, 1) is not null
     and e.effective_from < (select min(pa.effective_from) from hr.position_assignment pa
                              where pa.employment_id = e.employment_id and pa.is_primary
                                and pa.deleted_at is null)
     and (hr._leave_worker_class_ok(e.employment_id, e.leave_policy_id, e.effective_from)
          ->> 'worker_class') is null;
  if v_found > 0 then
    raise exception 'hr_l5_26: % back-dated enrollment(s) still resolve NO worker class', v_found;
  end if;

  -- and `unknown` must remain reachable for an employment with nothing on record, or the
  -- fallback has simply swallowed a genuinely different fact
  v_res := hr._leave_worker_class_ok('00000000-0000-0000-0000-000000000001'::uuid,
                                     '00000000-0000-0000-0000-000000000001'::uuid);
  if v_res ->> 'unscoped' is null and v_res ->> 'worker_class_unknown' is null then
    raise exception 'hr_l5_26: an employment with nothing on record no longer reports unknown: %', v_res;
  end if;
end $$;
