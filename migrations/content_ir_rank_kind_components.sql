-- Rank Kinds Run, Stage B (2026-08-24): register the role='output'
-- kind_component rows for the rank / SERP-landscape kind family, and RETIRE
-- the `generic_structured` floor rows for every slug that now has a real one.
--
-- Ledger: common-docs/operations/rank-kinds-run.md
-- Components: components/mardown-display/blocks/rank-kinds/ (source='bundled';
-- component_key = the FE-synthesized block type = the kind slug).
--
-- WHY THE RETIREMENT IS PART OF THIS FILE, not a follow-up:
-- `generic_structured` is the can-never-fail viewer. Per
-- common-docs/policies/conversion-campaigns.md Law 4b it IS NOT a component,
-- so leaving an ACTIVE floor row beside a real one would let every "does this
-- kind render?" query keep answering yes for the wrong reason. The floor rows
-- are deactivated (never deleted) with a note naming what replaced them.
--
-- NOT IN THIS FILE — `seo_rank_history` and `seo_rank_check_result` stay on the
-- floor deliberately: their registry rows still carry the pre-supersede shape
-- and their breaking supersede rides Stage D with the node repoint.
--
-- Idempotent: safe to re-run.

with family(kind) as (
  values
    ('provider_run_receipt'),
    ('seo_rank_reading'),
    ('serp_placement'),
    ('seo_rank_target'),
    ('seo_rank_portfolio'),
    ('seo_rank_target_removal'),
    ('seo_rank_serp_landscape')
),
-- 1. Retire the floor first: `kind_component_default_unique` allows exactly one
--    default per (kind, platform, role), and the floor rows are is_default=false
--    today — but deactivating them before the insert keeps the intent explicit
--    and makes a re-run a no-op either way.
retired as (
  update content_ir.kind_component kc
     set is_active = false,
         notes = 'RETIRED 2026-08-24 (Rank Kinds Run Stage B) — replaced by the '
                 'canonical compiled component in '
                 'components/mardown-display/blocks/rank-kinds/. Deactivated, never '
                 'deleted: conversion-campaigns.md Law 4b — the fallback is not a '
                 'component and must never outrank a real one.',
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
-- 2. Land the canonical row. An existing DB-authored override (source='db')
--    keeps winning — the live registry, not this file, owns that identity.
inserted as (
  insert into content_ir.kind_component
    (kind_definition_id, platform, role, component_key, source, is_active,
     is_default, sort_order, organization_id, notes)
  select
    kd.id, 'web', 'output', kd.kind, 'bundled', true, true, 100,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'Rank Kinds Run Stage B — canonical compiled component '
    '(components/mardown-display/blocks/rank-kinds/)'
  from content_ir.kind_definition kd
  join family f on f.kind = kd.kind
  where kd.deleted_at is null
    and not exists (
      select 1 from content_ir.kind_component kc
      where kc.kind_definition_id = kd.id
        and kc.platform = 'web'
        and kc.role = 'output'
        and kc.component_key = kd.kind
        and kc.deleted_at is null
    )
  returning id
)
select
  (select count(*) from retired)  as floor_rows_retired,
  (select count(*) from inserted) as canonical_rows_inserted;
