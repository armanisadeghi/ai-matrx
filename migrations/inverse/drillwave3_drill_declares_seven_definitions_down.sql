-- chair-step: the inverse of migrations/campaign/drillwave3_drill_declares_seven_definitions.sql (lane DRILL-WAVE3) — drops the declared drill definition function(s) it created. No row of anybody's data is touched.
-- lane: DRILL-WAVE3
-- lock: platform

drop function if exists platform.drill_def__crm_deals();
drop function if exists platform.drill_def__hr_timesheets();
drop function if exists platform.drill_def__ops_issue_events();
drop function if exists platform.drill_def__rs_analyses();
drop function if exists platform.drill_def__rs_syntheses();
drop function if exists platform.drill_def__tool_calls();
drop function if exists platform.drill_def__write_failures();
