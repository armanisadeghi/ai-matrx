-- RC-A5f — agent.menu_surface READS ONLY THE ONE PAYLOAD KIND IT KNOWS (verify-RC-A5 §7.2).
-- chair-step: re-creates the owner-rights view agent.menu_surface with one added filter (payload_kind is null or surface_binding); columns, grants and every other clause unchanged.
-- Design: common-docs/projects/rich-content-unification/ASSOCIATION-VISIBILITY.md §11. Register row RC-A5.
--
-- agent.menu_surface is an owner-rights view (no security_invoker): it reads platform.associations
-- as postgres, so the RC-A5 restrictive policy never applies to it. It projects payload keys
-- (value_mappings, write_policies, auto_run) from agent->surface edges. Today every such edge is a
-- surface_binding (declared ungated), but text_anchor, text_anchor_set and relation_snapshot accept
-- any pair, so a content payload on an agent->surface edge would have been served here unchecked.
-- The filter makes the bound structural instead of a property of today's rows. Forcing test:
-- aidream db/tests/test_association_visibility.py::test_menu_surface_never_serves_a_content_payload.
-- Inverse: migrations/inverse/rca5f_menu_surface_reads_only_binding_payloads_down.sql.

set local lock_timeout = '2s';

create or replace view agent.menu_surface as
 SELECT a.id,
    a.source_id AS agent_id,
    us.name AS surface_name,
    NULLIF(a.metadata ->> 'user_id'::text, ''::text)::uuid AS user_id,
    a.organization_id,
    NULLIF(a.metadata ->> 'project_id'::text, ''::text)::uuid AS project_id,
    NULLIF(a.metadata ->> 'task_id'::text, ''::text)::uuid AS task_id,
    COALESCE(a.payload -> 'value_mappings'::text, a.metadata -> 'value_mappings'::text, '{}'::jsonb) AS value_mappings,
    COALESCE((a.metadata ->> 'version'::text)::integer, 1) AS version,
    COALESCE((a.metadata ->> 'visibility'::text)::platform.visibility, 'internal'::platform.visibility) AS visibility,
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
    a.role,
    COALESCE(a.payload -> 'write_policies'::text, '{}'::jsonb) AS write_policies,
    COALESCE((a.payload ->> 'auto_run'::text)::boolean, false) AS auto_run
   FROM platform.associations a
     JOIN agent.card c ON c.id = a.source_id
     LEFT JOIN iam.organizations o ON o.id = a.organization_id
     JOIN ui.ui_surface us ON us.id = a.target_id
  WHERE a.source_type = 'agent'::text AND a.target_type = 'surface'::text
    -- RC-A5: this view runs with its owner's rights, so it reads only the one payload kind it knows.
    AND (a.payload_kind IS NULL OR a.payload_kind = 'surface_binding'::text) AND (a.role = 'binding:global'::text AND (a.metadata ->> 'tier'::text) = 'global'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL OR a.role = ('binding:u:'::text || ((( SELECT auth.uid() AS uid))::text)) AND (a.metadata ->> 'tier'::text) = 'user'::text AND a.role = ('binding:u:'::text || NULLIF(a.metadata ->> 'user_id'::text, ''::text)) AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL OR a.role = ('binding:o:'::text || a.organization_id::text) AND (a.metadata ->> 'tier'::text) = 'org'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL AND iam.has_org_access(a.organization_id) OR a.role = ('binding:p:'::text || NULLIF(a.metadata ->> 'project_id'::text, ''::text)) AND (a.metadata ->> 'tier'::text) = 'project'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL AND iam.has_org_access(a.organization_id) OR a.role = ('binding:t:'::text || NULLIF(a.metadata ->> 'task_id'::text, ''::text)) AND (a.metadata ->> 'tier'::text) = 'task'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND iam.has_org_access(a.organization_id));
