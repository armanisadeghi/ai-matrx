-- Canonical research lineage across planning and marketing.
--
-- These are semantic/provenance links, never containment. Keeping
-- container_side='none' is load-bearing: attaching research must not grant a
-- site/page viewer access to the underlying research corpus.

insert into platform.association_types
    (source_type, target_type, label, container_side, conveys_max, is_active, notes)
values
    ('research_topic', 'web_site', null, 'none', 'viewer', true,
     'Research grounding for a managed site. Semantic provenance only; conveys no access.'),
    ('research_tag', 'web_site', null, 'none', 'viewer', true,
     'Research dimension applied to a managed site. Semantic provenance only; conveys no access.'),
    ('research_topic', 'plan_node', null, 'none', 'viewer', true,
     'Research grounding for one planned page. Semantic provenance only; conveys no access.'),
    ('research_tag', 'plan_node', null, 'none', 'viewer', true,
     'Research dimension applied to one planned page. Semantic provenance only; conveys no access.'),
    ('research_topic', 'web_page', null, 'none', 'viewer', true,
     'Research grounding retained on the canonical page. Semantic provenance only; conveys no access.'),
    ('research_tag', 'web_page', null, 'none', 'viewer', true,
     'Research dimension retained on the canonical page. Semantic provenance only; conveys no access.')
on conflict do nothing;

-- Preserve the four legacy primary research links already recorded in
-- web.site.settings.content_plan.research_topic_id. The JSON key remains the
-- primary/default choice for existing generators; this association is the
-- durable many-to-many lineage used everywhere else.
insert into platform.associations (
    source_type, source_id, target_type, target_id,
    organization_id, role, metadata, created_by
)
select
    'research_topic',
    (s.settings #>> '{content_plan,research_topic_id}')::uuid,
    'web_site',
    s.id,
    s.organization_id,
    'primary_grounding',
    jsonb_build_object('backfilled_from', 'web.site.settings.content_plan.research_topic_id'),
    s.created_by
from web.site s
join research.rs_topic t
  on t.id = (s.settings #>> '{content_plan,research_topic_id}')::uuid
where s.deleted_at is null
  and nullif(s.settings #>> '{content_plan,research_topic_id}', '') is not null
on conflict do nothing;
