-- RAG Kinds Run, Stage B (2026-08-24): register the role='output'
-- kind_component rows for the RAG retrieval + citation kind family, and RETIRE
-- the `generic_structured` floor rows for every slug that now has a real one.
--
-- Ledger: common-docs/operations/rag-kinds-run.md
-- Components: components/mardown-display/blocks/rag-kinds/ (source='bundled';
-- component_key = the FE-synthesized block type = the kind slug).
--
-- WHY THE RETIREMENT IS PART OF THIS FILE, not a follow-up:
-- `generic_structured` is the can-never-fail viewer. Per
-- common-docs/policies/conversion-campaigns.md Law 4b it IS NOT a component,
-- so leaving an ACTIVE floor row beside a real one would let every "does this
-- kind render?" query keep answering yes for the wrong reason. The floor rows
-- are deactivated (never deleted) with a note naming what replaced them.
-- It is ALSO the activation gate: `source_ref` and `retrieved_chunk` land
-- INACTIVE from Stage A and cannot activate until an active role='output'
-- component row exists — this file is what unblocks them.
--
-- CUTOVER POSTURE (deliberate, not an oversight):
--   * `rag_search_result` and `rag_cross_doc_search_result` registry rows still
--     carry the PRE-supersede schema (v4, maturity `placeholder`, `hits` as an
--     anonymous object with no diagnostics). Their breaking supersede rides
--     Stage D with the node repoint. They still get a canonical component here
--     — a component is a renderer, not a schema, and leaving them on the
--     generic floor while their nested `retrieved_chunk` has a real component
--     would render the collection as a JSON dump around beautiful children.
--     Same posture as `seo_rank_serp_landscape` in the rank family.
--   * NOT TOUCHED: `citation` (its ACTIVE source='db' `citation_row` override
--     is the live registry's own identity and keeps winning), `evidence_source`
--     and `claim_evidence` — converging those onto `source_ref` is an open
--     decision with Arman, not something a component migration may presume.
--
-- Idempotent: safe to re-run.

with family(kind) as (
  values
    ('source_ref'),
    ('retrieved_chunk'),
    ('rag_synthesize_result'),
    ('rag_search_result'),
    ('rag_cross_doc_search_result')
),
-- 1. Retire the floor first. The floor rows are is_default=false today, so the
--    unique-default constraint is not the reason for the ordering — the reason
--    is that the intent stays explicit and a re-run is a no-op either way.
retired as (
  update content_ir.kind_component kc
     set is_active = false,
         notes = 'RETIRED 2026-08-24 (RAG Kinds Run Stage B) — replaced by the '
                 'canonical compiled component in '
                 'components/mardown-display/blocks/rag-kinds/. Deactivated, never '
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
    'RAG Kinds Run Stage B — canonical compiled component '
    '(components/mardown-display/blocks/rag-kinds/)'
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
