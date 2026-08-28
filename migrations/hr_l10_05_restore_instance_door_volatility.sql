-- HR domain L10 — restore the workflow-instance door's write-aware volatility.
--
-- `hr_l1_12_g2_reopen_fixes` made this door VOLATILE after proving that its refusal path reaches
-- `hr._governance_refusal`, which INSERTs an audit row. `hr_l10_04_instance_door_display` later
-- recreated the function as STABLE, silently undoing that repair. PostgREST runs STABLE RPCs in a
-- read-only transaction, so a denied browser read raised SQLSTATE 25006 instead of returning the
-- refusal envelope. This forward migration repairs databases where l10_04 has already run and
-- its assertions make a failed volatility repair abort the migration.
--
-- Applied by the canonical migration runner. Idempotent.

alter function public.hr_wf_instance(uuid) volatile;

do $$
declare v_volatility "char"; v_bad int;
begin
  select p.provolatile into v_volatility
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_wf_instance'
     and pg_get_function_identity_arguments(p.oid) = 'p_instance_id uuid';

  if v_volatility is distinct from 'v' then
    raise exception 'hr_l10_05: public.hr_wf_instance(uuid) is not VOLATILE';
  end if;

  select count(*) into v_bad
    from hr.stable_doors_that_write()
   where door = 'public.hr_wf_instance';
  if v_bad <> 0 then
    raise exception 'hr_l10_05: stable write-reaching door guard still finds hr_wf_instance';
  end if;
end $$;
