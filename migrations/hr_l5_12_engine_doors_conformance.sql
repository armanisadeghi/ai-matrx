-- HR L5 leave engine paths are intentionally not client doors. Teach the
-- standing public-door conformance check that these two service-role-only
-- functions are hardened engine endpoints, not missing authenticated grants.

-- Revoke every live overload. The catalog can retain an older overload even
-- when the current migration file declares only one signature; checking by
-- name while revoking one signature would leave that older door reachable.
do $$
declare v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('hr_leave_accrual_apply', 'hr_leave_reinstate_on_rehire')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
  end loop;
end
$$;

do $outer$
declare
  v_def text;
  v_old constant text :=
    'when not has_function_privilege(''authenticated'', p.oid, ''EXECUTE'')
                 then ''authenticated cannot execute''';
  v_new constant text :=
    'when not has_function_privilege(''authenticated'', p.oid, ''EXECUTE'')
                    and p.proname not in (''hr_leave_accrual_apply'',
                                          ''hr_leave_reinstate_on_rehire'')
                 then ''authenticated cannot execute''';
begin
  select pg_get_functiondef(oid) into v_def
    from pg_proc where oid = 'hr.punch_write_path_conformance()'::regprocedure;

  if position('hr_leave_reinstate_on_rehire' in v_def) > 0 then
    raise notice 'hr_l5_12: already applied';
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'hr_l5_12: authenticated-door conformance anchor not found';
  end if;

  execute replace(v_def, v_old, v_new);
end
$outer$;

do $$
declare v_bad text;
begin
  select string_agg(check_key, ', ') into v_bad
    from hr.punch_write_path_conformance()
   where not ok;
  if v_bad is not null then
    raise exception 'hr_l5_12: conformance gate remains red: %', v_bad;
  end if;

  if exists (
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = 'hr_leave_accrual_apply'
       and has_function_privilege('authenticated', p.oid, 'execute')) then
    raise exception 'hr_l5_12: accrual engine path is still client-reachable';
  end if;
  if exists (
    select 1 from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname = 'hr_leave_reinstate_on_rehire'
       and has_function_privilege('authenticated', p.oid, 'execute')) then
    raise exception 'hr_l5_12: reinstatement engine path is still client-reachable';
  end if;
end
$$;
