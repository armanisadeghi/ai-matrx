-- lane: DOORS-ONLY-4
-- chair-step: `select iam.apply_rls(...)` is a spec-driven builder -- the additive allow-list
-- cannot read the DDL it will execute, which is the refusal w1_prov_custom_record_via_the_door.sql
-- records and does not route around. What it executes is the CANONICAL ROUTE and nothing else:
-- the one function every table in this database gets its policies from. Nothing is hand-written.
--
-- REGENERATE platform.feature_knob THROUGH THE CANONICAL ROUTE (system variant, token feature_knob).
--
-- migrations/campaign/doorsonly4_the_generator_stops_emitting_client_writes.sql changed what
-- iam._apply_rls_unchecked EMITS for a schema declared doors-only: no std_insert / std_update /
-- std_delete, and platform_admin_all's predicate emitted FOR SELECT as platform_admin_select.
-- A generator change moves nothing on its own -- a live table keeps the policies of the day it
-- was last generated -- and hand-written DROP POLICY files would not survive the next
-- platform.provision. This is the state that does.
--
--   before  platform_admin_all + std_select + std_insert/std_update/std_delete (+ pub_read where
--           the class grants it) + svc_all, plus this table's named *_client_*_refused
--           restrictive policies
--   after   platform_admin_select + std_select (+ pub_read) + svc_all, plus the SAME named
--           restrictive policies, untouched -- DD-147: this generator drops only the names in
--           iam.generated_policy_names() and KEEPS everything else.
--
-- Reads do not move: platform_admin_select's USING is byte-identical to the USING half of the
-- platform_admin_all it replaces, and std_select is regenerated from the same kernel.
-- Proved per table, from admin@admin.com's own seat, before and after:
-- scripts/campaign-tests/doorsonly4_platform_admin_reads_do_not_move.sql.
--
-- ONE TABLE PER FILE, and that is a finding rather than a preference: batched eight to a
-- transaction, ONE table that the generator legitimately REFUSES (an undeclared column-grant
-- design; a class/grant contradiction; a missing base column) took seven healthy tables down
-- with it, and one hot table's lock timeout took another seven. A short lock on one table,
-- retried on its own, is also the only shape that respects a live database at 3 p.m.
--
-- Inverse: migrations/inverse/doorsonly4_regen_platform_feature_knob.inverse.sql
set lock_timeout = '2s';
set statement_timeout = '600s';

select iam.apply_rls('platform', 'feature_knob', 'feature_knob', 'system');
