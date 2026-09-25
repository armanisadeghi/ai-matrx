-- target: branch
--
-- INVERSE of `migrations/campaign/w1_org_the_legacy_owner_columns_converge.sql`.
--
-- That file creates two functions and changes nothing else: no column, no row, no grant, no
-- trigger. Neither `iam.legacy_column_worklist()` nor
-- `iam.converge_legacy_column(text,text,text,boolean)` existed in the catalogue before it
-- (measured 2026-09-18 on both databases), so the undo is two drops and the databases are
-- byte-identical afterwards.
--
-- Nothing this lane ran CALLED `iam.converge_legacy_column` with `p_execute => true`, so no
-- column anywhere was renamed by it and there is nothing for this file to put back. The
-- conversions themselves are deliberate per-table migrations with their own inverses.
--
-- It is a `-- target: branch` file and can never reach production.

set lock_timeout = '2s';

drop function if exists iam.converge_legacy_column(text, text, text, boolean);
drop function if exists iam.legacy_column_worklist();
