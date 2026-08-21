-- content_ir_workflow_result_output_routes.sql
--
-- KINDS EVERYWHERE, army mission "FE kind component routes" (copy-B batch 1).
-- Ledger: docs/KIND_COMPONENT_LEDGER.md.
--
-- Registers the WEB OUTPUT route for the eight workflow runtime RESULT kinds
-- that had a schema, a passing canonical example, and NO
-- (kind, platform='web', role='output') row — so every one of them reached
-- the reader only by SILENT fallback (`applyIrKindRoute` -> `routeToGeneric`,
-- marker `by:'generic', unverified:true, reason:'no-component'`):
--
--   branch_result · bulk_result · criteria_gate_result · gather_result
--   map_result · operation_result · saved_row · workflow_run_result
--
-- ROUTE DECISION — the explicit basic route, not a bespoke component.
-- Searched first (2026-08-20), per Reuse -> Extend -> Compose -> Create:
--   * `content_ir.kind_component` web/output rows (all 83) — nothing renders a
--     workflow runtime result; the closest, `agent_result`, is a DIFFERENT
--     wrapper (model/usage/content[]), not these payloads.
--   * `features/content-ir/kinds/*` compiled definitions — no result family.
--   * repo-wide grep for each slug — only tests and a same-named local
--     variable in features/marketing/content-plan; NO bespoke display exists
--     for any of the eight, so there is no legacy display to retire here.
-- These eight are eight DIFFERENT plumbing shapes (`metadata.family =
-- 'workflow_io'`), not one family; inventing eight renderers for run-plumbing
-- receipts would be the defect, so each gets the platform floor — REGISTERED,
-- so the resolver answers `by:'db'` and the creator alarm can tell "basic
-- route chosen on purpose" from "nothing registered".
--
-- This is the role='output' mirror of content_ir_input_component_bindings.sql,
-- which already gave these same kinds their role='input' rows, and follows
-- content_ir_generic_structured_roots.sql exactly.
--
-- Canonical examples: all eight ALREADY have a canonical, `validation_status =
-- 'passed'` kind_example pinned to the current kind_definition.version, so
-- this migration authors none. Verification renders THOSE rows through the
-- render seam (features/content-ir/__tests__/kind-workflow-result-routes.test.tsx).
--
-- Does NOT touch kind_definition.is_active and does NOT touch
-- metadata.maturity — a basic route is not a maturity promotion.
--
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
    'branch_result',
    'bulk_result',
    'criteria_gate_result',
    'gather_result',
    'map_result',
    'operation_result',
    'saved_row',
    'workflow_run_result'
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
