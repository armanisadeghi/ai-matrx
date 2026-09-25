-- target: branch
--
-- THE INVERSE of `migrations/campaign/w1_prov_closed_level_platform_work_claim.sql`: it drops
-- the levelled table, returning the branch to the state in which production held an object the
-- branch lacked. RUN on the branch 2026-09-17 and the up re-applied afterwards (rule 27).
-- `-- target: branch`: it DROPs, and rule 9 forbids that on production — where the table is the
-- real one and must never be dropped by this campaign at all.

set lock_timeout = '2s';
set statement_timeout = '600s';

drop table if exists platform._work_claim;
