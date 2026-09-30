-- chair-step: the inverse of migrations/campaign/drillconv_a_workflow_run_is_counted_from_one_view.sql (lane DRILL-CONVERSIONS) — drops the server-only view workflow._run_facts and its registry row (token workflow_run_facts). No row of anybody's data is touched.
-- lane: DRILL-CONVERSIONS
-- lock: platform

delete from platform.entity_types where token = 'workflow_run_facts';
drop view if exists workflow._run_facts;
