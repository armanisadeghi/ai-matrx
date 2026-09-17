-- chair-step: THE INVERSE of `migrations/campaign/w1_prov_closed_public_acl_regex.sql`. It restores the live body of platform.schema_exposure_violations to the one that could not see a PUBLIC grant in the first ACL position. Restoring a live body is the same class of act as changing one.
-- based-on: platform.schema_exposure_violations(text) cf877517a8b0763200553be64262fd7e98d24006a52d4aec30022ab145d1af56
--
-- RUN on the branch 2026-09-17 and the hole re-measured afterwards, which is the only way an
-- inverse is known to invert anything (rule 27). The `-- based-on:` hash is the FIXED body's,
-- because that is what is live immediately before this file runs.

set lock_timeout = '5s';
set statement_timeout = '600s';

CREATE OR REPLACE FUNCTION platform.schema_exposure_violations(p_schema text DEFAULT NULL::text)
 RETURNS TABLE(schema_name text, kind text, object_name text, detail text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- Every way a client role can hold something in a schema declared CLOSED. p_schema null
  -- means every closed schema. This is the check the remedy is written against and the check
  -- platform.provision runs on itself before it returns; it is positive — it returns the
  -- object and what is wrong with it — never an absence somebody has to interpret.
  with closed as (
    select e.schema_name
      from platform.schema_client_exposure e
     where not e.client_exposed
       and (p_schema is null or e.schema_name = p_schema)
  ),
  roles as (select unnest(array['anon','authenticated','service_role']) as rolname)
  select c.schema_name, 'schema-usage'::text, c.schema_name,
         format('role %s holds USAGE or CREATE on the schema', r.rolname)
    from closed c cross join roles r
   where has_schema_privilege(r.rolname, c.schema_name, 'USAGE')
      or has_schema_privilege(r.rolname, c.schema_name, 'CREATE')
  union all
  select c.schema_name, 'schema-usage'::text, c.schema_name,
         format('PUBLIC holds a schema privilege: %s', n.nspacl::text)
    from closed c join pg_namespace n on n.nspname = c.schema_name
   where n.nspacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  select c.schema_name, 'relation'::text, cl.relname,
         format('%s', cl.relacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_class cl on cl.relnamespace = n.oid
   where cl.relacl::text ~ '(anon|authenticated|service_role)=' or cl.relacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  select c.schema_name, 'column'::text, format('%s.%s', cl.relname, a.attname),
         format('%s', a.attacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_class cl on cl.relnamespace = n.oid
    join pg_attribute a on a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
   where a.attacl::text ~ '(anon|authenticated|service_role)=' or a.attacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  select c.schema_name, 'default-privilege'::text, d.defaclobjtype::text,
         format('%s', d.defaclacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_default_acl d on d.defaclnamespace = n.oid
   where d.defaclacl::text ~ '(anon|authenticated|service_role)=' or d.defaclacl::text ~ '(^|,)=[a-zA-Z]'
  union all
  -- A function with proacl NULL is not ungranted: PostgreSQL grants EXECUTE to PUBLIC
  -- implicitly at CREATE, which is why this asks has_function_privilege rather than reading
  -- the ACL text. It is how four functions in schema `custom` stayed callable after every
  -- visible grant had been revoked.
  select c.schema_name, 'function-execute'::text,
         format('%s(%s)', p.proname, pg_get_function_identity_arguments(p.oid)),
         format('role %s can EXECUTE', r.rolname)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_proc p on p.pronamespace = n.oid
   cross join roles r
   where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
   order by 1, 2, 3, 4;
$function$
;
