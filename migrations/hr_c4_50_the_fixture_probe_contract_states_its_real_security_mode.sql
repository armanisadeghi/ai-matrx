-- HR domain C4 — migration 50 (register item HRB-008; corrects hr_c4_49's contract row).
--
-- 🚨 hr_c4_49 DECLARED must_be_definer=false ON A FUNCTION THAT IS SECURITY DEFINER.
--
-- `hr._run_fixture_probe` is `SECURITY DEFINER` (it writes calculation_snapshot under
-- `hr.privileged_write`), but the hr_c4_49 contract row asserted `must_be_definer = false`. That is
-- itself a broken contract — `hr.function_contracts_broken()` reported it immediately: "expected
-- SECURITY INVOKER, found SECURITY DEFINER". A contract that mis-states the property it guards is a
-- defect, so the row is corrected to `true`.
--
-- Applied live as `hr_c4_50_the_fixture_probe_contract_states_its_real_security_mode`. Idempotent.

set local statement_timeout = '600s';
set local lock_timeout = '120s';

do $$
begin
  update hr.function_contract
     set must_be_definer = true
   where schema_name = 'hr' and function_name = '_run_fixture_probe'
     and home_migration = 'hr_c4_49' and must_be_definer is distinct from true;
  raise notice 'hr_c4_50: the fixture-probe contract now asserts SECURITY DEFINER, which it is';
end $$;

do $$
declare v_bad integer;
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'hr' and p.proname = '_run_fixture_probe' and p.prosecdef) then
    raise exception 'hr_c4_50: _run_fixture_probe is not SECURITY DEFINER — the contract would be wrong';
  end if;
  select count(*) into v_bad from hr.function_contracts_broken();
  if v_bad > 0 then
    raise exception 'hr_c4_50: % function contract(s) still broken: %', v_bad,
      (select string_agg(b::text, ' | ') from hr.function_contracts_broken() b);
  end if;
  raise notice 'hr_c4_50: 0 broken contracts';
end $$;
