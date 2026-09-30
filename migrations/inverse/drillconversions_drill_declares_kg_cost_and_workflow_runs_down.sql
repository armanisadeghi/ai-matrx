-- chair-step: the inverse of migrations/campaign/drillconversions_drill_declares_kg_cost_and_workflow_runs.sql (lane DRILL-CONVERSIONS) — drops the declared drill definition function(s) it created. No row of anybody's data is touched.
-- lane: DRILL-CONVERSIONS
-- lock: platform

drop function if exists platform.drill_def__kg_cost();
drop function if exists platform.drill_def__workflow_runs();
