-- content_ir_execution_tool_kind_routes.sql
--
-- Registers the (kind, 'web', 'output') route for the 8 kinds minted by the
-- aidream TOOLS FAMILY SWEEP batch lead-w2b — execution / text / IDE / wheel
-- (aidream/docs/workflow/KIND_TOOL_LEDGER.md):
--
--   shell_execution                  (shell_execute, shell_python,
--                                     code_execute_python)
--   calculation_result               (math_calculate)
--   text_analysis / word_frequency   (text_analyze)
--   ide_state_fields                 (vsc_get_state)
--   wheel_spin_result / wheel_choice
--     / wheel_image                  (random_wheel)
--
-- (text_regex_extract REUSES the already-routed regex_extract_result kind —
-- no new row for it here.)
--
-- Same call as content_ir_tool_trace_kind_routes.sql, for the same reason:
-- every one is maturity='placeholder' — an honest capture of a tool result's
-- outer structure — and the generic structured renderer displays these shapes
-- correctly today. What matters is that the route is REGISTERED, so the
-- resolver answers by:'db' instead of falling through applyIrKindRoute ->
-- routeToGeneric with marker by:'generic', unverified:true.
--
-- Reuse searched: nothing in this repo renders shell output, math results,
-- IDE snapshots, or the wheel result as a kind component. The FE wheel
-- animation consumes the tool's STREAM step events, not the result payload —
-- a bespoke wheel_spin_result component is a good future upgrade of
-- `component_key` on this same row, NOT a second registration (rows filed in
-- docs/KIND_COMPONENT_LEDGER.md).
--
-- Maturity untouched; is_active on kind_definition untouched here —
-- activation is the dual gate's verdict, run separately after this lands.
--
-- Idempotent. Conflicts inferred on kind_component_default_unique.

begin;

insert into content_ir.kind_component (
  kind_definition_id, platform, role, component_key,
  source, config, is_default, is_active, sort_order, organization_id
)
select
  kd.id, 'web', 'output', 'generic_structured',
  'bundled', '{}'::jsonb, true, true, 100, kd.organization_id
from content_ir.kind_definition kd
where kd.kind in (
    'shell_execution',
    'calculation_result',
    'text_analysis',
    'word_frequency',
    'ide_state_fields',
    'wheel_spin_result',
    'wheel_choice',
    'wheel_image'
  )
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
