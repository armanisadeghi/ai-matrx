-- C1: ONE resolver body (audit gap G16). Canonical implementation = iam.has_access_for;
-- iam.has_access and iam.has_access_as become thin wrappers. Gains vs before:
-- (a) the education-assignment branch now exists in ALL variants (was has_access-only;
--     matched zero rows at flip time — 0 assignment edges, 0 scope memberships);
-- (b) has_access_as loses its hand-inlined drifted permission check (it excluded
--     'pending' grants and honored the legacy is_public flag — 0 such rows live).
-- Parity-verified over 981 (user,type,id,level) cases before/after (identical hashes).

CREATE OR REPLACE FUNCTION public._edu_can_read_via_assignment(p_user_id uuid, p_type text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from platform.associations a
    join iam.memberships m
      on m.container_type = 'scope'
     and m.container_id   = a.target_id
     and m.user_id        = p_user_id
     and m.status         = 'active'
     and m.deleted_at is null
    where a.source_type = p_type
      and a.source_id   = p_id
      and a.target_type = 'scope'
      and a.role        = 'assignment'
  )
  or (
    p_type = 'fc_card' and exists (
      select 1
      from platform.associations link
      join platform.associations a
        on a.source_type = 'fc_set'
       and a.source_id   = link.target_id
       and a.target_type = 'scope'
       and a.role        = 'assignment'
      join iam.memberships m
        on m.container_type = 'scope'
       and m.container_id   = a.target_id
       and m.user_id        = p_user_id
       and m.status         = 'active'
       and m.deleted_at is null
      where link.source_type = 'fc_card'
        and link.source_id   = p_id
        and link.target_type = 'fc_set'
        and link.role        = 'member'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public._edu_can_read_via_assignment(p_type text, p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public._edu_can_read_via_assignment((select auth.uid()), p_type, p_id);
$function$;

CREATE OR REPLACE FUNCTION iam.has_access_for(p_user_id uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
DECLARE
  v_schema text; v_table text; v_is_component boolean;
  v_uid uuid := p_user_id;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  v_c_schema text; v_c_table text; v_c_owner uuid;
  v_c_vis platform.visibility; v_c_org uuid; v_c_found boolean;
  rec record;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT schema_name, table_name, COALESCE(is_component,false)
    INTO v_schema, v_table, v_is_component
  FROM platform.entity_types WHERE token = p_type;
  IF v_schema IS NULL THEN RETURN false; END IF;

  IF v_is_component THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships WHERE child_type = p_type AND kind='composition' LIMIT 1;
    IF v_parent_type IS NULL THEN RETURN false; END IF;
    EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', v_parent_col, v_schema, v_table)
      INTO v_parent_id USING p_id;
    IF v_parent_id IS NULL THEN RETURN false; END IF;
    RETURN iam.has_access_for(v_uid, v_parent_type, v_parent_id, p_required);
  END IF;

  IF p_type = 'data_store' AND p_required = 'viewer'
       AND public.user_can_read_data_store_via_grant(v_uid, p_id) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_vis, v_owner, v_org, v_found
  FROM platform.entity_row_access_attrs(v_schema, v_table, p_id);
  IF NOT COALESCE(v_found, false) THEN RETURN false; END IF;

  IF v_owner = v_uid THEN RETURN true; END IF;
  IF p_required = 'viewer' AND v_org IS NOT NULL AND public.is_org_admin_for(v_uid, v_org) THEN RETURN true; END IF;
  IF v_vis = 'public' AND p_required = 'viewer' THEN RETURN true; END IF;

  IF p_required = 'viewer'
       AND v_vis >= 'internal'::platform.visibility
       AND v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
  THEN RETURN true; END IF;

  IF v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
       AND public.is_super_admin_for(v_uid)
  THEN RETURN true; END IF;

  IF public.has_permission_for(v_uid, p_type, p_id, p_required) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM iam.memberships m
    JOIN iam.membership_grant g ON g.member_role = m.role AND g.container_type IN (p_type, '*')
    WHERE m.container_type = p_type AND m.container_id = p_id AND m.user_id = v_uid
      AND m.deleted_at IS NULL AND g.confers >= p_required
  ) THEN RETURN true; END IF;

  IF p_required = 'viewer' AND public._edu_can_read_via_assignment(v_uid, p_type, p_id) THEN
    RETURN true;
  END IF;

  FOR rec IN
    SELECT r.container_type, r.container_id
    FROM platform.reachability r
    WHERE r.item_type = p_type AND r.item_id = p_id
      AND r.max_level >= p_required
  LOOP
    IF public.has_permission_for(v_uid, rec.container_type, rec.container_id, p_required) THEN
      RETURN true;
    END IF;
    IF rec.container_type = 'data_store' AND p_required = 'viewer'
         AND public.user_can_read_data_store_via_grant(v_uid, rec.container_id) THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM iam.memberships m
      JOIN iam.membership_grant g ON g.member_role = m.role
        AND g.container_type IN (rec.container_type, '*')
      WHERE m.container_type = rec.container_type AND m.container_id = rec.container_id
        AND m.user_id = v_uid AND m.deleted_at IS NULL AND g.confers >= p_required
    ) THEN
      RETURN true;
    END IF;
    SELECT et.schema_name, et.table_name INTO v_c_schema, v_c_table
    FROM platform.entity_types et WHERE et.token = rec.container_type;
    IF v_c_schema IS NOT NULL THEN
      SELECT * INTO v_c_vis, v_c_owner, v_c_org, v_c_found
      FROM platform.entity_row_access_attrs(v_c_schema, v_c_table, rec.container_id);
      IF v_c_owner = v_uid THEN RETURN true; END IF;
      IF p_required = 'viewer' AND v_c_vis IS NOT NULL THEN
        IF v_c_vis = 'public' THEN RETURN true; END IF;
        IF v_c_vis >= 'internal'::platform.visibility
             AND v_c_org IS NOT NULL AND iam.has_org_access_for(v_uid, v_c_org) THEN RETURN true; END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_vis >= 'internal'::platform.visibility AND v_org IS NOT NULL
       AND iam.has_org_access_for(v_uid, v_org) THEN RETURN true; END IF;
  IF v_vis >= 'internal'::platform.visibility THEN
    FOR rec IN SELECT parent_type, fk_column FROM platform.entity_relationships
               WHERE child_type = p_type AND kind='containment' LOOP
      EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', rec.fk_column, v_schema, v_table)
        INTO v_parent_id USING p_id;
      IF v_parent_id IS NOT NULL AND iam.has_access_for(v_uid, rec.parent_type, v_parent_id, p_required) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION iam.has_access(p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
  SELECT iam.has_access_for((SELECT auth.uid()), p_type, p_id, p_required);
$function$;

CREATE OR REPLACE FUNCTION iam.has_access_as(p_user uuid, p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
  SELECT iam.has_access_for(p_user, p_type, p_id, p_required);
$function$;
