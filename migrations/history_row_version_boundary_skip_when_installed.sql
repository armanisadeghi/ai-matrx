-- chair-step: the repair path still drops a mismatched boundary policy; that DROP is the only way to put the restrictive policy back, and it now runs only when the installed policy is not already the one this function would create.

-- The nightly partition job reinstalled this boundary on every child, every night.
-- ENABLE ROW LEVEL SECURITY and DROP POLICY take ACCESS EXCLUSIVE even when
-- the table already has the same policy. On 2026-09-21 that wait timed out on
-- the live month and the provisioner failed. When the boundary is already the
-- one this function would install, leave it alone. Anything else is still rewritten.

-- based-on: history.install_confidential_row_version_boundary(regclass) 2d37e326edf9840431081b733772ba38d67f8ec96da6c25c752a48fe8b57cd08

create or replace function history.install_confidential_row_version_boundary(p_rel regclass)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_qual text;
  v_check text;
  v_roles name[];
begin
  select pg_get_expr(pol.polqual, pol.polrelid),
         pg_get_expr(pol.polwithcheck, pol.polrelid),
         (select array_agg(r.rolname order by r.rolname)
            from pg_roles r
           where r.oid = any (pol.polroles))
    into v_qual, v_check, v_roles
    from pg_policy pol
   where pol.polrelid = p_rel
     and pol.polname = 'vault_confidential_history_client_boundary'
     and not pol.polpermissive
     and pol.polcmd = '*';

  if v_qual = '(NOT platform.is_service_only_history(entity_type))'
     and v_check = '(NOT platform.is_service_only_history(entity_type))'
     and v_roles = array['anon', 'authenticated']::name[]
     and exists (select 1 from pg_class c where c.oid = p_rel and c.relrowsecurity)
  then
    return;
  end if;

  execute format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', p_rel);
  execute format('DROP POLICY IF EXISTS vault_confidential_history_client_boundary ON %s', p_rel);
  execute format(
    'CREATE POLICY vault_confidential_history_client_boundary ON %s AS RESTRICTIVE FOR ALL TO anon, authenticated USING (NOT platform.is_service_only_history(entity_type)) WITH CHECK (NOT platform.is_service_only_history(entity_type))',
    p_rel);
end
$function$;
