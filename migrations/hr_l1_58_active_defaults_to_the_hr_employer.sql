-- hr_l1_58_active_defaults_to_the_hr_employer.sql
--
-- 🚨 A MULTI-EMPLOYER HR ADMIN WAS RESOLVING TO AN EMPTY CAPABILITY SET — A LOCKOUT, NOT A LEAK.
-- `hr_my_context(p_organization_id => null)` defaulted the active employer ONLY when the person
-- had exactly ONE employer. But everyone has a personal workspace org, so a real HR admin in one
-- workplace has TWO "employers": their workplace (HR module ON, full capabilities) and their own
-- workspace (HR module OFF, zero HR capabilities, listed only because they own it). With two
-- employers the default never fired, `active` came back NULL, and `active.capabilities` was `[]`.
--
-- That is `[]` for someone who holds 21 capabilities — and the client trusts it:
-- `useHrPersona().can` reads `hr_my_context().active.capabilities`. An empty set hides EVERY HR
-- control from a full admin (the inverse of a leak: a silent lockout). Measured on Priya
-- (uid 20149d3f): `hr._l1_capabilities(…, <sandbox>) → 21`, but `hr_my_context(null).active` → null.
--
-- THE DEFAULT IS NOW "the employer where HR is actually ON." When `p_organization_id` is null and
-- exactly ONE of the person's employers has the module enabled, that is unambiguously their HR
-- context — scope to it. Additive and safe:
--   • an explicit `p_organization_id` is untouched (the caller chose);
--   • the single-employer rule still fires first, so a lone module-OFF org still auto-resolves and
--     renders its enable-door for the owner (the R-L1 §D case the original comment protects);
--   • with TWO+ module-enabled employers it stays null on purpose — genuinely ambiguous, the
--     employer picker decides.
-- `capabilities` is still `to_jsonb(hr._l1_capabilities(...))` — faithful to the resolver whenever
-- active resolves; this only makes active RESOLVE for the case that was leaving it null.
--
-- Applied live 2026-08-29 and ledgered. Falsified in the register.

do $mig$
declare v_def text; v_new text;
begin
  v_def := pg_get_functiondef('public.hr_my_context(uuid)'::regprocedure);
  if position('THE EMPLOYER WHERE HR IS ACTUALLY ON' in v_def) > 0 then
    raise notice 'hr_l1_58: already applied'; return;
  end if;

  v_new := replace(
    v_def,
    E'  v_org := p_organization_id;\n'
    || E'  if v_org is null and jsonb_array_length(v_orgs) = 1 then\n'
    || E'    v_org := (v_orgs -> 0 ->> ''organization_id'')::uuid;\n'
    || E'  end if;',
    E'  v_org := p_organization_id;\n'
    || E'  if v_org is null and jsonb_array_length(v_orgs) = 1 then\n'
    || E'    v_org := (v_orgs -> 0 ->> ''organization_id'')::uuid;\n'
    || E'  end if;\n'
    || E'  -- 🚨 DEFAULT TO THE EMPLOYER WHERE HR IS ACTUALLY ON. A person with one real HR\n'
    || E'  -- workplace plus their own (module-off) workspace has two employers but one HR\n'
    || E'  -- context; leaving active null hands every surface an empty capability set and hides\n'
    || E'  -- every control from a full admin. Exactly one module-enabled employer is unambiguous;\n'
    || E'  -- zero or many stays null and the picker decides.\n'
    || E'  if v_org is null then\n'
    || E'    with enabled as (\n'
    || E'      select (e ->> ''organization_id'')::uuid as oid\n'
    || E'        from jsonb_array_elements(v_orgs) e\n'
    || E'       where coalesce((e -> ''module_enabled'')::boolean, false))\n'
    || E'    select oid into v_org from enabled\n'
    || E'     where (select count(*) from enabled) = 1;\n'
    || E'  end if;');
  if v_new = v_def then raise exception 'hr_l1_58: active-default anchor not found'; end if;
  execute v_new;
end $mig$;

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('public', 'hr_my_context', 'hr_l1_58_active_defaults_to_the_hr_employer.sql',
   array['THE EMPLOYER WHERE HR IS ACTUALLY ON',
         'select count(*) from enabled) = 1',
         '''capabilities'''],
   array[]::text[],
   'A multi-employer HR admin (a real workplace plus their own module-off workspace) resolved to '
   || 'a null active and an EMPTY capabilities array; useHrPersona().can reads active.capabilities, '
   || 'so every HR control was hidden from a full admin (a silent lockout). active now defaults to '
   || 'the single module-enabled employer. Removing this default re-opens the lockout.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, reason = excluded.reason, is_active = true;

do $verify$
declare v_src text;
begin
  select prosrc into v_src from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='hr_my_context';
  if v_src !~ 'THE EMPLOYER WHERE HR IS ACTUALLY ON' then
    raise exception 'hr_l1_58: default not present';
  end if;
  -- the three prior-contract tokens must survive the replace
  if v_src !~ 'worker_class' or v_src !~ 'employer_profile_id'
     or v_src !~ 'has_active_leave_enrolment' then
    raise exception 'hr_l1_58: a prior hr_my_context guarantee was lost';
  end if;
end $verify$;
