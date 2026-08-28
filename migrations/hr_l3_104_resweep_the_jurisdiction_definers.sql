-- hr_l3_104 — the derived definer-sweep, re-run because the jurisdiction lane added another one.
--
-- PURPOSE
--   hr_l3_102 closed the check-33 class by DERIVING the door set from the check's own predicate. That
--   is exactly so a re-run catches whatever drifted since — and one did: `hr.org_jurisdiction_rule_set_applies`
--   (a writer, wrapped) shipped from the same jurisdiction/law-portal lane with the implicit PUBLIC
--   grant, and check 33 went red again. This re-runs the identical derived sweep and drives the debt
--   back to zero.
--
--   The right durable fix is for that lane to revoke on creation (the campaign's own recorded law),
--   which is theirs to adopt; until it does, the class reopens each time it adds a function, and this
--   sweep is how it gets closed. Reported.
--
-- Applied live as `hr_l3_104_resweep_the_jurisdiction_definers`. Idempotent (an empty set is a no-op).
--
-- RECORDED TECHNICAL DECISIONS
--   · IDENTICAL DERIVED SWEEP to hr_l3_102 — `hr.definer_functions_client_reachable()` minus the
--     baseline. Not a hardcoded name, so it closes the NEXT one too. Every hr.* function is reached
--     through a `public.hr_*` DEFINER wrapper or internally as owner (hr is not PostgREST-exposed),
--     so revoking the client grants breaks no door.

do $mig$
declare r record;
begin
  for r in
    select ('hr.' || quote_ident(split_part(d.qname, '.', 2))
            || '(' || d.identity_args || ')') as sig
      from hr.definer_functions_client_reachable() d
     where not d.baselined
  loop
    execute format('revoke execute on function %s from public', r.sig);
    execute format('revoke execute on function %s from anon', r.sig);
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end
$mig$;

-- 🚨 THE POST-CONDITION IS SCOPED TO THIS MIGRATION'S CONCERN — check 33's debt — NOT the whole
-- conformance suite. A different lane's contract is broken right now (`hr._run_fixture_probe` flipped
-- to SECURITY DEFINER against its own `hr_c4_49` contract, which expects INVOKER), and check 31 will
-- stay red until C4 fixes it. Asserting "34/34 green" here would let that unrelated failure roll back
-- this security revoke — the exact coupling that already bit once this session. This migration owns
-- the definer reachability; it asserts that and reports the rest.
do $verify$
declare v_left integer;
begin
  select count(*) into v_left from hr.definer_functions_client_reachable() where not baselined;
  if v_left <> 0 then
    raise exception 'hr_l3_104: % non-baselined client-reachable definer(s) remain', v_left;
  end if;
end
$verify$;
