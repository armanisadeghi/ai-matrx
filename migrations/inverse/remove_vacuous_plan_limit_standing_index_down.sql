-- chair-step: restore only the formerly vacuous NULL-period plan-limit index
-- INVERSE of migrations/remove_vacuous_plan_limit_standing_index.sql.
-- The production contract makes billing.plan_limit.period NOT NULL, so this
-- exact prior index remains empty when restored and cannot reject a row.  This
-- inverse does not alter the table, primary key, period contract, or writer.

set local lock_timeout = '2s';

create unique index if not exists plan_limit_standing_idx
  on billing.plan_limit (plan_id, capability)
  where period is null;
