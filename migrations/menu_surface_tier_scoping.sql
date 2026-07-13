-- menu_surface_tier_scoping.sql
--
-- Adversarial-review fix on the agent_surface → associations cutover.
--
-- `agent.menu_surface` is an owner-rights view (agent.card pattern —
-- security_invoker=false, self-scoping WHERE), but the cutover version had NO
-- binding-tier scoping: with the junction's RLS gone, every viewer (anon and
-- authenticated have SELECT) could read — and `fetchSurfaceBindingLayers`
-- would APPLY — other users' user-tier bindings and foreign orgs' org-tier
-- bindings on any agent whose card is visible (e.g. public agents).
--
-- Fix: tier-encoded `role` gates each row, house-pattern (same as agent.card):
--   binding:global            → everyone (incl. anon; global is global)
--   binding:u:<uid>           → only that user
--   binding:o|p|t:<id>        → only members of the edge's access org
-- Role-less agent→surface edges are hidden (the cutover migration normalized
-- all of them to tier roles; the binding service always writes a role).
--
-- Idempotent (CREATE OR REPLACE VIEW).

CREATE OR REPLACE VIEW agent.menu_surface AS
SELECT a.id,
    a.source_id AS agent_id,
    us.name AS surface_name,
    NULLIF(a.metadata ->> 'user_id', '')::uuid AS user_id,
    a.organization_id,
    NULLIF(a.metadata ->> 'project_id', '')::uuid AS project_id,
    NULLIF(a.metadata ->> 'task_id', '')::uuid AS task_id,
    COALESCE(a.metadata -> 'value_mappings', '{}'::jsonb) AS value_mappings,
    COALESCE((a.metadata ->> 'version')::integer, 1) AS version,
    COALESCE((a.metadata ->> 'visibility')::platform.visibility, 'internal'::platform.visibility) AS visibility,
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
        WHEN o.id IS NOT NULL THEN jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'description', o.description, 'logo_url', o.logo_url, 'is_personal', o.is_personal, 'is_system', o.is_system)
        ELSE NULL::jsonb
    END AS organizations,
    a.role
FROM platform.associations a
    JOIN agent.card c ON c.id = a.source_id
    LEFT JOIN iam.organizations o ON o.id = a.organization_id
    JOIN ui.ui_surface us ON us.id = a.target_id
WHERE a.source_type = 'agent' AND a.target_type = 'surface'
  AND (
    a.role = 'binding:global'
    OR a.role = 'binding:u:' || (SELECT auth.uid())::text
    OR ((a.role LIKE 'binding:o:%' OR a.role LIKE 'binding:p:%' OR a.role LIKE 'binding:t:%')
        AND iam.has_org_access(a.organization_id))
  );

NOTIFY pgrst, 'reload schema';
