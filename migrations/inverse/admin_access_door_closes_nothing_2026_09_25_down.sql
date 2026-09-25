-- chair-step: the inverse of migrations/admin_access_door_closes_nothing_2026_09_25.sql — drops the
--   `admin_door_survives_revoke` event trigger and its function, and withdraws the default privilege
--   the up added (SELECT on future tables to service_role, for role postgres) in the schemas where it
--   is the ONLY default service_role holds — schemas that already carried a wider service_role default
--   before the up (admin, agent, communication, crm, docproc, extend, files, hindsight, pdf, plan,
--   podcast, public, rag, research, scheduler, ui, users, web, workbench, workflow) are left exactly as
--   they were. It deliberately does NOT revoke the SELECT grants the up issued on existing relations:
--   revoking service_role SELECT is forbidden by common-docs/policies/our-own-admin-database-access.md
--   ("Never revoke it") — an inverse may put a defect back, never blind the admin system. The grants
--   are additive and harmless to the up running again.

set local lock_timeout = '2s';

drop event trigger if exists admin_door_survives_revoke;
drop function if exists platform._admin_door_survives_revoke();

do $inv$
declare
  s text;
begin
  for s in
    select n.nspname
      from pg_default_acl d
      join pg_namespace n on n.oid = d.defaclnamespace
     where d.defaclobjtype = 'r'
       and d.defaclrole = 'postgres'::regrole
       and exists (select 1 from aclexplode(d.defaclacl) g
                    where g.grantee = 'service_role'::regrole and g.privilege_type = 'SELECT')
       and not exists (select 1 from aclexplode(d.defaclacl) g
                        where g.grantee = 'service_role'::regrole and g.privilege_type <> 'SELECT')
     order by 1
  loop
    execute format('alter default privileges for role postgres in schema %I revoke select on tables from service_role', s);
  end loop;
end
$inv$;
