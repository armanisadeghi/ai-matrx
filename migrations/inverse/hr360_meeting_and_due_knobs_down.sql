-- chair-step: inverse of migrations/campaign/hr360_meeting_and_due_knobs.sql (lane HR-360) — removes the five hr.performance knobs.
delete from platform.feature_knob where feature = 'hr.performance'
   and key in ('review_360_meeting_hour','review_360_meeting_minutes','review_360_meeting_lobby','review_360_meeting_join_before_host','review_360_due_hour_utc');
