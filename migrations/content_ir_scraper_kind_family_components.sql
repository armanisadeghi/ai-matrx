-- Scraper Kinds Run, Stage B (2026-08-24): register the role='output'
-- kind_component rows for the web_page / scraper kind family. Each kind's
-- canonical component ships compiled in matrx-frontend (source='bundled';
-- component_key = the FE-synthesized block type = the kind slug — see
-- components/mardown-display/blocks/scraper-kinds/). These rows satisfy the
-- render leg of the activation dual gate.
--
-- TWO STEPS, and the first one matters:
--
-- 1. `scraped_page` already carries an ACTIVE bundled `generic_structured`
--    row — the can-never-fail viewer, i.e. NO component: a reader gets a
--    key/value dump. THE FALLBACK IS NOT A COMPONENT and a fallback row must
--    never outrank a real one, so it is DEACTIVATED (never deleted, with a
--    note) before the real row lands.
-- 2. Insert the canonical row for every family slug that has no live
--    (kind, web, output) row. An existing source='db' component still wins —
--    the live unique constraint owns that identity and a user-authored
--    component must not be clobbered by a bundled one.
--
-- Idempotent: safe to re-run.

-- 1. Retire the generic fallback that stands where a real component belongs.
update content_ir.kind_component kc
set is_active = false,
    notes = coalesce(kc.notes || ' | ', '') ||
            'Deactivated 2026-08-24 (Scraper Kinds Run Stage B): superseded by the canonical '
            || 'scraped_page component. generic_structured is the fallback viewer, not a component.',
    updated_at = now()
from content_ir.kind_definition kd
where kc.kind_definition_id = kd.id
  and kd.kind = 'scraped_page'
  and kd.deleted_at is null
  and kc.deleted_at is null
  and kc.is_active
  and kc.platform = 'web'
  and kc.role = 'output'
  and kc.component_key = 'generic_structured';

-- 2. Land the canonical rows.
with family(kind) as (
  values
    ('scraped_page'), ('scraper_batch_result'), ('scraper_crawl_result'),
    ('page_link'), ('link_buckets'), ('page_image'), ('page_video'),
    ('page_audio'), ('page_heading'), ('page_section'), ('page_list'),
    ('page_block'), ('code_block'), ('redirect_hop'), ('content_fingerprint'),
    ('page_metadata'), ('page_removal'), ('page_cleaning_report')
)
insert into content_ir.kind_component
  (kind_definition_id, platform, role, component_key, source, is_active,
   organization_id, notes)
select
  kd.id, 'web', 'output', kd.kind, 'bundled', true,
  '39c38960-d30c-4840-b0c1-c9960de95582',
  'Scraper Kinds Run Stage B — canonical compiled component (components/mardown-display/blocks/scraper-kinds/)'
from content_ir.kind_definition kd
join family f on f.kind = kd.kind
where kd.deleted_at is null
  and not exists (
    select 1 from content_ir.kind_component kc
    where kc.kind_definition_id = kd.id
      and kc.platform = 'web'
      and kc.role = 'output'
      and kc.deleted_at is null
      and kc.is_active
  );
