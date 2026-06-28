-- iam.has_access — platform-global tenant tier
--
-- WHY: The 2026 canonical RLS changeover had no concept of "platform-global"
-- content. Builtin/system agents (and system prompts, default templates, etc.)
-- live in the "Matrx System" org at visibility='internal' with created_by=NULL.
-- The canonical access model grants `internal` reads only to MEMBERS of the
-- owning org, so neither regular users nor admins (not members of Matrx System)
-- could read them on any DIRECT table read. The list page worked only because
-- agx_get_list_full is SECURITY DEFINER and hardcodes `agent_type='builtin'`;
-- every detail/build/run/surfaces page (admin AND user-facing /agents/[id])
-- reads agent.definition directly via RLS and rendered nothing (notFound).
--
-- FIX (generic, applies to EVERY entity, not just agents):
--   1. Mark a system_org as `global_readable` (the platform tenant).
--   2. has_access: any authenticated user gets `viewer` on a global tenant's
--      internal+ content  -> the "all platform users" tier between `internal`
--      (one org) and `public` (anonymous web). Read-only.
--   3. has_access: super-admins get FULL manage on global tenant content, so the
--      admin builder's direct RLS writes to system agents succeed.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, upsert, CREATE OR REPLACE.

-- 1. Registry flag -----------------------------------------------------------
ALTER TABLE public.system_orgs
  ADD COLUMN IF NOT EXISTS global_readable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.system_orgs.global_readable IS
  'When true, this system tenant''s internal+ content is readable by every '
  'authenticated user (the platform-global tier) and fully managed by super-admins. '
  'Set for the Matrx System platform tenant; NOT for the Library (grants model).';

-- 2. Register the Matrx System org as the platform-global tenant --------------
INSERT INTO public.system_orgs (key, organization_id, description, global_readable)
VALUES (
  'system',
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'Matrx System — platform tenant; internal+ content (builtin agents, system prompts, default templates) is globally readable by all authenticated users and managed by super-admins.',
  true
)
ON CONFLICT (key) DO UPDATE
  SET organization_id = EXCLUDED.organization_id,
      description     = EXCLUDED.description,
      global_readable = EXCLUDED.global_readable;

-- 3. Canonical access resolver with the platform-global tier ------------------
CREATE OR REPLACE FUNCTION iam.has_access(
  p_type text,
  p_id uuid,
  p_required permission_level DEFAULT 'viewer'::permission_level
)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
AS $function$
DECLARE
  v_schema text; v_table text; v_is_component boolean;
  v_uid uuid := (SELECT auth.uid());
  v_vis platform.visibility; v_owner uuid; v_org uuid;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  rec record;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT schema_name, table_name, COALESCE(is_component,false)
    INTO v_schema, v_table, v_is_component
  FROM platform.entity_types WHERE token = p_type;
  IF v_schema IS NULL THEN RETURN false; END IF;

  -- composition: access is exactly the parent's, full depth
  IF v_is_component THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships WHERE child_type = p_type AND kind='composition' LIMIT 1;
    IF v_parent_type IS NULL THEN RETURN false; END IF;
    EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', v_parent_col, v_schema, v_table)
      INTO v_parent_id USING p_id;
    IF v_parent_id IS NULL THEN RETURN false; END IF;
    RETURN iam.has_access(v_parent_type, v_parent_id, p_required);
  END IF;

  -- standard entity
  BEGIN
    EXECUTE format('SELECT visibility, created_by, organization_id FROM %I.%I WHERE id=$1', v_schema, v_table)
      INTO v_vis, v_owner, v_org USING p_id;
  EXCEPTION WHEN others THEN RETURN false; END;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_owner = v_uid THEN RETURN true; END IF;                                   -- owner
  -- org-admin oversight (read-only): owners/admins see any row in their org, regardless of visibility tier
  IF p_required = 'viewer' AND v_org IS NOT NULL AND public.is_org_admin(v_org) THEN RETURN true; END IF;
  IF v_vis = 'public' AND p_required = 'viewer' THEN RETURN true; END IF;        -- public read

  -- platform-global tier: a registered global system tenant's internal+ content is
  -- READABLE by every authenticated user (builtin agents, system prompts, default
  -- templates). The "all platform users" tier between internal (one org) and public
  -- (anonymous web). Read-only; managing it still requires super-admin (below).
  IF p_required = 'viewer'
       AND v_vis >= 'internal'::platform.visibility
       AND v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM public.system_orgs WHERE global_readable)
  THEN RETURN true; END IF;

  -- platform tenant management: super-admins fully manage (edit/delete) the global
  -- system tenant's content — bounded to system-org rows, NOT all user content.
  IF v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM public.system_orgs WHERE global_readable)
       AND public.is_super_admin()
  THEN RETURN true; END IF;

  IF public.has_permission(p_type, p_id, p_required) THEN RETURN true; END IF;   -- explicit grant
  IF v_vis >= 'internal'::platform.visibility AND v_org IS NOT NULL
       AND iam.has_org_access(v_org) THEN RETURN true; END IF;                   -- org context (internal+)
  IF v_vis >= 'internal'::platform.visibility THEN                              -- containment cascade
    FOR rec IN SELECT parent_type, fk_column FROM platform.entity_relationships
               WHERE child_type = p_type AND kind='containment' LOOP
      EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', rec.fk_column, v_schema, v_table)
        INTO v_parent_id USING p_id;
      IF v_parent_id IS NOT NULL AND iam.has_access(rec.parent_type, v_parent_id, p_required) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END $function$;
