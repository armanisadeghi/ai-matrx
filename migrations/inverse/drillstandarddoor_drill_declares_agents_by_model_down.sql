-- chair-step: the inverse of migrations/campaign/drillstandarddoor_drill_declares_agents_by_model.sql (lane DRILL-STANDARD-DOOR) — drops the declared drill definition function(s) it created. No row of anybody's data is touched.
-- lane: DRILL-STANDARD-DOOR
-- lock: platform

drop function if exists platform.drill_def__agents_by_model();
