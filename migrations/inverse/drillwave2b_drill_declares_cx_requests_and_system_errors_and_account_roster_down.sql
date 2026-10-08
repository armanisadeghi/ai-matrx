-- chair-step: the inverse of migrations/campaign/drillwave2b_drill_declares_cx_requests_and_system_errors_and_account_roster.sql (lane DRILL-WAVE2-B) — drops the three declared drill definition functions it created. No row of anybody's data is touched.
-- lane: DRILL-WAVE2-B
-- lock: platform

drop function if exists platform.drill_def__account_roster();
drop function if exists platform.drill_def__cx_requests();
drop function if exists platform.drill_def__system_errors();
