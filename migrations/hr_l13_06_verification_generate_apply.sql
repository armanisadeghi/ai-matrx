-- HR L13 — migration 6 (register item HRB-025, lane lane-l13-export), written for L1's lane.
--
-- `public.hr_verification_generate_apply` — the privileged writer SPEC-EMPLOYEES already names,
-- built here because L13's guard proof found the reason L1's interim path could not have worked.
--
-- ===================================================================================
-- WHY A DIFFERENT LANE IS SHIPPING THIS
--
-- 🚨 `hr.arm_write()` MINTS A **STATEMENT**-SCOPED TOKEN, NOT A TRANSACTION-SCOPED ONE.
--
--     hr.arm_write()        sets  md5(statement_timestamp() || pg_backend_pid() || <secret key>)
--     hr._guard_hr_write()  accepts only a token equal to that SAME expression
--
-- `statement_timestamp()` advances with every statement. So arming in one round trip and writing
-- in the next produces two different timestamps, the token never matches, and the write is
-- REFUSED — which is exactly what makes the token unforgeable by a client that can run SQL.
--
-- `aidream/services/hr/employees/verification_letters.py::_apply` reasoned that `rls_session`
-- pins the connection so "the armed flag and the UPDATE are guaranteed to share a transaction
-- context." That is true and it is not the property that matters; the guard does not check the
-- transaction. E-37's commit would have been refused the first time a real letter was generated.
--
-- L13 found this by running `aidream/scripts/hr/hrb025_guard_proof.py`, deleted its own identical
-- helper, and owes L1 the fix rather than a broken import: the same finding, the same day, and
-- [defect-ownership](../../common-docs/policies/defect-ownership.md) says finding it makes it
-- mine. The function is the one L1's own docstring names as the preferred path
-- (`p_letter_id, p_file_id, p_snapshot`), so this is L1's design, landed early — not a redesign.
--
-- Applied live as `hr_l13_06_verification_generate_apply`. Idempotent.
--
-- RECORDED DECISIONS
--
-- 1. THE STATE FILTER IS THE CONCURRENCY GUARD, and it is kept exactly as L1 wrote it: a letter
--    that reached `delivered` between the caller's load and this write matches nothing, and the
--    caller is told to start a new request rather than silently overwriting a delivered
--    assertion. A letter is something the org will be held to; overwriting one is not an edit.
--
-- 2. `generated_at` IS THE CALLER'S, NOT `now()`. The render happened at a moment the caller
--    observed and put in the snapshot; stamping a fresh clock here would make the artifact and
--    its record disagree about when the assertion was made.
--
-- 3. IT RETURNS THE ROW COUNT rather than raising on a miss, because "no row matched" is a
--    STATE answer the caller renders as a 409 with its own message, not an internal error.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '30s';

create or replace function public.hr_verification_generate_apply(
  p_letter_id    uuid,
  p_file_id      uuid,
  p_snapshot     jsonb,
  p_generated_at timestamptz)
returns integer
language plpgsql
volatile security definer
set search_path to 'hr', 'public'
as $function$
declare v_count integer;
begin
  -- Armed INSIDE the function body, which is one outer statement — the only place the token can
  -- be minted and spent under the same `statement_timestamp()`.
  perform hr.arm_write();

  update hr.verification_letter_request vlr
     set state = 'generated',
         generated_at = p_generated_at,
         letter_file_id = p_file_id,
         snapshot = p_snapshot
   where vlr.id = p_letter_id
     -- RECORDED DECISION 1 — a delivered letter is never re-generated in place.
     and vlr.state in ('requested', 'approved', 'generated')
     and vlr.deleted_at is null;

  get diagnostics v_count = row_count;
  perform set_config('hr.privileged_write', '', true);
  return v_count;
end
$function$;

comment on function public.hr_verification_generate_apply(uuid, uuid, jsonb, timestamptz) is
  'SPEC-EMPLOYEES E-37 — the privileged commit for a rendered verification letter. Lives in `public` because `hr` is not exposed to PostgREST (FREEZE D-10) and aidream reaches it through matrx_orm.call_function. Arms the HR write guard in its own body, which is the ONLY way that guard can be satisfied: hr.arm_write() mints a token bound to statement_timestamp(), so arming from a caller in a separate round trip never validates. Returns the row count; zero means the letter moved on (delivered) and the caller renders a 409.';

revoke all on function public.hr_verification_generate_apply(uuid, uuid, jsonb, timestamptz) from public;
revoke all on function public.hr_verification_generate_apply(uuid, uuid, jsonb, timestamptz) from anon;
grant execute on function public.hr_verification_generate_apply(uuid, uuid, jsonb, timestamptz)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------------
-- ASSERTIONS — this file does not commit a lie.
-- ---------------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.hr_verification_generate_apply(uuid,uuid,jsonb,timestamptz)') is null then
    raise exception 'hr_l13_06: the function did not land';
  end if;
  if has_function_privilege('anon', 'public.hr_verification_generate_apply(uuid,uuid,jsonb,timestamptz)', 'execute') then
    raise exception 'hr_l13_06: anon can execute the verification-letter writer';
  end if;
  if not has_function_privilege('authenticated', 'public.hr_verification_generate_apply(uuid,uuid,jsonb,timestamptz)', 'execute') then
    raise exception 'hr_l13_06: authenticated cannot execute the verification-letter writer';
  end if;
  -- The whole point of this file: the table it writes must actually carry the write guard, or
  -- the definer body is ceremony around an unguarded UPDATE.
  if not exists (select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'hr' and c.relname = 'verification_letter_request'
                    and tg.tgname = '_zz_guard_hr_write') then
    raise exception 'hr_l13_06: hr.verification_letter_request has no _zz_guard_hr_write trigger';
  end if;
end $$;
