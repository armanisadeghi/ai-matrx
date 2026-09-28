-- chair-step: remove the impossible NULL-period plan-limit uniqueness index
--
-- billing.plan_limit.period is NOT NULL and is part of the primary key
-- (plan_id, capability, period).  Therefore this partial index's predicate is
-- impossible and its census is zero rows: it can never arbitrate a standing
-- quota or any other write.  Remove only this dead index; do not change the
-- table, primary key, period contract, or the useful metered-row revival writer.

set local lock_timeout = '2s';

drop index if exists billing.plan_limit_standing_idx;
