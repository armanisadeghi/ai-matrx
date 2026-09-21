-- lane: DOORS-ONLY-5
-- chair-step: `select iam.apply_rls(...)` is a spec-driven builder -- the additive allow-list
-- cannot read the DDL it will execute. What it executes is the CANONICAL ROUTE and nothing
-- else: the one function every table in this database gets its policies and grants from.
--
-- THE LAST STEP OF platform.rulebook's CUTOVER, and deliberately the last one.
--
-- `platform.doors_only_pending_cutover` is a ladder DOWN and never up: a row can only KEEP what
-- a table already generated, and DELETING it is the step that lets the doors-only declaration
-- finally close the table. DOORS-ONLY-4 built that register after closing this exact table by
-- accident -- for eleven minutes, editing a Masterwork rulebook answered 42501 with every
-- caller still pointing at the base table -- so the order here is not a formality:
--
--   1. the five doors exist and are schema-qualified
--   2. every door answered from admin@admin.com's own seat, 7/7 -- including the metadata
--      whitelist refusing `coherence` by name, the merge keeping `intake` across a
--      `capture_plan` write, the CAS returning NULL on a stale version having written nothing,
--      and rulebook_tension_settle keeping a sibling key of the coherence block
--   3. ALL NINE callers, in five files, call the doors; 128/128 masterwork suites green
--   4. the named restrictive refusals landed
--   5. <- THIS FILE: the register row goes, and the canonical route withdraws the write GRANTS
--      and stops emitting std_insert / std_update / std_delete
--
--   before  platform_admin_all + std_select + std_insert/std_update/std_delete + svc_all, the
--           write grants, and this table's named *_client_*_refused restrictive policies
--   after   platform_admin_select + std_select + svc_all, NO write grant, and the SAME named
--           restrictive policies, untouched -- DD-147: this generator drops only the names in
--           iam.generated_policy_names() and KEEPS everything else.
--
-- Reads do not move: `platform_admin_select`'s USING is byte-identical to the USING half of the
-- `platform_admin_all` it replaces, and `std_select` is regenerated from the same kernel.
--
-- 🚨 RE-RUN THE GUARD AND A SEAT PROBE AFTER THIS APPLIES -- that instruction is in capitals in
-- PROGRESS-DOORS-ONLY-4 because the eleven-minute outage was caught by re-running the guard
-- rather than by assuming the number would move.
--
-- Inverse: migrations/inverse/doorsonly5_rulebook_leaves_the_pending_register.inverse.sql
set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.doors_only_pending_cutover
 where schema_name = 'platform' and table_name = 'rulebook';

select iam.apply_rls('platform', 'rulebook', 'rulebook', 'entity');
