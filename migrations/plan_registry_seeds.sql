-- Association registry, roles, category dimensions, edge payload kind for plan.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migration: plan_registry_seeds).

-- Association pairs: exactly one containment edge per row (up to web_site);
-- everything else conveys nothing. label NULL => semantics live in role.
INSERT INTO platform.association_types (source_type, target_type, label, container_side, conveys_max, is_active, notes) VALUES
('plan_node',   'web_site',    NULL, 'target', 'editor', true, 'Containment: site access implies access to its plan. Written by _mirror_site trigger from plan.node.site_id.'),
('plan_entity', 'web_site',    NULL, 'target', 'editor', true, 'Containment: site access implies access to its planned entities. Written by _mirror_site trigger from plan.entity.site_id.'),
('plan_node',   'plan_node',   NULL, 'none',   'viewer', true, 'Roles: relies_on_hub, related. Structural parent_id FK is NOT mirrored here.'),
('plan_node',   'plan_entity', NULL, 'none',   'viewer', true, 'Roles: about, cites, embeds, authored_by, reviewed_by. plan_review payload lives on these edges.'),
('plan_entity', 'plan_entity', NULL, 'none',   'viewer', true, 'Roles: created_by (e.g. media created by person).'),
('plan_node',   'seo_topic',   NULL, 'none',   'viewer', true, 'Role: topic. Taxonomy tagging of planned URLs.'),
('plan_entity', 'seo_topic',   NULL, 'none',   'viewer', true, 'Role: topic. Taxonomy tagging of planned entities.'),
('plan_node',   'seo_keyword', NULL, 'none',   'viewer', true, 'Role: secondary_keyword. Primary keyword is the plan.node.primary_keyword_id FK, not an edge.'),
('plan_entity', 'category',    NULL, 'none',   'viewer', true, 'Role: member. Category membership for planned entities.');

-- Roles (association_role dimension) — reuse existing topic/related/member; add the new ones.
INSERT INTO platform.categories (organization_id, dimension, name, slug, is_system, position)
SELECT '39c38960-d30c-4840-b0c1-c9960de95582', 'association_role', v.name, v.name, true, v.pos
FROM (VALUES
  ('relies_on_hub', 10), ('about', 20), ('cites', 30), ('embeds', 40),
  ('authored_by', 50), ('reviewed_by', 60), ('created_by', 70), ('secondary_keyword', 80)
) AS v(name, pos)
WHERE NOT EXISTS (
  SELECT 1 FROM platform.categories c
  WHERE c.dimension='association_role' AND c.slug=v.name AND c.deleted_at IS NULL);

-- Category dimensions for the plan schema
INSERT INTO platform.categories (organization_id, dimension, name, slug, is_system, position)
SELECT '39c38960-d30c-4840-b0c1-c9960de95582', v.dim, v.name, v.slug, true, v.pos
FROM (VALUES
  ('plan_page_type','Homepage','homepage',10),
  ('plan_page_type','Pillar Page','pillar-page',20),
  ('plan_page_type','Service Page','service-page',30),
  ('plan_page_type','Location Page','location-page',40),
  ('plan_page_type','Article','article',50),
  ('plan_page_type','Guide','guide',60),
  ('plan_page_type','Comparison','comparison',70),
  ('plan_page_type','FAQ','faq',80),
  ('plan_page_type','Index / Listing','index-page',90),
  ('plan_page_type','About','about-page',100),
  ('plan_page_type','Contact','contact-page',110),
  ('plan_status','Idea','idea',10),
  ('plan_status','Planned','planned',20),
  ('plan_status','Briefed','briefed',30),
  ('plan_status','In Production','in-production',40),
  ('plan_status','In Review','in-review',50),
  ('plan_status','Approved','approved',60),
  ('plan_status','Published','published',70),
  ('plan_status','Live Verified','live-verified',80),
  ('plan_status','Needs Update','needs-update',90),
  ('plan_status','Retired','retired',100),
  ('plan_person_role','Author','author',10),
  ('plan_person_role','Reviewer','reviewer',20),
  ('plan_person_role','Editor','editor',30),
  ('plan_person_role','Subject Matter Expert','subject-matter-expert',40),
  ('plan_source_type','Study / Research Paper','study',10),
  ('plan_source_type','Government / Official','government',20),
  ('plan_source_type','Industry Report','industry-report',30),
  ('plan_source_type','News','news',40),
  ('plan_source_type','Dataset','dataset',50),
  ('plan_source_type','Book','book',60),
  ('plan_source_type','Video','video',70),
  ('plan_source_type','Internal','internal',80)
) AS v(dim, name, slug, pos);

-- Typed edge payload for reviewed_by edges
INSERT INTO platform.edge_payload_kind (kind, version, description, json_schema, source_type, target_type)
VALUES ('plan_review', 1,
  'Review record on a plan_node -> plan_entity reviewed_by edge: when it was reviewed and any notes.',
  '{"type":"object","properties":{"review_date":{"type":"string","format":"date"},"notes":{"type":"string"}},"required":["review_date"],"additionalProperties":false}'::jsonb,
  'plan_node', 'plan_entity');
