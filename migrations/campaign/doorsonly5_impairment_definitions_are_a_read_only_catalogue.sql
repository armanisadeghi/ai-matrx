-- lane: DOORS-ONLY-5
-- chair-step: `select iam.apply_rls(...)` is a spec-driven builder — the additive allow-list
-- cannot read the DDL it will execute. What it executes is the CANONICAL ROUTE and nothing
-- else: the one function every table in this database gets its policies and grants from.
--
-- `legal.wc_impairment_definition` IS A GLOBAL REFERENCE CATALOGUE AND `authenticated` CAN
-- DELETE IT.
--
-- Confirmed live before this file: `authenticated` holds SELECT, INSERT, UPDATE and DELETE on a
-- **215-row** table of workers'-compensation impairment definitions — the AMA Guides vocabulary
-- a permanent-disability rating is computed against. It carries the full generated write family
-- (`std_insert`, `std_update`, `std_delete`, `platform_admin_all`). Any signed-in user could
-- empty it.
--
-- HANDED OVER TWICE AND NOT FIXED EITHER TIME, for a reason that was correct both times: lane
-- RLS-REFERENCE named the fix, and DOORS-ONLY-4 §9 confirmed it and could not run it because
-- both build locks had moved to a peer. This lane holds `iam` and runs it.
--
-- 🚨 THE FIX IS THE VARIANT / THE FLAG, NOT A POLICY — and that distinction is the whole point.
-- `db-rules` §6d forbids a hand-written policy and `iam.verify_canonical` would report one as
-- drift. The obvious-looking primitive, the `reference` variant lane RLS-REFERENCE built, does
-- NOT fit: its generator refuses `organization_id` and `created_by` BY NAME, and this table
-- carries both. The primitive that does fit is `platform.entity_types.client_read_only`, which
-- makes `iam.apply_table_grants` issue the READ-ONLY client grant and stops
-- `iam._apply_rls_unchecked` emitting the write family at all. One declared flag, then the
-- canonical route.
--
-- NOTHING LOSES A PATH. `dd219_impairment_definitions_registered_for_what_they_are.sql` already
-- established that there is no client `.from('wc_impairment_definition')` write ANYWHERE in the
-- codebase — the table is read through a server-side RPC
-- (`features/legal/wc/pd-ratings/api/hooks.ts`), and the server lane runs as `service_role`,
-- which no `authenticated` policy or grant touches.
--
-- READS SURVIVE, and they survive on TWO lanes, which is why this is safe rather than merely
-- intended: `std_select`'s own platform-staff arm, and `pub_read` — the class is `public`. The
-- exit proof below counts `admin@admin.com`'s visible rows either side and they must be equal.
--
-- Inverse: migrations/inverse/doorsonly5_impairment_definitions_are_a_read_only_catalogue.inverse.sql
-- Guard: `pnpm check:doors-only-schemas` does not cover schema `legal`; the proof is the grant
--        census and the seated read count, both in the exit below.
set lock_timeout = '2s';
set statement_timeout = '600s';

update platform.entity_types
   set client_read_only = true
 where schema_name = 'legal' and table_name = 'wc_impairment_definition';

select iam.apply_rls('legal', 'wc_impairment_definition', 'wc_impairment_definition', 'system');
