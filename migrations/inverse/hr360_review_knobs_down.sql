-- inverse of migrations/campaign/hr360_review_knobs.sql (lane HR-360)
delete from platform.feature_knob
 where feature = 'hr.performance'
   and key in ('review_360_days_to_complete', 'review_360_reminder_lead_days');
