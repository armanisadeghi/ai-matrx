-- surface_binding_scope_integrity.sql
--
-- A surface binding's tier role is its audience authority:
--   binding:o:<org>     -> that organization
--   binding:p:<project> -> the project's organization
--   binding:t:<task>    -> the task's organization
--
-- The generic assoc_add hardening introduced by aidream migration 0227 derives
-- ordinary edge organization_id from an endpoint. For agent -> surface, that
-- selected the AGENT'S organization instead of the explicit binding audience.
-- The role and organization_id could therefore disagree, making the editor
-- show one org while agent.menu_surface grouped/scoped the row under another.

CREATE OR REPLACE FUNCTION agent.enforce_surface_binding_scope_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_scope_id uuid;
  v_expected_org_id uuid;
  v_expected_tier text;
BEGIN
  IF NEW.source_type <> 'agent' OR NEW.target_type <> 'surface' THEN
    RETURN NEW;
  END IF;

  IF NEW.payload_kind IS DISTINCT FROM 'surface_binding' THEN
    RAISE EXCEPTION
      'agent -> surface edge % must use payload_kind=surface_binding (got %)',
      NEW.id, NEW.payload_kind
      USING ERRCODE = '23514';
  END IF;

  IF NEW.role = 'binding:global' THEN
    v_expected_tier := 'global';
  ELSIF NEW.role ~ '^binding:u:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    v_expected_tier := 'user';
    v_scope_id := substr(NEW.role, length('binding:u:') + 1)::uuid;
    IF (SELECT auth.uid()) IS NOT NULL
       AND v_scope_id IS DISTINCT FROM (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'surface user binding must target the calling user'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.role ~ '^binding:o:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    v_expected_tier := 'org';
    v_scope_id := substr(NEW.role, length('binding:o:') + 1)::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM iam.organizations o WHERE o.id = v_scope_id
    ) THEN
      RAISE EXCEPTION 'surface binding organization % does not exist', v_scope_id
        USING ERRCODE = '23503';
    END IF;
    IF (SELECT auth.uid()) IS NOT NULL
       AND NOT iam.has_org_access(v_scope_id) THEN
      RAISE EXCEPTION
        'surface organization binding requires membership in %', v_scope_id
        USING ERRCODE = '42501';
    END IF;
    v_expected_org_id := v_scope_id;
  ELSIF NEW.role ~ '^binding:p:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    v_expected_tier := 'project';
    v_scope_id := substr(NEW.role, length('binding:p:') + 1)::uuid;
    SELECT p.organization_id
      INTO v_expected_org_id
      FROM workspace.projects p
     WHERE p.id = v_scope_id;
    IF v_expected_org_id IS NULL THEN
      RAISE EXCEPTION
        'surface binding project % does not exist or has no organization',
        v_scope_id
        USING ERRCODE = '23503';
    END IF;
    IF (SELECT auth.uid()) IS NOT NULL
       AND NOT iam.has_access(
         'project',
         v_scope_id,
         'viewer'::public.permission_level
       ) THEN
      RAISE EXCEPTION
        'surface project binding requires viewer access to project %', v_scope_id
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.role ~ '^binding:t:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    v_expected_tier := 'task';
    v_scope_id := substr(NEW.role, length('binding:t:') + 1)::uuid;
    SELECT t.organization_id
      INTO v_expected_org_id
      FROM workspace.tasks t
     WHERE t.id = v_scope_id;
    IF v_expected_org_id IS NULL THEN
      RAISE EXCEPTION
        'surface binding task % does not exist or has no organization',
        v_scope_id
        USING ERRCODE = '23503';
    END IF;
    IF (SELECT auth.uid()) IS NOT NULL
       AND NOT iam.has_access(
         'task',
         v_scope_id,
         'viewer'::public.permission_level
       ) THEN
      RAISE EXCEPTION
        'surface task binding requires viewer access to task %', v_scope_id
        USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION
      'invalid surface binding role: %', COALESCE(NEW.role, '<null>')
      USING ERRCODE = '23514';
  END IF;

  IF NEW.metadata ->> 'tier' IS DISTINCT FROM v_expected_tier THEN
    RAISE EXCEPTION
      'surface binding role % requires metadata.tier=% (got %)',
      NEW.role, v_expected_tier, NEW.metadata ->> 'tier'
      USING ERRCODE = '23514';
  END IF;

  IF v_expected_tier = 'user' THEN
    IF NULLIF(NEW.metadata ->> 'user_id', '')::uuid
       IS DISTINCT FROM v_scope_id THEN
      RAISE EXCEPTION
        'surface user binding role and metadata.user_id disagree'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NULLIF(NEW.metadata ->> 'user_id', '') IS NOT NULL THEN
    RAISE EXCEPTION 'non-user surface binding cannot carry metadata.user_id'
      USING ERRCODE = '23514';
  END IF;

  IF v_expected_tier = 'project' THEN
    IF NULLIF(NEW.metadata ->> 'project_id', '')::uuid
       IS DISTINCT FROM v_scope_id THEN
      RAISE EXCEPTION
        'surface project binding role and metadata.project_id disagree'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NULLIF(NEW.metadata ->> 'project_id', '') IS NOT NULL THEN
    RAISE EXCEPTION
      'non-project surface binding cannot carry metadata.project_id'
      USING ERRCODE = '23514';
  END IF;

  IF v_expected_tier = 'task' THEN
    IF NULLIF(NEW.metadata ->> 'task_id', '')::uuid
       IS DISTINCT FROM v_scope_id THEN
      RAISE EXCEPTION
        'surface task binding role and metadata.task_id disagree'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NULLIF(NEW.metadata ->> 'task_id', '') IS NOT NULL THEN
    RAISE EXCEPTION 'non-task surface binding cannot carry metadata.task_id'
      USING ERRCODE = '23514';
  END IF;

  -- BEFORE UPDATE may change columns omitted by an ON CONFLICT DO UPDATE list.
  -- This repairs an old malformed row on its next upsert as well as protecting
  -- all new writes while generic assoc_add derives an endpoint org.
  IF v_expected_org_id IS NOT NULL THEN
    NEW.organization_id := v_expected_org_id;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION agent.enforce_surface_binding_scope_integrity()
  FROM PUBLIC, anon, authenticated;

