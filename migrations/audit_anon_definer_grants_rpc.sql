-- audit_anon_definer_grants_rpc.sql
--
-- Read-only auditor backing the CI guard `pnpm check:definer-grants` (the
-- recurrence guard for the KNOWN_DEFECTS D31 vulnerability class: anon-reachable
-- public SECURITY DEFINER functions that trust a caller-supplied id). Returns
-- every public SECURITY DEFINER function that (a) is EXECUTE-granted to anon or
-- PUBLIC, (b) takes a uuid/uuid[] INPUT argument (proargtypes only — NOT
-- RETURNS TABLE/OUT columns), and (c) has NO auth gate in its body. Takes no
-- user params and returns only function metadata (no user data). service_role
-- only, so the auditor itself is not part of the class it audits.
--
-- Idempotent.
create or replace function public.audit_anon_definer_grants()
returns table(proname text, args text, anon_exec boolean, public_exec boolean)
language sql stable security definer set search_path to 'public' as $function$
  with f as (
    select p.oid, p.proname::text as proname,
      pg_get_function_identity_arguments(p.oid) as args,
      coalesce(p.proacl, acldefault('f',p.proowner)) as acl,
      pg_get_functiondef(p.oid) as def,
      p.proargtypes::oid[] as in_argtypes
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef
  )
  select f.proname, f.args,
    exists(select 1 from aclexplode(f.acl) g join pg_roles r on r.oid=g.grantee where r.rolname='anon' and g.privilege_type='EXECUTE'),
    exists(select 1 from aclexplode(f.acl) g where g.grantee=0 and g.privilege_type='EXECUTE')
  from f
  where exists(select 1 from unnest(f.in_argtypes) t where t in ('uuid'::regtype::oid, 'uuid[]'::regtype::oid))
    and not (position('auth.uid' in f.def)>0 or position('auth.role' in f.def)>0 or position('auth.jwt' in f.def)>0
      or position('is_super_admin' in f.def)>0 or position('is_admin' in f.def)>0 or position('has_org_access' in f.def)>0
      or position('has_access' in f.def)>0 or position('auth_is_org' in f.def)>0 or position('is_org_member' in f.def)>0)
    and (exists(select 1 from aclexplode(f.acl) g join pg_roles r on r.oid=g.grantee where r.rolname='anon' and g.privilege_type='EXECUTE')
         or exists(select 1 from aclexplode(f.acl) g where g.grantee=0 and g.privilege_type='EXECUTE'))
  order by f.proname;
$function$;

revoke all on function public.audit_anon_definer_grants() from public, anon, authenticated;
grant execute on function public.audit_anon_definer_grants() to service_role;
