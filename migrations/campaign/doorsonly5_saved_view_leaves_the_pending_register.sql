-- lane: DOORS-ONLY-5
-- chair-step: `select iam.apply_rls(...)` is a spec-driven builder -- the additive allow-list
-- cannot read the DDL it will execute, which is the refusal w1_prov_custom_record_via_the_door.sql
-- records and does not route around. What it executes is the CANONICAL ROUTE and nothing else:
-- the one function every table in this database gets its policies and grants from. Nothing is
-- hand-written.
--
-- THE LAST STEP OF platform.saved_view's CUTOVER, and it is deliberately the last one.
--
-- `platform.doors_only_pending_cutover` is a ladder DOWN and never up: a row can only KEEP what
-- a table already generated, and DELETING it is the step that lets the doors-only declaration
-- finally close the table. DOORS-ONLY-4 built that register after closing this exact table by
-- accident -- for eleven minutes, saving a view answered 42501 with every caller still pointing
-- at the base table -- so the order here is not a formality:
--
--   1. the doors exist and are schema-qualified   (doorsonly5_saved_view_gets_its_doors.sql,
--                                                  doorsonly5_the_saved_view_doors_qualify_their_types.sql)
--   2. every door answered from admin@admin.com's own seat, 6/6
--   3. ALL SEVENTEEN callers, in five files across matrx-frontend and aidream, call the doors
--   4. the named restrictive refusals landed and the seat re-ran 9/9
--   5. ← THIS FILE: the register row goes, and the canonical route withdraws the write GRANTS
--      and stops emitting std_insert / std_update / std_delete
--
-- WHAT THE REGENERATION DOES, read from the generator rather than assumed. `platform` is
-- DECLARED doors-only in platform.schema_client_exposure, so with the pending-cutover row gone
-- `iam._apply_rls_unchecked` stops emitting the client write family and emits the FOR SELECT
-- twin `platform_admin_select` instead, and `iam.apply_table_grants` issues the READ-ONLY client
-- grant and withdraws the column-level write grants BY NAME, asserting the privilege is gone
-- before it returns. (A table-level revoke does not remove a column grant, and
-- `has_any_column_privilege` -- what the guard asks -- still sees one.)
--
--   before  std_select + std_insert/std_update/std_delete + svc_all, the write grants, and this
--           table's named *_client_*_refused restrictive policies
--   after   std_select + svc_all, NO write grant, and the SAME named restrictive policies,
--           untouched -- DD-147: this generator drops only the names in
--           iam.generated_policy_names() and KEEPS everything else.
--
-- The refusal policies stay deliberately. They are the belt to the grant's braces: a future
-- regeneration in a schema somebody un-declares would re-emit the permissive write family, and
-- a RESTRICTIVE policy ANDs with it.
--
-- ONE TABLE PER FILE -- DOORS-ONLY-4's finding, not a preference: batched, one table the
-- generator legitimately refuses takes every healthy table in its transaction down with it.
--
-- 🚨 RE-RUN THE GUARD AND A SEAT PROBE AFTER THIS APPLIES. That instruction is in capitals in
-- PROGRESS-DOORS-ONLY-4 because the eleven-minute outage was caught by re-running the guard
-- rather than by assuming the number would move.
--
-- Inverse: migrations/inverse/doorsonly5_saved_view_leaves_the_pending_register.inverse.sql
set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.doors_only_pending_cutover
 where schema_name = 'platform' and table_name = 'saved_view';

select iam.apply_rls('platform', 'saved_view', 'platform_saved_view', 'entity');
