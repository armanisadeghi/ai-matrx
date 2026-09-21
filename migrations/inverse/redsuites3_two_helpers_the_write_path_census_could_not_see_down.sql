-- chair-step: it restores two LANGUAGE sql bodies that PostgreSQL re-plans on every call, on
-- the hottest write path in the store. That is a performance regression on purpose — it is what
-- `writeperf2_red.sql` RED 4 exists to observe — and it is reversible by re-applying the up-file.
--
-- THE INVERSE of `migrations/campaign/redsuites3_two_helpers_the_write_path_census_could_not_see.sql`.
-- Both bodies back to `LANGUAGE sql`, byte for byte as the catalogue held them before, so
-- `encode(sha256(convert_to(pg_get_functiondef(oid),'utf8')),'hex')` reads
--   iam.governance_columns(text)            b9b18893b5aaa54ca57d717028e7675ed1fca6b67e160df66303f2970e026129
--   platform._confirmation_admission(oid)   0f31541f1d5d6e735c44b6f3c1498c839608d1b875ae19f7473faad92466f92f
-- again. Nothing else is touched: no trigger is detached, no object is dropped, no row moves.

CREATE OR REPLACE FUNCTION iam.governance_columns(p_token text)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select et.governed_columns from platform.entity_types et where et.token = p_token),
    -- THE PLATFORM DEFAULT. Deliberately NOT `visibility` — publishing is an
    -- edit-level action. These three are "delete it, or change who owns it".
    array['created_by', 'organization_id', 'deleted_at']
  );
$function$;

CREATE OR REPLACE FUNCTION platform._confirmation_admission(p_relid oid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select et.id
    from platform.entity_types et
   where to_regclass(quote_ident(et.schema_name) || '.' || quote_ident(et.table_name)) = p_relid
     and et.confirmation_enabled
   limit 1;
$function$;
