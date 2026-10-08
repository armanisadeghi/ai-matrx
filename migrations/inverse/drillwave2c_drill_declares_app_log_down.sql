-- chair-step: the inverse of migrations/campaign/drillwave2c_drill_declares_app_log.sql (lane DRILL-WAVE2-C) — drops the declared drill definition function(s) it created. No row of anybody's data is touched.
-- lane: DRILL-WAVE2-C
-- lock: platform

drop function if exists platform.drill_def__app_log();
