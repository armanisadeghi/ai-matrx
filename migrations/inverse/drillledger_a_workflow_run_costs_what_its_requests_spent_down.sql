-- chair-step: the inverse of migrations/campaign/drillledger_a_workflow_run_costs_what_its_requests_spent.sql (lane DRILL-LEDGER-RECORDS) — drops the server-only view workflow._run_cost and its registry row (token workflow_run_cost). No row of anybody's data is touched.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform

delete from platform.entity_types where token = 'workflow_run_cost';
drop view if exists workflow._run_cost;
