-- content_ir_engine_result_generic_routes.sql
--
-- KINDS EVERYWHERE — explicit basic routes for the 8 ENGINE-RESULT kinds
-- (claims ledger: docs/KIND_COMPONENT_LEDGER.md, copy-E).
--
--   branch_result · bulk_result · criteria_gate_result · gather_result
--   map_result · operation_result · rendered_text · workflow_run_result
--
-- WHY THESE EIGHT: chosen by MEASURED live traffic, not list order. Over the
-- last 30 days of `workflow.node_events` (event_type = 'node_completed') these
-- are the highest-volume output kinds with NO (kind, 'web', 'output') row —
-- branch_result 201, workflow_run_result 65, gather_result 51, map_result 43,
-- rendered_text 16, with bulk_result / operation_result / criteria_gate_result
-- completing the same engine-result family. Every one of them was reaching the
-- generic viewer by SILENT fallback (`applyIrKindRoute` -> `routeToGeneric`,
-- marker `by:'generic', unverified:true, reason:'no-component'`).
--
-- WHAT THIS CHANGES: the silent fallback becomes an EXPLICIT registered
-- decision. After this migration the resolver answers (`__ir_route.by = 'db'`),
-- so the creator-alarm can tell "a basic route was CHOSEN for this shape" from
-- "nothing is registered for this shape". The pixels a user sees are the same
-- today — `GenericStructuredBlock` still renders the honest "no custom view
-- yet" note (it keys that note on `marker.reason`, not on the route tier).
--
-- REUSE-FIRST VERDICT (Inventory Law): searched the compiled bootstrap
-- (features/content-ir/registry/system-kinds.ts + system-components.ts), every
-- registered `legacyBlockType` facet, and the block dispatch registry. NONE of
-- these eight is a content family anything already renders — they are engine
-- bookkeeping: a branch direction, a dispatch count, a child run id, a gathered
-- value list, a partial-failure item list, an action receipt. There is nothing
-- to reuse and nothing worth minting a bespoke renderer for at this bar, so
-- rule 2 applies: register the generic structured renderer EXPLICITLY.
--
-- KNOWN UPGRADE PATH (deliberate, not an oversight):
--   * `rendered_text.text` is markdown — a dedicated component that streams it
--     through MarkdownStream is a real improvement over the JSON tree view.
--   * `criteria_gate_result.criteria[]` is a rich per-criterion coverage table.
--   * `bulk_result.items[]` is a succeeded/failed ledger with nested NodeError.
-- Each is a purpose-built-component follow-up. This migration does not block
-- any of them: re-registering a different `component_key` for the same
-- (kind, platform, role) is a one-line update against this same row.
--
-- MATURITY IS NOT TOUCHED. `kind_definition.metadata.maturity` is left exactly
-- as it is. A basic route on a placeholder kind is still a placeholder; only
-- the separate verification pass awards `verified`.
--
-- `kind_definition.is_active` is likewise NOT touched — activation is the dual
-- gate's verdict and is owned centrally (`shape:activate`).
--
-- CANONICAL EXAMPLES: all eight already carry a canonical `kind_example`
-- (verified live before writing this file), so unlike the
-- `content_ir_generic_structured_roots.sql` precedent this migration authors
-- none and only registers resolver rows.
--
-- Idempotent: re-running is safe (conflict inferred on the real partial unique
-- index `kind_component_default_unique`).

begin;

-- Resolver rows (R1): (kind, web, output) -> generic_structured.
-- `source = 'bundled'` because the component ships compiled with the app.
-- `is_active = true` is truthful: the generic viewer really IS this kind's web
-- output component today. It is NOT a claim that a bespoke renderer exists.
insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id
from content_ir.kind_definition kd
where kd.kind in (
    'branch_result',
    'bulk_result',
    'criteria_gate_result',
    'gather_result',
    'map_result',
    'operation_result',
    'rendered_text',
    'workflow_run_result'
  )
  and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  and kd.deleted_at is null
on conflict (kind_definition_id, platform, role)
  where (is_default and deleted_at is null)
do update set
  component_key = excluded.component_key,
  source        = excluded.source,
  config        = excluded.config,
  is_active     = excluded.is_active,
  updated_at    = now();

commit;
