-- chair-step: the inverse of migrations/campaign/drillusagepage_drill_declares_ai_usage.sql (lane DRILL-USAGE-PAGE) — drops the declared drill definition function(s) it created. No row of anybody's data is touched.
-- lane: DRILL-USAGE-PAGE
-- lock: platform

drop function if exists platform.drill_def__ai_usage();
