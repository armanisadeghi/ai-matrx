-- chair-step: RC-A5f inverse — restores agent.menu_surface without the payload-kind filter (any payload kind on an agent->surface edge is then projected by this owner-rights view).

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
  WHERE a.source_type = 'agent'::text AND a.target_type = 'surface'::text AND (a.role = 'binding:global'::text AND (a.metadata ->> 'tier'::text) = 'global'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL OR a.role = ('binding:u:'::text || ((( SELECT auth.uid() AS uid))::text)) AND (a.metadata ->> 'tier'::text) = 'user'::text AND a.role = ('binding:u:'::text || NULLIF(a.metadata ->> 'user_id'::text, ''::text)) AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL OR a.role = ('binding:o:'::text || a.organization_id::text) AND (a.metadata ->> 'tier'::text) = 'org'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL AND iam.has_org_access(a.organization_id) OR a.role = ('binding:p:'::text || NULLIF(a.metadata ->> 'project_id'::text, ''::text)) AND (a.metadata ->> 'tier'::text) = 'project'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'task_id'::text, ''::text) IS NULL AND iam.has_org_access(a.organization_id) OR a.role = ('binding:t:'::text || NULLIF(a.metadata ->> 'task_id'::text, ''::text)) AND (a.metadata ->> 'tier'::text) = 'task'::text AND NULLIF(a.metadata ->> 'user_id'::text, ''::text) IS NULL AND NULLIF(a.metadata ->> 'project_id'::text, ''::text) IS NULL AND iam.has_org_access(a.organization_id));
