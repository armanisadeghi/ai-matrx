-- chair-step: lane DRILL-LEDGER-RECORDS (PROGRESS-DRILL-FINISH decision 27) — CREATES one server-only view workflow._run_cost(run_id, cost, requests): what each workflow run's requests spent, from the AI usage ledger (chat.user_request.workflow_run_id joined to runtime.global_execution by request), one row per run id, so it joins 1:1 to workflow.run. Registered System machinery (token workflow_run_cost, a projection of workflow_run). No client grant; no table, policy or row of anybody's data is touched.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform
--
-- WHY FROM THE LEDGER. batch.cost_event carries no run column, so a run's cost is what its requests
-- spent: every execution whose request belongs to the run (a request is the run's when its
-- workflow_run_id says so; stamped at write time since access-ladder T-10b). A run with no request
-- has no row here — the workflow_runs definition (lane DRILL-CONVERSIONS) says how many runs carry
-- any request rather than showing them as free. No definition is declared here.
-- INVERSE: migrations/inverse/drillledger_a_workflow_run_costs_what_its_requests_spent_down.sql

create view workflow._run_cost with (security_invoker = true) as
select ur.workflow_run_id              as run_id,
       coalesce(sum(e.cost), 0)         as cost,
       count(distinct ur.id)::bigint    as requests
  from chat.user_request ur
  left join runtime.global_execution e on e.request_id = ur.id
 where ur.workflow_run_id is not null
 group by ur.workflow_run_id;

revoke all on workflow._run_cost from public, anon, authenticated;
comment on view workflow._run_cost is
  'DRILL-LEDGER-RECORDS: what each workflow run''s requests spent — one row per run id (joins 1:1 to workflow.run): cost = the AI usage ledger''s cost of every execution of every request whose workflow_run_id is the run; requests = those requests. A run with no request has no row. Server-only (System machinery, token workflow_run_cost).';
comment on column workflow._run_cost.cost is 'Dollars: the sum of runtime.global_execution.cost over the executions of the run''s requests (the same ledger the usage pages count).';
comment on column workflow._run_cost.requests is 'The run''s requests (chat.user_request rows whose workflow_run_id is the run), whether or not they have spent.';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, projects_token, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'workflow_run_cost', 'workflow', '_run_cost', 'Workflow run cost', 1, false, false, true,
  'What each workflow run''s requests spent, from the AI usage ledger; one row per run.',
  false, false, false, 'system', false, 'machinery',
  'Projection: a server-only view over chat.user_request + runtime.global_execution, one row per workflow run id. It owns no rows.',
  'projection', 'workflow_run', 'organization',
  'System machinery with no client lane; read only by a server-side definer step.',
  'organization', 'standard', 'system',
  'Lane DRILL-LEDGER-RECORDS: workflow-run cost from the ledger (PROGRESS-DRILL-FINISH decision 27).',
  false, false, 'workflow._run_cost'::regclass
)
on conflict (token) do nothing;
