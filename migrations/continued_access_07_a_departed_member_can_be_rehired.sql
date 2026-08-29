-- continued_access_07 — A DEPARTED MEMBER CAN BE REHIRED.
--
-- RECORD of a live change applied on 2026-08-29.
--
-- 🚨 THE HOLE continued_access_06 OPENED, found by walking it. Once a termination really ends the
-- membership (`status='departed'`), `public.hr_employee_create`'s link guard stops recognising the
-- person: it requires `coalesce(m.status,'active') = 'active'` and otherwise refuses BY NAME with
-- `link_without_membership` — "That person can sign in, but they are not a member of this employer
-- yet". For a former employee of THIS employer that sentence is simply false, and it made the
-- rehire flow (SPEC-EMPLOYEES §4.6) impossible for exactly the people it exists for.
--
-- The guard's own reasoning is unchanged and still right: a link to someone who was NEVER a member
-- must be refused, because linking cannot confer access on its own (SPEC-ACCESS §1.1). A DEPARTED
-- membership is not that case — it is this employer's own former employee, whose row is still
-- there precisely so the organization can decide what they may still reach. The rehire restores it
-- to 'active' the moment spell 2 is inserted (hr.employment's `employment_membership_sync`
-- trigger, continued_access_06), which is BEFORE this door's link-completion block runs.
--
-- 🚨 THE EDIT IS SURGICAL AND VERIFIED, not a rewrite. `hr_employee_create` is a very large
-- function whose body is the product of a dozen rulings; retyping it to change one predicate is
-- how those rulings get silently lost. This migration takes the LIVE definition, replaces exactly
-- one substring, asserts the replacement happened, and re-creates it. Re-running is a no-op.

do $patch$
declare
  v_def text;
  v_old text := 'and coalesce(m.status, ''active'') = ''active'') then';
  v_new text := 'and coalesce(m.status, ''active'') in (''active'', ''departed'')) then';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if v_def is null then
    raise exception 'continued_access_07: public.hr_employee_create is missing';
  end if;

  if position(v_new in v_def) > 0 then
    raise notice 'continued_access_07: already applied — the link guard already admits a departed member';
    return;
  end if;

  if position(v_old in v_def) = 0 then
    raise exception 'continued_access_07: the link guard predicate has changed shape; refusing to '
      'patch blind. Expected to find: %', v_old;
  end if;

  v_def := replace(v_def, v_old, v_new);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'hr_employee_create';
  if position(v_new in v_def) = 0 then
    raise exception 'continued_access_07: the replacement did not land';
  end if;
  -- everything else must still be there: this is a one-predicate change, not a rewrite
  if position('link_without_membership' in v_def) = 0
     or position('rehire_required' in v_def) = 0
     or position('mbr_add' in v_def) = 0 then
    raise exception 'continued_access_07: the patched body lost machinery it must keep';
  end if;
  raise notice 'continued_access_07: a former employee of this employer can be rehired again';
end
$patch$;

-- The rule, pinned so a future replace cannot quietly drop it again.
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, must_be_definer)
select 'public','hr_employee_create','continued_access_07_a_departed_member_can_be_rehired.sql',
       array['''active'', ''departed'''], array[]::text[],
       'SPEC-EMPLOYEES §4.6: a rehire is a new spell for a person this employer already knows. '
       || 'Once a termination sets the membership to departed (continued_access_06), a link guard '
       || 'that admits only status=''active'' refuses every rehire of a login-bearing former '
       || 'employee with the words "they are not a member of this employer yet".', true
where not exists (select 1 from hr.function_contract c
                   where c.schema_name = 'public' and c.function_name = 'hr_employee_create'
                     and c.home_migration = 'continued_access_07_a_departed_member_can_be_rehired.sql');

do $chk$
declare v_broken int;
begin
  select count(*) into v_broken from hr.function_contracts_broken()
   where qname = 'public.hr_employee_create';
  if v_broken > 0 then
    raise exception 'continued_access_07: % contract clause(s) broken on hr_employee_create', v_broken;
  end if;
  if not exists (select 1 from information_schema.routine_privileges
                  where routine_name = 'hr_employee_create' and grantee = 'authenticated'
                    and privilege_type = 'EXECUTE') then
    raise exception 'continued_access_07: authenticated lost EXECUTE on the create door';
  end if;
end
$chk$;
