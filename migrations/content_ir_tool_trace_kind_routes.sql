-- content_ir_tool_trace_kind_routes.sql
--
-- Registers the (kind, 'web', 'output') route for the 11 kinds minted by the
-- aidream TOOLS FAMILY SWEEP batch 3 — the trace-debugging family
-- (aidream/docs/workflow/KIND_TOOL_LEDGER.md, agent `claude-tools-02`):
--
--   tool_trace_event_page / tool_trace_event    (debug_traces_recent,
--                                                _failures_since, _by_conv)
--   tool_trace_call_detail / tool_call_record   (debug_traces_by_call)
--   tool_trace_file_listing / tool_trace_file   (debug_traces_list_files)
--   tool_trace_file_window                      (debug_traces_get_file)
--   tool_trace_incident_report                  (report_trace_incident)
--   tool_trace_incident_list / tool_trace_incident
--     / tool_trace_incident_filter              (get_open_trace_incidents)
--
-- Same call as content_ir_tool_result_kind_routes.sql, for the same reason:
-- every one is maturity='placeholder' — an honest capture of a tool result's
-- outer structure — and the generic structured renderer displays these shapes
-- correctly today. What matters is that the route is REGISTERED, so the
-- resolver answers by:'db' instead of falling through applyIrKindRoute ->
-- routeToGeneric with marker by:'generic', unverified:true.
--
-- Reuse searched: nothing in this repo renders cx_tool_trace rows as a kind.
-- The admin trace surfaces read the REST routes directly and draw their own
-- tables; they are not kind components and repointing them is a separate,
-- larger change than registering a route. A bespoke timeline view for
-- tool_trace_event_page is a good future upgrade of `component_key` on this
-- same row — it is NOT a second registration.
--
-- Maturity untouched (ledger rule 9); is_active untouched here — activation is
-- the dual gate's verdict, run separately after this lands.
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
    'tool_trace_event',
    'tool_trace_event_page',
    'tool_trace_call_detail',
    'tool_call_record',
    'tool_trace_file',
    'tool_trace_file_listing',
    'tool_trace_file_window',
    'tool_trace_incident',
    'tool_trace_incident_filter',
    'tool_trace_incident_list',
    'tool_trace_incident_report'
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
