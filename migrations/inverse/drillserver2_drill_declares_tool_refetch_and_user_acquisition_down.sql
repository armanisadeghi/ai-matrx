-- chair-step: the inverse of migrations/campaign/drillserver2_drill_declares_tool_refetch_and_user_acquisition.sql (lane DRILL-SERVER-2) — drops the declared drill definition function(s) it created. No row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform

drop function if exists platform.drill_def__tool_refetch();
drop function if exists platform.drill_def__user_acquisition();
