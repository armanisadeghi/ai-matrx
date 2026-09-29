-- LANE STORE-READ-PERF-4 — THE MEMO PATH ANSWERS EXACTLY WHAT THE NO-MEMO PATH ANSWERS.
-- Run on the dev clone with migrations/campaign/storereadperf4_the_scope_tree_and_the_data_home_ask_shared_answers.sql
-- LIVE. One REPEATABLE READ transaction, so both halves read one snapshot:
--   half 1 — the transaction has written nothing, so every statement memo is ON: each door is asked
--            once per statement from each seat and a digest of its answer kept (in psql variables and
--            transaction-local settings only — nothing is written);
--   then one row is written to a temporary table, which assigns the transaction id and turns every
--   memo OFF;
--   half 2 — the same doors, the same seats, the same snapshot, no memo. Every digest must match.
-- Doors: custom.data_home, custom.context_tree, custom.context_items, custom.context_values,
-- custom.data_home_tables, custom.data_home_items, custom.data_home_changed_by, and
-- custom.query_visible_ids(org, Table kernel) for every organization (each its own statement inside
-- a DO block, the refusal kept as the answer).
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storereadperf4_memo.sql
\set ON_ERROR_STOP on
\set QUIET on
\set suite 'storereadperf4_memo.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
select exists (select 1 from pg_proc where oid = 'custom.carrying_edges_in'::regproc and prosrc ~ 'STORE-READ-PERF-4') as live \gset
\if :live
\else
\echo 'SKIPPED: the file is not live on this database (this suite proves its memo path)'
\quit
\endif
begin isolation level repeatable read;
set local statement_timeout = 0;
set local transaction_timeout = 0;

select id as admin_id from auth.users where email = 'admin@admin.com' \gset
select id as member_id from auth.users where email = 'test@test.com' \gset

\set phase on
\ir storereadperf4_memo_half.sql
select pg_current_xact_id_if_assigned() is null as memo_was_on \gset

create temp table memo_off (i int);
insert into memo_off values (1);
select pg_current_xact_id_if_assigned() is not null as memo_is_off \gset

\set phase off
\ir storereadperf4_memo_half.sql

select current_setting('perf4.on_admin') as on_admin, current_setting('perf4.off_admin') as off_admin,
       current_setting('perf4.on_member') as on_member, current_setting('perf4.off_member') as off_member \gset
select :'on_admin' = :'off_admin' as admin_same, :'on_member' = :'off_member' as member_same \gset
\echo 'memo on for half 1:' :memo_was_on ' memo off for half 2:' :memo_is_off
\echo 'admin@admin.com digests equal:' :admin_same '  test@test.com digests equal:' :member_same
\echo 'admin on ' :on_admin
\echo 'admin off' :off_admin
\echo 'member on ' :on_member
\echo 'member off' :off_member
rollback;
select :'memo_was_on'::boolean and :'memo_is_off'::boolean and :'admin_same'::boolean and :'member_same'::boolean as all_green \gset
\if :all_green
\echo 'GREEN'
\else
\echo 'RED'
select 1 / 0 as red;
\endif
