-- chair-step: this REPLACES a live body, platform.schema_exposure_violations, to close a hole found by attacking this lane's OWN guard an hour after it landed. It is the same class of act as the change it corrects and travels the same loud route. The whole corrected body is below.
-- based-on: platform.schema_exposure_violations(text) 53e9a78000db09de1a039dc86525dadd8ebb975641e326d0d2f8719981f6c2ed
--
-- W1-PROV-CLOSED — THE PUBLIC ENTRY IS THE FIRST ONE IN AN ACL, AND THE GUARD COULD NOT SEE IT.
--
-- `platform.schema_exposure_violations` detects a grant to PUBLIC by looking for an ACL entry with
-- an EMPTY grantee, and it did that with the regex `(^|,)=[a-zA-Z]`. An `aclitem[]` renders as
-- `{...}`, so the FIRST entry is preceded by `{` and not by `^` or `,` — and PostgreSQL puts the
-- PUBLIC entry first. MEASURED on the branch 2026-09-17:
--
--     select '{=r/postgres,postgres=arwdDxtm/postgres}' ~ '(^|,)=[a-zA-Z]'   -> false
--     select '{=r/postgres,postgres=arwdDxtm/postgres}' ~ '[{,]=[a-zA-Z]'    -> true
--     select '{postgres=arwdDxtm/postgres,=r/postgres}' ~ '(^|,)=[a-zA-Z]'   -> true
--
-- So the guard saw a PUBLIC grant only in the one position PostgreSQL does not use. A schema
-- declared CLOSED could hold `GRANT SELECT ON <tbl> TO PUBLIC`, or a PUBLIC schema USAGE, or a
-- PUBLIC default-privilege row, and `platform.provision`'s end-of-transaction proof would have
-- returned zero rows and let it through — the exact silence the proof exists to break. The three
-- named-role legs (`anon`, `authenticated`, `service_role`) were never affected, which is why
-- every measurement this lane published still stands; this widens the guard, it does not correct
-- a result.
--
-- The fix is `[{,]=[a-zA-Z]` in all FOUR places the pattern appears — schema ACL, relation ACL,
-- column ACL and default-privilege ACL. Nothing else in the body moves: it is the live definition
-- with four characters changed, and the `-- based-on:` line above is the body that was read.
--
-- THE INVERSE: `migrations/inverse/w1_prov_closed_public_acl_regex_down.sql`.

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
   where n.nspacl::text ~ '[{,]=[a-zA-Z]'
  union all
  select c.schema_name, 'relation'::text, cl.relname,
         format('%s', cl.relacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_class cl on cl.relnamespace = n.oid
   where cl.relacl::text ~ '(anon|authenticated|service_role)=' or cl.relacl::text ~ '[{,]=[a-zA-Z]'
  union all
  select c.schema_name, 'column'::text, format('%s.%s', cl.relname, a.attname),
         format('%s', a.attacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_class cl on cl.relnamespace = n.oid
    join pg_attribute a on a.attrelid = cl.oid and a.attnum > 0 and not a.attisdropped
   where a.attacl::text ~ '(anon|authenticated|service_role)=' or a.attacl::text ~ '[{,]=[a-zA-Z]'
  union all
  select c.schema_name, 'default-privilege'::text, d.defaclobjtype::text,
         format('%s', d.defaclacl::text)
    from closed c
    join pg_namespace n on n.nspname = c.schema_name
    join pg_default_acl d on d.defaclnamespace = n.oid
   where d.defaclacl::text ~ '(anon|authenticated|service_role)=' or d.defaclacl::text ~ '[{,]=[a-zA-Z]'
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
