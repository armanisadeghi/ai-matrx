-- Commerce Kinds Stage B (2026-08-29): canonical web/output component rows
-- for the 11 W5-aligned commerce kinds.
--
-- `skeptic_challenge` is deliberately absent: W5 emits value_assessment for
-- the inverted skeptic pass, and aidream/0550 retired the unused draft before
-- activation. One valuation shape gets one canonical renderer.
--
-- Idempotent. Any generic_structured floor is deactivated before the real row
-- lands so the fallback can never outrank a canonical commerce component.

with family(kind) as (
  values
    ('asset_grading'),
    ('enrichment_verification'),
    ('intake_photo_grouping'),
    ('item_vision_extraction'),
    ('listing_draft'),
    ('lot_detection'),
    ('pricing_proposal'),
    ('product_research'),
    ('publish_preflight'),
    ('review_verdict'),
    ('value_assessment')
),
retired_floor as (
  update content_ir.kind_component kc
     set is_active = false,
         notes = 'RETIRED 2026-08-29 (Commerce Kinds Stage B) — replaced by '
                 'the canonical compiled component in '
                 'components/mardown-display/blocks/commerce-kinds/. The '
                 'generic_structured fallback is not a real component and '
                 'must never outrank this row.',
         updated_at = now()
    from content_ir.kind_definition kd
    join family f on f.kind = kd.kind
   where kc.kind_definition_id = kd.id
     and kc.platform = 'web'
     and kc.role = 'output'
     and kc.source = 'bundled'
     and kc.component_key = 'generic_structured'
     and kc.deleted_at is null
     and kc.is_active
  returning kc.id
),
inserted as (
  insert into content_ir.kind_component
    (kind_definition_id, platform, role, component_key, source, is_active,
     is_default, sort_order, organization_id, notes)
  select
    kd.id, 'web', 'output', kd.kind, 'bundled', true, true, 100,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'Commerce Kinds Stage B — canonical compiled component '
    '(components/mardown-display/blocks/commerce-kinds/)'
  from content_ir.kind_definition kd
  join family f on f.kind = kd.kind
  where kd.deleted_at is null
    and not exists (
      select 1
      from content_ir.kind_component kc
      where kc.kind_definition_id = kd.id
        and kc.platform = 'web'
        and kc.role = 'output'
        and kc.component_key = kd.kind
        and kc.deleted_at is null
    )
  returning id
)
select
  (select count(*) from retired_floor) as floor_rows_retired,
  (select count(*) from inserted) as canonical_rows_inserted;
