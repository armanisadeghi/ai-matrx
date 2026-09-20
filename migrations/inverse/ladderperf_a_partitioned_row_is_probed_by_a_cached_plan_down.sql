-- INVERSE of migrations/campaign/ladderperf_a_partitioned_row_is_probed_by_a_cached_plan.sql.
-- It puts platform.entity_row_access_attrs and iam.owner_of back to the bodies that were live
-- on the main database at 2026-09-20 14:00 UTC — the ones whose every probe is a fresh EXECUTE —
-- and drops the generator, the two generated probes and the census.

CREATE OR REPLACE FUNCTION platform.entity_row_access_attrs(p_schema text, p_table text, p_id uuid, OUT o_vis platform.visibility, OUT o_owner uuid, OUT o_org uuid, OUT o_found boolean)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
DECLARE
  v_registry_vis platform.visibility;
BEGIN
  o_found := false;
  o_vis := 'personal'::platform.visibility;
  o_owner := NULL;
  o_org := NULL;

  IF p_schema IS NULL OR p_table IS NULL OR p_id IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    EXECUTE format(
      'SELECT visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  BEGIN
    EXECUTE format(
      'SELECT ''personal''::platform.visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Registry-declared intent for tables with no ownership columns; 'personal'
  -- remains the default when the registry declares nothing.
  SELECT et.default_visibility
    INTO v_registry_vis
  FROM platform.entity_types et
  WHERE et.schema_name = p_schema
    AND et.table_name = p_table
  LIMIT 1;

  -- No ownership columns, but the table IS org-scoped (context.scope_types,
  -- runtime plumbing, ...): surface organization_id so membership-based access
  -- can apply, with the registry's declared visibility.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Row exists but the table carries NO ownership columns at all — a platform
  -- catalog (ui.ui_surface, ...). There is no owner and no org to key access
  -- on, so 'personal' is meaningless here and denies everyone. Honor the
  -- registry's declared intent; 'personal' remains the default when the
  -- registry declares nothing.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, NULL::uuid, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
  EXCEPTION WHEN others THEN
    o_found := false;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION iam.owner_of(p_resource_type text, p_resource_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reg   record;
  v_owner uuid;
begin
  select r.schema_name, r.table_name, r.id_column, r.owner_column
    into v_reg
    from platform.shareable_resource_registry r
   where r.resource_type = p_resource_type and r.is_active;
  if not found then return null; end if;
  execute format('select %I from %I.%I where %I = $1',
                 v_reg.owner_column, v_reg.schema_name, v_reg.table_name, v_reg.id_column)
    into v_owner using p_resource_id;
  return v_owner;
end;
$function$;

drop function if exists platform.static_row_probes_stale();
drop function if exists platform.rebuild_static_row_probes();
drop function if exists platform.static_row_probe_sql();
drop function if exists platform.static_row_probe_spec();
drop function if exists platform.partitioned_row_attrs(text, text, uuid);
drop function if exists iam.registry_owner_of(text, uuid);
