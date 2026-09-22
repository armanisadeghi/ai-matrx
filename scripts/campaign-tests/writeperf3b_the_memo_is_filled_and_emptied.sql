-- LANE WRITE-PERF-3 — CLAUSE 7, SPLIT OUT: THE MEMO IS REALLY FILLED AND REALLY EMPTIED.
--
-- WHY IT IS ITS OWN FILE (SUITES-TIDY, 2026-09-22). It was clause 7 of
-- `writeperf3b_guards_still_fire.sql`, the clause that keeps clause 6 from being vacuous: a
-- write fills the declared-key and relation-field memos, and declaring a column empties them.
-- It reads the slots directly, and `platform.memo_k_get` did not exist on the database this was
-- measured against: the nightly dev clone, taken before lane WRITE-PERF-4 applied
-- `migrations/campaign/writeperf4_a_fact_about_the_table_is_read_once.sql` to the MAIN database
-- at 08:40 UTC on 2026-09-22. On the clone the answer was `function platform.memo_k_get(text)
-- does not exist` and the live `custom.undeclared_keys` there read no memo at all; on main, since
-- that apply, both memo readers exist and this file asserts rather than skips. That is exactly
-- the point of declaring the dependency instead of hard-coding either answer.
--
-- One clause about an unshipped optimisation was taking a five-clause guard suite down with it.
-- Here it DECLARES what it needs, so it asserts on a database that has the memo lane and SKIPS
-- BY NAME on one that does not — which the preamble prints as "this is NOT a pass" — and lights
-- up on its own the day the lane lands.
--
-- WHAT MAKES IT FAIL: take the memo out of `custom.undeclared_keys` or
-- `custom.record_relation_edges`, or remove `custom.record`'s BEFORE-ROW `_aa_memo_clear` so a
-- declaration no longer empties what a write filled.
--
--   "$PSQL" "$DSN" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/writeperf3b_the_memo_is_filled_and_emptied.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'writeperf3b_the_memo_is_filled_and_emptied.sql'
\set requires 'function:platform.memo_k_get|function:platform.memo_s_get'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;

do $t$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  v_org   uuid := gen_random_uuid();
  v_home  uuid;
  v_tbl   uuid;
begin
  perform set_config('app.actor_system', 'campaign-test/writeperf3b_memo', true);
  insert into iam.organizations (id, name, slug, abbreviation, created_by)
  values (v_org, 'Nagle Auto Glass', 'nagle-auto-glass-memo-' || left(replace(v_org::text,'-',''), 10), 'NAG', c_admin);
  insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status)
  values (v_org, 'organization', v_org, c_admin, 'owner', 'active');
  insert into custom.record (organization_id, table_id, data)
  values (v_org, null, jsonb_build_object('name', 'Nagle Auto Glass')) returning id into v_home;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', c_admin::text, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  v_tbl := custom.table_declare(v_org, jsonb_build_object(
    'name','Claims','slug','claims','type','entity','label_singular','Claim','label_plural','Claims',
    'display','list','ordered',false,'weight','light','retention_days',2555,'row_order','sorted',
    'default_sort','[]'::jsonb,'agent_writable',true,'title_field','claim','parent_id',v_home::text,
    'fields', jsonb_build_array(jsonb_build_object('name','claim'))));

  -- AND CLAUSE 6 IS NOT VACUOUS: THE MEMO REALLY IS BEING USED, AND THE DECLARATION REALLY
  -- DOES EMPTY IT. (WRITE-PERF-4 wave 1 moved the declared-key answer out of the shared
  -- `mx_memo.b` blob into its own slot, so this clause reads `platform.memo_k_get`; the relation
  -- Fields still live in `mx_memo.s` and are still read there. Nothing else about the clause
  -- changed, and it still fails if either half stops being true.) Without both halves clause 6 would pass for the wrong reason. So: warm the
  -- memo with a write, prove the key is THERE; declare a column, prove the key is GONE.
  perform custom.record_write(v_org, v_tbl, jsonb_build_object('claim','NAG-2026-90005'));
  if platform.memo_k_get('udk:' || v_org::text || ':' || v_tbl::text) is null then
    raise exception '7 FAILED: a write left no declared-key memo — clause 6 proves nothing';
  end if;
  if platform.memo_s_get('rre:' || v_org::text || ':' || v_tbl::text) is null then
    raise exception '7 FAILED: a write left no relation-field memo — clause 6 proves nothing';
  end if;
  perform custom.field_declare(v_org, v_tbl,
    jsonb_build_object('label','Deductible','key','deductible','type','currency','unit','USD'));
  if platform.memo_k_get('udk:' || v_org::text || ':' || v_tbl::text) is not null
     or platform.memo_s_get('rre:' || v_org::text || ':' || v_tbl::text) is not null then
    raise exception '7 FAILED: declaring a column did NOT empty the memo — a stale answer is reachable';
  end if;
  v_hit := v_hit + 1;
  raise notice '7 THE MEMO IS REALLY FILLED BY A WRITE AND REALLY EMPTIED BY A DECLARATION.';

  raise notice 'ALL CLAUSES PASSED';
end $t$;

rollback;
