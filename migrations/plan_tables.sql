-- plan.node / plan.entity / plan.profile via platform.create_entity_table.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migration: plan_tables).

-- plan.node — every planned URL on a site
SELECT platform.create_entity_table(
  p_schema => 'plan', p_table => 'node', p_token => 'plan_node', p_label => 'Plan Node',
  p_fields => ARRAY[
    'site_id uuid NOT NULL REFERENCES web.site(id)',
    'parent_id uuid REFERENCES plan.node(id)',
    $$node_type text NOT NULL CHECK (node_type IN ('home','pillar','cluster','article','index'))$$,
    'page_type_id uuid REFERENCES platform.categories(id)',
    'status_id uuid REFERENCES platform.categories(id)',
    'slug text',
    'label text NOT NULL',
    'primary_keyword_id uuid REFERENCES seo.keyword(id)',
    $$brief text[] NOT NULL DEFAULT '{}'$$,
    $$technical_depth text CHECK (technical_depth IN ('low','medium','high'))$$,
    'priority smallint CHECK (priority BETWEEN 1 AND 3)',
    'needs_reviewer boolean NOT NULL DEFAULT false',
    $$attributes jsonb NOT NULL DEFAULT '{}'::jsonb$$,
    'route text',
    'pillar_label text',
    'cluster_label text',
    'depth smallint NOT NULL DEFAULT 0'
  ],
  p_variant => 'entity', p_versioned => true, p_soft_delete => true,
  p_visibility => 'internal', p_category => false, p_listed => true,
  p_org_default => true, p_gin_jsonb => true);

-- plan.entity — planned people/sources/media/orgs referenced by nodes
SELECT platform.create_entity_table(
  p_schema => 'plan', p_table => 'entity', p_token => 'plan_entity', p_label => 'Plan Entity',
  p_fields => ARRAY[
    'site_id uuid NOT NULL REFERENCES web.site(id)',
    $$entity_type text NOT NULL CHECK (entity_type IN ('person','source','media','org'))$$,
    'label text NOT NULL',
    'source_type_id uuid REFERENCES platform.categories(id)',
    $$attributes jsonb NOT NULL DEFAULT '{}'::jsonb$$
  ],
  p_variant => 'entity', p_versioned => true, p_soft_delete => true,
  p_visibility => 'internal', p_category => false, p_listed => true,
  p_org_default => true, p_gin_jsonb => true);

-- plan.profile — vertical profile: config, not content
SELECT platform.create_entity_table(
  p_schema => 'plan', p_table => 'profile', p_token => 'plan_profile', p_label => 'Plan Vertical Profile',
  p_fields => ARRAY[
    'vertical text NOT NULL',
    $$attribute_schemas jsonb NOT NULL DEFAULT '{}'::jsonb$$,
    $$template_map jsonb NOT NULL DEFAULT '{}'::jsonb$$,
    $$schema_org_map jsonb NOT NULL DEFAULT '{}'::jsonb$$,
    $$cadences jsonb NOT NULL DEFAULT '{}'::jsonb$$
  ],
  p_variant => 'entity', p_versioned => true, p_soft_delete => true,
  p_visibility => 'internal', p_category => false, p_listed => false,
  p_org_default => true, p_gin_jsonb => true);

-- Constraints create_entity_table can't express
ALTER TABLE plan.node ADD CONSTRAINT node_slug_required
  CHECK (slug IS NOT NULL OR node_type = 'home');
ALTER TABLE plan.node ADD CONSTRAINT node_slug_shape
  CHECK (slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Uniqueness (live rows only; parent_id NULL treated as a real value)
CREATE UNIQUE INDEX node_site_parent_slug_key ON plan.node (site_id, parent_id, slug)
  NULLS NOT DISTINCT WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX node_site_route_key ON plan.node (site_id, route)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX profile_org_vertical_key ON plan.profile (organization_id, vertical)
  WHERE deleted_at IS NULL;

-- Query-path indexes
CREATE INDEX ON plan.node (site_id);
CREATE INDEX ON plan.node (parent_id);
CREATE INDEX ON plan.node (primary_keyword_id);
CREATE INDEX ON plan.node (status_id);
CREATE INDEX ON plan.node (page_type_id);
CREATE INDEX ON plan.entity (site_id);

UPDATE platform.entity_types SET title_column='label' WHERE token IN ('plan_node','plan_entity');
UPDATE platform.entity_types SET title_column='vertical' WHERE token='plan_profile';
