-- lane: DOORS-ONLY-5
-- chair-step: a DELETE in a header-less file is refused by name, and rightly -- the runner
-- cannot tell a register row from a customer's data. This removes ONE row from
-- platform.doors_only_pending_cutover, the campaign's own bookkeeping table, whose whole
-- purpose is to be deleted when a cutover finishes. The row's exact contents and the reason
-- it is being removed are in the header below, and its inverse puts it back.
-- THE LAST STEP OF platform.categories' CUTOVER — AND IT IS THE ONLY ONE OF THE THREE THAT
-- CANNOT END IN A REGENERATION.
--
-- `saved_view` and `rulebook` finished by deleting their `platform.doors_only_pending_cutover`
-- row and re-running the canonical route, which — in a DECLARED doors-only schema — withdraws
-- the client write grants itself through `iam.apply_table_grants`. That is why both cost ZERO
-- residual.
--
-- 🚨 `iam.apply_rls` REFUSES THIS TABLE BY NAME. DD-249 / R12: `platform.categories` holds 355
-- rows marked `visibility = 'public'` AND grants `anon` SELECT, while its class `organization`
-- emits no anonymous lane — so the generator refuses rather than silently dropping the
-- `pub_read` lane those readers are using. Re-running it here would raise, and ROUTING AROUND
-- IT IS THE ONE THING THIS CAMPAIGN DOES NOT DO. Which of the three legal fixes that blocker
-- takes is an access-semantics decision about who may read 355 rows, and it is not a lane's to
-- take in passing.
--
-- So this file does the HALF that is this lane's: the register row goes, because the debt it
-- records is paid — `public.cat_write` and `public.cat_archive` exist, both answered from
-- admin@admin.com's seat (8/8 before the closure, 11/11 after, including the signed-out read
-- still answering 355 rows), and all thirteen client write call sites call them. Deleting the
-- row is also what makes the closure COMPLETE ITSELF the day R12 is settled: the next
-- successful regeneration of this table will withdraw the grants with no further decision,
-- because nothing is left telling the generator to keep them.
--
-- The write GRANTS are the other half, and they are a CHAIR STEP, written unrun as
-- migrations/campaign/chairstep_doorsonly5_revoke_categories_client_writes.sql.
--
-- Inverse: migrations/inverse/doorsonly5_categories_leaves_the_pending_register.inverse.sql
set local lock_timeout = '2s';

delete from platform.doors_only_pending_cutover
 where schema_name = 'platform' and table_name = 'categories';
