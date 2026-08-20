-- Search Kinds Pilot, Stage B (2026-08-20): register the role='output'
-- kind_component rows for the search kind family. Each kind's canonical
-- component ships compiled in matrx-frontend (source='bundled';
-- component_key = the FE-synthesized block type = the kind slug — see
-- components/mardown-display/blocks/search-kinds/). These rows satisfy the
-- render leg of the activation dual gate; activation itself runs via aidream
-- scripts/seed_search_kind_family.py after these land.
-- Idempotent: one row per (kind, web, output, bundled), insert-if-absent.

with family(kind) as (
  values
    ('web_search_results'), ('web_result'), ('news_result'), ('video_result'),
    ('faq_item'), ('discussion_result'), ('local_place'), ('entity_card'),
    ('ai_answer'), ('rating'), ('opening_hours'), ('postal_address'),
    ('geo_coordinates')
)
insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, is_active,
   organization_id, notes)
select
  kd.id, 'web', 'output', kd.kind, 'bundled', true,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'Search Kinds Pilot Stage B — canonical compiled component (components/mardown-display/blocks/search-kinds/)'
from content_ir.kind_definition kd
join family f on f.kind = kd.kind
where kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component kc
    where kc.kind_definition_id = kd.id
      and kc.platform = 'web'
      and kc.role = 'output'
      and kc.source = 'bundled'
      and kc.deleted_at is null
  );