-- Existing sibling trigger function was also directly executable through the
-- exposed agent schema. Trigger invocation does not require caller EXECUTE.
REVOKE ALL ON FUNCTION agent.guard_global_surface_binding()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_surface_binding_scope_integrity
  ON platform.associations;
CREATE TRIGGER trg_surface_binding_scope_integrity
BEFORE INSERT OR UPDATE OF
  source_type, target_type, role, organization_id, metadata, payload_kind
ON platform.associations
FOR EACH ROW
EXECUTE FUNCTION agent.enforce_surface_binding_scope_integrity();

-- Repair role-authoritative audience orgs.
UPDATE platform.associations a
SET organization_id = substr(a.role, length('binding:o:') + 1)::uuid
WHERE a.source_type = 'agent'
  AND a.target_type = 'surface'
  AND a.role ~ '^binding:o:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
  AND a.organization_id IS DISTINCT FROM
      substr(a.role, length('binding:o:') + 1)::uuid;

UPDATE platform.associations a
SET organization_id = p.organization_id
FROM workspace.projects p
WHERE a.source_type = 'agent'
  AND a.target_type = 'surface'
  AND a.role = 'binding:p:' || p.id::text
  AND a.organization_id IS DISTINCT FROM p.organization_id;

UPDATE platform.associations a
SET organization_id = t.organization_id
FROM workspace.tasks t
WHERE a.source_type = 'agent'
  AND a.target_type = 'surface'
  AND a.role = 'binding:t:' || t.id::text
  AND a.organization_id IS DISTINCT FROM t.organization_id;

-- Existing owner/admin-authored private org bindings made an explicit
-- "available to every member" promise. Backfill both canonical viewer grants:
-- `agent_card` admits the safe launcher row and `agent` admits execution.
-- Public/builtin/same-org-internal agents need no redundant grant.
WITH org_bindings AS (
  SELECT DISTINCT
    a.source_id AS agent_id,
    substr(a.role, length('binding:o:') + 1)::uuid AS organization_id,
    a.created_by
  FROM platform.associations a
  WHERE a.source_type = 'agent'
    AND a.target_type = 'surface'
    AND a.role ~ '^binding:o:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
)
INSERT INTO iam.permissions (
  resource_type,
  resource_id,
  granted_to_organization_id,
  permission_level,
  is_public,
  created_by,
  status
)
SELECT
  permission_target.resource_type,
  b.agent_id,
  b.organization_id,
  'viewer'::public.permission_level,
  false,
  b.created_by,
  'active'
FROM org_bindings b
JOIN agent.definition d ON d.id = b.agent_id
CROSS JOIN (
  VALUES ('agent'::text), ('agent_card'::text)
) AS permission_target(resource_type)
JOIN iam.memberships m
  ON m.container_type = 'organization'
 AND m.container_id = b.organization_id
 AND m.user_id = b.created_by
 AND m.status = 'active'
 AND m.deleted_at IS NULL
 AND m.role IN ('owner', 'admin')
WHERE d.deleted_at IS NULL
  AND d.agent_type <> 'builtin'
  AND NOT (
    d.card_visibility = 'public'
    OR (
      d.organization_id = b.organization_id
      AND d.card_visibility IN ('internal', 'link')
    )
  )
ON CONFLICT (
  resource_type,
  resource_id,
  granted_to_organization_id
) DO NOTHING;

