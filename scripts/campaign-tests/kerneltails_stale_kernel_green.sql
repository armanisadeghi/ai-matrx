-- LANE KERNEL-TAILS — A STALE ACCESS-KERNEL FINGERPRINT IS REFUSED WITH A LOGGED ROW.
--
-- THE REAL CASE: a campaign file changes a fingerprinted kernel body (here public.library_is_open,
-- the member census 16's self-test plants) and forgets to re-record iam.entity_read_kernel_expected().
-- Until someone notices, every table a person or agent asks for is refused. On 2026-09-25 that
-- happened twice (SHARE-LANE-2 20:38Z, 26 min; rca2b 21:51Z, 57 min) and left no trace, because
-- the refusal was a raise that rolled back with the caller.
--   K1  the plant makes the preflight refuse with preflight.read_kernel.
--   K2  platform.provision (lane A) of a clinic's "Boarding kennel log" RETURNS the refusal
--       (ok false, refused true, a system_error id) and exactly ONE ops.system_error row of kind
--       provisioner_fingerprint_stale exists for it, naming the moved body and the remedy.
--   K3  platform.provision_restricted (lane B) of "Vaccination reminders" adds exactly one more.
--   K4  a batch (two tables in one call) adds exactly one more: one row per refused SPEC.
--   K5  nothing was provisioned: no relation, no provision_spec row, no entity_types row.
--   K6  with the plant undone the preflight passes, and every OTHER refusal still RAISES exactly as
--       before (this deliberately thin declaration is refused by the validator) with no row written.
--
-- RUN IT (clone; one rolled-back transaction; the psql -f needs the sandbox disabled):
--   psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/kerneltails_stale_kernel_green.sql
-- ITS RED: before kerneltails_a_stale_kernel_refusal_is_a_logged_row.sql (and after its inverse)
-- K2 fails: the call raised PREFLIGHT REFUSED and no row survived.

\set ON_ERROR_STOP on
\timing off

\set suite 'kerneltails_stale_kernel_green.sql'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '120s';
set local lock_timeout = '20s';

-- The three declarations (no temp table: CREATE TEMP TABLE fires the provision shape guard, which
-- waits on other lanes' DDL; custom GUCs carry them instead).
select set_config('kt.one',   '{"schema":"workbench","table":"kt_boarding_kennel_log","token":"kt_boarding_kennel_log","label":"Boarding kennel log","type":"entity","origin":"standard","fields":[{"name":"pet_name","type":"text"},{"name":"kennel","type":"text"}]}', true),
       set_config('kt.two',   '{"schema":"workbench","table":"kt_vaccination_reminders","token":"kt_vaccination_reminders","label":"Vaccination reminders","type":"entity","origin":"standard","fields":[{"name":"due_on","type":"date"}]}', true),
       set_config('kt.batch', '{"tables":[{"schema":"workbench","table":"kt_surgery_schedule","token":"kt_surgery_schedule","label":"Surgery schedule","type":"entity","origin":"standard"},{"schema":"workbench","table":"kt_surgery_notes","token":"kt_surgery_notes","label":"Surgery notes","type":"entity","origin":"standard"}]}', true) \gset

-- K1: the plant (the exact shape of a lane that replaces a kernel body and re-records nothing).
do $plant$
declare v_def text; v_src text;
begin
  select pg_get_functiondef(p.oid), p.prosrc into v_def, v_src
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'library_is_open' limit 1;
  execute replace(v_def, v_src, v_src || E'\n  -- planted by kerneltails_stale_kernel_green');
  if not exists (select 1 from jsonb_array_elements((platform.provision_preflight())->'findings') x
                  where x->>'rule_id' = 'preflight.read_kernel') then
    raise exception 'K1 FAILED — the plant did not make the preflight refuse with preflight.read_kernel';
  end if;
  raise notice 'K1 PASSED — a kernel body moved without a re-record; the preflight refuses';
end $plant$;

do $k2$
declare r jsonb; e text; n int;
begin
  begin
    r := platform.provision(current_setting('kt.one')::jsonb, 'runner');
  exception when others then e := sqlstate || ': ' || left(sqlerrm, 160);
  end;
  select count(*) into n from ops.system_error where kind = 'provisioner_fingerprint_stale' and occurred_at = now();
  if e is not null or n <> 1 or coalesce((r->>'refused')::boolean, false) is not true
     or (r->>'ok')::boolean is distinct from false or r->>'system_error_id' is null then
    raise exception 'K2 FAILED — lane A: raised=% rows=% answer=%', e, n, left(coalesce(r::text, 'null'), 200);
  end if;
  if not exists (select 1 from ops.system_error s where s.id = (r->>'system_error_id')::uuid
                  and s.context->'moved' ? 'public.library_is_open(p_entity_type text, p_entity_id uuid)'
                  and s.error_text like '%workbench.kt_boarding_kennel_log%'
                  and s.error_text like '%public.library_is_open%'
                  and s.error_text like '%Remedy:%entity_read_kernel_expected%') then
    raise exception 'K2 FAILED — the row does not name the moved body, the spec and the remedy: %',
      (select left(error_text, 300) from ops.system_error where id = (r->>'system_error_id')::uuid);
  end if;
  raise notice 'K2 PASSED — lane A returned the refusal and logged one row naming public.library_is_open and the remedy';
end $k2$;

do $k3$
declare r jsonb; e text; n int;
begin
  begin
    r := platform.provision_restricted(current_setting('kt.two')::jsonb,
                                       (select organization_id from iam.system_orgs where key = 'system'));
  exception when others then e := sqlstate || ': ' || left(sqlerrm, 160);
  end;
  select count(*) into n from ops.system_error where kind = 'provisioner_fingerprint_stale' and occurred_at = now();
  if e is not null or n <> 2 or (r->>'refused')::boolean is not true then
    raise exception 'K3 FAILED — lane B: raised=% rows=% answer=%', e, n, left(coalesce(r::text, 'null'), 200);
  end if;
  raise notice 'K3 PASSED — lane B (provision_restricted) logged exactly one more row';
end $k3$;

do $k4$
declare r jsonb; e text; n int;
begin
  begin
    r := platform.provision(current_setting('kt.batch')::jsonb, 'runner');
  exception when others then e := sqlstate || ': ' || left(sqlerrm, 160);
  end;
  select count(*) into n from ops.system_error where kind = 'provisioner_fingerprint_stale' and occurred_at = now();
  if e is not null or n <> 3 or (r->>'refused')::boolean is not true
     or r->>'message' not like '%a batch of 2 table(s)%' then
    raise exception 'K4 FAILED — batch: raised=% rows=% answer=%', e, n, left(coalesce(r::text, 'null'), 200);
  end if;
  raise notice 'K4 PASSED — a two-table batch is one refused spec and one row (3 rows for 3 specs)';
end $k4$;

do $k5$
begin
  if exists (select 1 from pg_class c where c.relnamespace = 'workbench'::regnamespace and c.relname like 'kt\_%')
     or exists (select 1 from platform.provision_spec where token like 'kt\_%')
     or exists (select 1 from platform.entity_types where token like 'kt\_%') then
    raise exception 'K5 FAILED — a refused spec left a relation or registry row behind';
  end if;
  raise notice 'K5 PASSED — nothing was provisioned';
end $k5$;

-- K6: undo the plant; the preflight passes; any OTHER refusal still raises and logs nothing.
do $unplant$
declare v_def text; v_src text;
begin
  select pg_get_functiondef(p.oid), p.prosrc into v_def, v_src
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'library_is_open' limit 1;
  execute replace(v_def, v_src, replace(v_src, E'\n  -- planted by kerneltails_stale_kernel_green', ''));
  if not ((platform.provision_preflight())->>'ok')::boolean then
    raise exception 'K6 FAILED — with the plant undone the preflight still refuses: %', platform.provision_preflight();
  end if;
end $unplant$;
do $k6$
declare r jsonb; e text; n int;
begin
  begin
    r := platform.provision(current_setting('kt.one')::jsonb, 'runner');
  exception when others then e := sqlstate || ': ' || left(sqlerrm, 200);
  end;
  select count(*) into n from ops.system_error where kind = 'provisioner_fingerprint_stale' and occurred_at = now();
  if e is null or e not like '%Nothing was written%' or n <> 3 then
    raise exception 'K6 FAILED — a non-kernel preflight finding: raised=% rows=% answer=%', e, n, r;
  end if;
  raise notice 'K6 PASSED — the plant undone, the preflight passes; another refusal still RAISES (%), no row', left(e, 70);
end $k6$;

\echo 'ALL PASSED — kerneltails_stale_kernel_green'
rollback;
