-- content_ir_io_result_kind_routes.sql
--
-- KINDS EVERYWHERE, army mission "FE kind component routes" (copy-B batch 3).
-- Ledger: docs/KIND_COMPONENT_LEDGER.md.
--
-- The remaining I/O + research analysis kinds that had a schema, a passing
-- canonical example, and NO (kind, platform='web', role='output') row — so each
-- reached a reader only by SILENT fallback (`by:'generic', unverified:true,
-- reason:'no-component'`):
--
--   http_response · office_extraction_result · office_file_result · page
--   regex_extract_result · scraped_page
--   research_page_analysis · research_setup_suggestion
--
-- ROUTE DECISION — the explicit basic route. Searched first, per
-- Reuse -> Extend -> Compose -> Create:
--   * all registered web/output rows — the closest precedent is the office
--     family (`office_document`, `office_presentation`, `office_spreadsheet`),
--     which is ALREADY on `generic_structured`; routing the two office RESULT
--     kinds anywhere else would split one family across two renderers.
--   * `features/content-ir/kinds/*` — no compiled definition for any of the eight.
--   * repo-wide grep per slug — matches only in content-ir's own test fixtures;
--     NO bespoke display exists for any of the eight, so nothing legacy is retired.
-- These are transport/plumbing receipts (an HTTP response, a paginated window, a
-- regex match set, a scraped page) and two research analysis payloads whose shapes
-- are wide and mostly optional. The platform floor is the honest renderer; it is
-- REGISTERED here so the resolver answers `by:'db'` instead of falling back, and
-- the creator alarm can tell "basic route chosen on purpose" from "nothing registered".
--
-- CANONICAL EXAMPLES: all eight already have a canonical example pinned to the
-- current kind_definition.version, so this migration authors none. Verification
-- renders THOSE rows through the render seam
-- (features/content-ir/__tests__/kind-explicit-basic-routes.test.tsx).
--
-- Does NOT touch kind_definition.is_active and does NOT touch metadata.maturity.
-- Idempotent, data-only (no DDL). Safe to re-apply.

begin;

insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id, metadata
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id,
  jsonb_build_object(
    'note',
    'Explicit basic route (army: FE kind component routes, copy-B, 2026-08-20): registered so this kind never reaches the reader by silent fallback. Not a bespoke renderer and not a maturity promotion.'
  )
from content_ir.kind_definition kd
where kd.deleted_at is null
  and kd.kind in (
    'http_response',
    'office_extraction_result',
    'office_file_result',
    'page',
    'regex_extract_result',
    'scraped_page',
    'research_page_analysis',
    'research_setup_suggestion'
  )
on conflict (kind_definition_id, platform, role)
  where (is_default and deleted_at is null)
do update set
  component_key = excluded.component_key,
  source        = excluded.source,
  config        = excluded.config,
  is_active     = excluded.is_active,
  metadata      = excluded.metadata,
  updated_at    = now();

commit;
