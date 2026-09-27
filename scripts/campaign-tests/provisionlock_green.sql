-- LANE PROVISION-LOCK — A TABLE BUILD NEVER MAKES SIGN-IN WAIT.
--
-- THE REAL CASE: Harbor Point Dental Studio's front desk asks for a "Hygiene recall visits" table
-- (patients due back for a cleaning, and whether the visit is booked). That is one
-- platform.provision call through aidream's lane B, then the settle calls, each in its own
-- transaction (services/provisioning/service.py: provision -> _settle_base_contract).
--
-- WHY: Supabase's supautils (policy_grants / drop_trigger_grants, keyed on role postgres) takes
-- ACCESS EXCLUSIVE on auth.users, auth.sessions, auth.refresh_tokens, storage.objects and 19 more
-- for every CREATE/ALTER/DROP POLICY and DROP TRIGGER, held to COMMIT. The build used to issue
-- them mid-transaction (`drop trigger if exists _guard_governance`, the generator's policies, the
-- admin-read event trigger's policy), so a build either froze sign-in for the rest of its work or,
-- with auth.users busy, waited for the lock with sign-in queued behind it and timed out
-- (four production builds, 2026-09-27).
--
--   T1  the build, as admin@admin.com: ok; base_contract.access_seal = pending; and THE FORCING
--       CLAUSE — at the end of the build transaction this backend holds NO lock on any relation in
--       supautils.policy_grants. RED on the old bodies: 23 ACCESS EXCLUSIVE locks.
--   T2  platform.provision_attach_base_contract in its own transaction: access_seal sealed, the
--       generated policies and platform_admin_read exist, FKs added.
--   T3  platform.provision_validate_base_contract in its own transaction: certified true.
--   T4  the disposable table is RETIRED (soft; never dropped).
--
-- RUN IT (the sandbox must be disabled for psql):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/provisionlock_green.sql
--   psql "<production>" -v ON_ERROR_STOP=1 -v expect=main -f scripts/campaign-tests/provisionlock_green.sql
-- Under load, measure sign-in with the harness recorded in
-- common-docs/projects/data-doctrine-adoption/v5/PROGRESS-PROVISION-LOCK.md.

\set ON_ERROR_STOP on
\timing off

\set suite 'provisionlock_green.sql'
\if :{?expect}
\else
\set expect 'clone'
\endif
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

select substr(md5(clock_timestamp()::text || random()::text), 1, 6) as run,
       (select id::text from auth.users where email = 'admin@admin.com') as admin_id \gset
select 'pl_recall_visits_' || :'run' as tok, 'workbench.pl_recall_visits_' || :'run' as rel \gset
\echo run :run as admin@admin.com :admin_id -> :rel

-- ── T1: the build ────────────────────────────────────────────────────────────────────────────
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';
select set_config('request.jwt.claims', json_build_object('sub', :'admin_id', 'role', 'authenticated', 'email', 'admin@admin.com')::text, true) \g /dev/null
create or replace function pg_temp.pl_try(p jsonb) returns jsonb language plpgsql as $$
begin
  return platform.provision(p, 'runner');
exception when others then
  return jsonb_build_object('error', sqlstate || ': ' || sqlerrm);
end $$;
select pg_temp.pl_try(jsonb_build_object(
    'schema', 'workbench', 'table', :'tok', 'token', :'tok',
    'origin', 'standard', 'type', 'entity', 'sharing', false,
    'label', 'Hygiene recall visits', 'description', 'Patients due back for a cleaning at Harbor Point Dental, and whether the visit is booked.',
    'category_label', 'Dental practice',
    'taxonomy_node_id', (select id::text from platform.taxonomy_node order by slug limit 1),
    'access', jsonb_build_object('data_class', 'organization', 'data_class_reason', 'recall visits belong to the practice',
                                 'default_list_scope', 'organization', 'visibility', 'internal', 'key_column', 'created_by'),
    'fields', jsonb_build_array(
      jsonb_build_object('name', 'patient_ref', 'type', 'text', 'not_null', true),
      jsonb_build_object('name', 'due_on', 'type', 'date'),
      jsonb_build_object('name', 'booked', 'type', 'boolean'))))::text as t1 \gset
select count(*) as t1_hook_locks,
       count(*) filter (where l.relation = 'auth.users'::regclass) as t1_users_locks,
       coalesce(string_agg(distinct l.mode, ','), '-') as t1_modes
  from pg_locks l
 where l.pid = pg_backend_pid() and l.locktype = 'relation'
   and l.relation in (select to_regclass(t) from jsonb_array_elements_text(
         coalesce(nullif(current_setting('supautils.policy_grants', true), ''), '{}')::jsonb -> 'postgres') t) \gset
select ((:'t1'::jsonb->>'ok')::boolean is true and :t1_hook_locks = 0
        and :'t1'::jsonb->'base_contract'->>'access_seal' = 'pending') as t1_ok \gset
\if :t1_ok
drop function pg_temp.pl_try(jsonb);
commit;
\echo 'T1 PASSED — built; access_seal pending; the build transaction held 0 locks on the supautils sign-in set at its end'
\else
rollback;
\echo 'T1 RED — hook locks held at the end of the build:' :t1_hook_locks '(auth.users:' :t1_users_locks ', modes' :t1_modes ') answer:'
select left(:'t1', 900) as t1_answer;
do $f$ begin raise exception 'provisionlock_green: T1 FAILED (see above); nothing was built'; end $f$;
\endif

-- ── T2: the access seal + base contract, its own transaction ─────────────────────────────────
begin;
set local statement_timeout = '15s';
set local lock_timeout = '5s';
select clock_timestamp() as t2_start \gset
select platform.provision_attach_base_contract(:'rel')::text as a1 \gset
select (select count(*) from pg_locks l where l.pid = pg_backend_pid() and l.relation = 'auth.users'::regclass and l.mode = 'AccessExclusiveLock') as t2_users_ae \gset
commit;
select clock_timestamp() as t2_end \gset
select coalesce(string_agg(problem, E'\n  - '), '') as t2_problems from (
  select 'attach answer: ' || left(:'a1', 400) as problem where (:'a1'::jsonb->>'ok')::boolean is not true
  union all
  select 'access_seal: ' || coalesce(:'a1'::jsonb->'access_seal'->>'status', 'absent') where :'a1'::jsonb->'access_seal'->>'status' is distinct from 'sealed'
  union all
  select 'policy missing: ' || p from unnest(array['std_select','std_insert','std_update','std_delete','platform_admin_read','svc_all']) p
   where not exists (select 1 from pg_policy where polrelid = (:'rel')::regclass and polname = p)
  union all
  select 'governance guard missing' where not exists (select 1 from pg_trigger where tgrelid = (:'rel')::regclass and tgname = '_guard_governance')
) q \gset
select (:'t2_problems' <> '') as t2_bad \gset
\if :t2_bad
\echo 'T2 FAILED:' :t2_problems
do $f$ begin raise exception 'provisionlock_green: T2 FAILED (see the line above)'; end $f$;
\endif
select round(extract(epoch from (:'t2_end'::timestamptz - (:'a1'::jsonb->'access_seal'->>'sign_in_paused_from')::timestamptz)) * 1000) as paused_ms_upper,
       (:'a1'::jsonb->'access_seal'->'policies')::text as t2_policies \gset
\echo 'T2 PASSED — sealed: policies' :t2_policies '; pause tail (end of seal to commit, incl. client round trip):' :paused_ms_upper 'ms'

-- ── T3: validate + certify, its own transaction ─────────────────────────────────────────────
begin; select platform.provision_validate_base_contract(:'rel')::text as v1 \gset
commit;
select ((:'v1'::jsonb->>'certified')::boolean is true) as t3_ok \gset
\if :t3_ok
\echo 'T3 PASSED — validated and certified'
\else
\echo 'T3 FAILED — validate answered' :v1
select c.* from iam.canonical_certify('workbench', :'tok', :'tok') c where c.status in ('FAIL','WARN');
do $f$ begin raise exception 'provisionlock_green: T3 FAILED (see above)'; end $f$;
\endif

-- ── T4: retire the disposable table (soft; never dropped) ───────────────────────────────────
begin;
set local lock_timeout = '20s';
update platform.entity_types
   set is_active = false,
       type = 'deprecated',
       custom_fields_enabled = false,
       notes = coalesce(notes || E'\n', '') || 'Retired ' || now()::date || ' by lane PROVISION-LOCK: a disposable table built by scripts/campaign-tests/provisionlock_green.sql to prove a table build never makes sign-in wait. Soft-retired, never dropped.'
 where token = :'tok';
select count(*) as retired from platform.entity_types where token = :'tok' and not is_active \gset
commit;
\echo 'T4 retired' :retired 'disposable table:' :rel
\echo 'ALL PASSED — provisionlock_green.sql'
