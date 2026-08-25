-- Table Kinds Run, Stage B (2026-08-24): register the role='output'
-- kind_component row for the tabular kind family.
--
-- Ledger: common-docs/operations/table-kinds-run.md
-- Component: components/mardown-display/blocks/table-kinds/ (source='bundled';
-- component_key = the FE-synthesized block type = the kind slug).
--
-- ONE SLUG LANDS HERE. `data_table` is the family's primitive — the highest-reuse
-- kind in the data-to-kinds queue — and it is the only slug whose registry row
-- already carries the NEW shape (published INACTIVE by Stage A, awaiting this
-- component to pass the activation dual gate).
--
-- NOT IN THIS FILE — `sql_query_result`, `table_rows` and `pdf_table_extraction`
-- stay on the `generic_structured` floor deliberately: their registry rows still
-- hold the PRE-supersede schema, and their supersede is BREAKING (measured by the
-- compatibility gate, see aidream/aidream/services/table_kinds/models.py), so it
-- rides Stage D with the emitter repoint. Retiring their floor rows now would
-- point a live slug at a component built for a shape the registry does not yet
-- serve. `saved_row` and `parsed_table` are likewise untouched — `parsed_table`
-- is nested by the SHIPPED scraper family and already has a real (C-grade)
-- renderer that Stage D converges.
--
-- The floor retirement (conversion-campaigns.md Law 4b — the fallback is not a
-- component and must never outrank a real one) is still written below, because
-- it is the correct posture and this file is idempotent: `data_table` has no
-- `generic_structured` row today (measured 2026-08-25), so the update is a no-op
-- and stays correct if one is ever seeded.
--
-- Idempotent: safe to re-run.

with family(kind) as (
  values ('data_table')
),
retired as (
  update content_ir.kind_component kc
     set is_active = false,
         notes = 'RETIRED 2026-08-25 (Table Kinds Run Stage B) — replaced by the '
                 'canonical compiled component in '
                 'components/mardown-display/blocks/table-kinds/. Deactivated, never '
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
-- Land the canonical row. An existing DB-authored override (source='db') keeps
-- winning — the live registry, not this file, owns that identity.
inserted as (
  insert into content_ir.kind_component
    (kind_definition_id, platform, role, component_key, source, is_active,
     is_default, sort_order, organization_id, notes)
  select
    kd.id, 'web', 'output', kd.kind, 'bundled', true, true, 100,
    '39c38960-d30c-4840-b0c1-c9960de95582',
    'Table Kinds Run Stage B — canonical compiled component '
    '(components/mardown-display/blocks/table-kinds/)'
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
