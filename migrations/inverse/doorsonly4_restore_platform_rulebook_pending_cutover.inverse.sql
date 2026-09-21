-- lane: DOORS-ONLY-4
-- chair-step: `select iam.apply_rls(...)` is the canonical route; the additive allow-list cannot
-- read the DDL a spec-driven builder executes. Nothing is hand-written here.
--
-- INVERSE — re-runs the same canonical route; see the campaign file. RESTORE platform.rulebook's CLIENT WRITE LANES, through the generator that now KNOWS its doors are
-- not built yet.
--
-- WHAT HAPPENED. Declaring `platform` doors-only closed every table in the schema on
-- regeneration, including this one -- one of the three MANY-WRITER tables DOORS-ONLY-3
-- deliberately left open because its callers have nowhere else to go yet. Its write grants and
-- its std_insert/std_update/std_delete policies went away with the callers still pointing at the
-- base table, and the feature answered 42501.
--
-- THE FIX IS NOT A GRANT. doorsonly4_a_table_whose_doors_are_not_built_says_so.sql put a row in
-- platform.doors_only_pending_cutover with the reason and the owning lane, and taught both
-- generator functions to read it and ANNOUNCE it on every run. So running the canonical route
-- again restores exactly what the generator would have produced before the schema was declared
-- -- and keeps producing it until the door exists and the row is deleted in the same commit that
-- moves the callers. A hand-issued GRANT would have lasted until the next platform.provision.
--
-- Inverse: migrations/inverse/doorsonly4_restore_platform_rulebook_pending_cutover.inverse.sql
set lock_timeout = '2s';
set statement_timeout = '600s';

select iam.apply_rls('platform', 'rulebook', 'rulebook', 'entity');