-- Independent read-boundary protection. Any row whose role, metadata, and
-- access organization disagree is hidden instead of displayed or applied
-- under the wrong audience.
CREATE OR REPLACE VIEW agent.menu_surface AS
SELECT a.id,
    a.source_id AS agent_id,
    us.name AS surface_name,
    NULLIF(a.metadata ->> 'user_id', '')::uuid AS user_id,
    a.organization_id,
    NULLIF(a.metadata ->> 'project_id', '')::uuid AS project_id,
    NULLIF(a.metadata ->> 'task_id', '')::uuid AS task_id,
    COALESCE(
      a.payload -> 'value_mappings',
      a.metadata -> 'value_mappings',
      '{}'::jsonb
    ) AS value_mappings,
    COALESCE((a.metadata ->> 'version')::integer, 1) AS version,
    COALESCE(
      (a.metadata ->> 'visibility')::platform.visibility,
      'internal'::platform.visibility
    ) AS visibility,
    a.created_at,
    a.created_at AS updated_at,
    a.created_by,
    a.created_by AS updated_by,
    c.name AS agent_name,
    c.description AS agent_description,
    c.agent_type,
    c.category AS agent_category,
    c.tags AS agent_tags,
    c.variable_definitions AS agent_variable_definitions,
    c.output_schema AS agent_output_schema,
    c.is_active AS agent_is_active,
    c.card_visibility AS agent_card_visibility,
    to_jsonb(c.*) AS agent,
    CASE
      WHEN o.id IS NOT NULL THEN jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug,
        'description', o.description,
        'logo_url', o.logo_url,
        'is_personal', o.is_personal,
        'is_system', o.is_system
      )
      ELSE NULL::jsonb
    END AS organizations,
    a.role
FROM platform.associations a
JOIN agent.card c ON c.id = a.source_id
LEFT JOIN iam.organizations o ON o.id = a.organization_id
JOIN ui.ui_surface us ON us.id = a.target_id
WHERE a.source_type = 'agent'
  AND a.target_type = 'surface'
  AND (
    (
      a.role = 'binding:global'
      AND a.metadata ->> 'tier' = 'global'
      AND NULLIF(a.metadata ->> 'user_id', '') IS NULL
      AND NULLIF(a.metadata ->> 'project_id', '') IS NULL
      AND NULLIF(a.metadata ->> 'task_id', '') IS NULL
    )
    OR (
      a.role = 'binding:u:' || (SELECT auth.uid())::text
      AND a.metadata ->> 'tier' = 'user'
      AND a.role = 'binding:u:' || NULLIF(a.metadata ->> 'user_id', '')
      AND NULLIF(a.metadata ->> 'project_id', '') IS NULL
      AND NULLIF(a.metadata ->> 'task_id', '') IS NULL
    )
    OR (
      a.role = 'binding:o:' || a.organization_id::text
      AND a.metadata ->> 'tier' = 'org'
      AND NULLIF(a.metadata ->> 'user_id', '') IS NULL
      AND NULLIF(a.metadata ->> 'project_id', '') IS NULL
      AND NULLIF(a.metadata ->> 'task_id', '') IS NULL
      AND iam.has_org_access(a.organization_id)
    )
    OR (
      a.role = 'binding:p:' || NULLIF(a.metadata ->> 'project_id', '')
      AND a.metadata ->> 'tier' = 'project'
      AND NULLIF(a.metadata ->> 'user_id', '') IS NULL
      AND NULLIF(a.metadata ->> 'task_id', '') IS NULL
      AND iam.has_org_access(a.organization_id)
    )
    OR (
      a.role = 'binding:t:' || NULLIF(a.metadata ->> 'task_id', '')
      AND a.metadata ->> 'tier' = 'task'
      AND NULLIF(a.metadata ->> 'user_id', '') IS NULL
      AND NULLIF(a.metadata ->> 'project_id', '') IS NULL
      AND iam.has_org_access(a.organization_id)
    )
  );

GRANT SELECT ON agent.menu_surface TO anon, authenticated, service_role;

DO $assert$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM platform.associations a
    WHERE a.source_type = 'agent'
      AND a.target_type = 'surface'
      AND (
        (
          a.role LIKE 'binding:o:%'
          AND a.role IS DISTINCT FROM
              'binding:o:' || a.organization_id::text
        )
        OR (
          a.role LIKE 'binding:p:%'
          AND a.role IS DISTINCT FROM
              'binding:p:' || NULLIF(a.metadata ->> 'project_id', '')
        )
        OR (
          a.role LIKE 'binding:t:%'
          AND a.role IS DISTINCT FROM
              'binding:t:' || NULLIF(a.metadata ->> 'task_id', '')
        )
      )
  ) THEN
    RAISE EXCEPTION
      'surface binding scope-integrity backfill left mismatched rows';
  END IF;
END
$assert$;

NOTIFY pgrst, 'reload schema';
