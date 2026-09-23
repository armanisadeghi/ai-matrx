-- LANE STORE-TXN-4 — THE refusal_only DOOR CLASS, THE RED TWIN. Every arm ends in ROLLBACK.
--
-- WHAT IT PROVES. The word `refusal_only` excuses a door from the one ladder, so if it could be
-- worn by a body that DOES something it would be a permission slip. Each arm declares a
-- refusal_only door over a SECURITY DEFINER body that does one thing besides refuse, and passes
-- only when the live guard `platform.door_body_must_decide` REFUSES the declaration with
-- `ddl_guard[refusal_only_door_does_something]`. Run against a database without STORE-TXN-4b,
-- every arm fails, which is what makes it a twin.
--
--   1  the body READS custom.record before it raises       (the brief's own RED case)
--   2  the body PERFORMs a call before it raises
--   3  the body raises only on a branch — `if … then raise`
--   4  CONTROL: the same declaration WITHOUT the word is refused by the OLD arm
--      (definer_no_access_decision), so arm 1's refusal is the new arm and not an accident
--
-- (The release-time half — census 18 of `pnpm check:store-doors-decide` naming a refusal_only
-- door whose body has grown a read, and censuses 1 and 5 withdrawing its exemption — is proved
-- by `pnpm check:store-doors-decide:self-test`.)
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/refusalonly_red.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'refusalonly_red.sql'
\set requires 'function:platform.door_body_is_refusal_only'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\echo ''
\echo '── 1 · a refusal_only door that READS a table is refused ──────────────────────────────'
begin;
create function custom.txn4_red_reads_a_table(p_organization_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog' as $b$
declare n int;
begin
  select count(*) into n from custom.record where organization_id = p_organization_id;
  raise exception 'Nothing happens here.';
end;
$b$;
do $$
declare v_msg text;
begin
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     signed_in_callers, anonymous_callers, refusal_only)
  values ('custom', 'txn4_red_reads_a_table', 'p_organization_id uuid',
          array['uuid']::regtype[]::oid[], 'refusalonly_red arm 1', 'scripts/campaign-tests/refusalonly_red.sql',
          true, false, true);
  -- the guard is a DEFERRED constraint trigger: force it here rather than at COMMIT
  set constraints all immediate;
  raise exception 'ARM 1 FAILED: a refusal_only door that reads custom.record was DECLARED. The word is a permission slip.';
exception when others then
  get stacked diagnostics v_msg = message_text;
  if v_msg like 'ARM 1 FAILED%' then raise; end if;
  if v_msg not like 'ddl_guard[refusal_only_door_does_something]%' then
    raise exception 'ARM 1 FAILED: refused, but not by the refusal_only arm — %', v_msg;
  end if;
  raise notice 'ARM 1 RED — %', left(v_msg, 220);
end $$;
rollback;

\echo ''
\echo '── 2 · a refusal_only door that PERFORMs before it raises is refused ──────────────────'
begin;
create function custom.txn4_red_performs(p_organization_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog' as $b$
begin
  perform pg_catalog.now();
  raise exception 'Nothing happens here.';
end;
$b$;
do $$
declare v_msg text;
begin
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     signed_in_callers, anonymous_callers, refusal_only)
  values ('custom', 'txn4_red_performs', 'p_organization_id uuid',
          array['uuid']::regtype[]::oid[], 'refusalonly_red arm 2', 'scripts/campaign-tests/refusalonly_red.sql',
          true, false, true);
  -- the guard is a DEFERRED constraint trigger: force it here rather than at COMMIT
  set constraints all immediate;
  raise exception 'ARM 2 FAILED: a refusal_only door that calls something first was DECLARED.';
exception when others then
  get stacked diagnostics v_msg = message_text;
  if v_msg like 'ARM 2 FAILED%' then raise; end if;
  if v_msg not like 'ddl_guard[refusal_only_door_does_something]%' then
    raise exception 'ARM 2 FAILED: refused, but not by the refusal_only arm — %', v_msg;
  end if;
  raise notice 'ARM 2 RED — %', left(v_msg, 220);
end $$;
rollback;

\echo ''
\echo '── 3 · a refusal_only door that raises only on a BRANCH is refused ────────────────────'
begin;
create function custom.txn4_red_branches(p_organization_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog' as $b$
begin
  if p_organization_id is not null then
    raise exception 'Nothing happens here.';
  end if;
end;
$b$;
do $$
declare v_msg text;
begin
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     signed_in_callers, anonymous_callers, refusal_only)
  values ('custom', 'txn4_red_branches', 'p_organization_id uuid',
          array['uuid']::regtype[]::oid[], 'refusalonly_red arm 3', 'scripts/campaign-tests/refusalonly_red.sql',
          true, false, true);
  -- the guard is a DEFERRED constraint trigger: force it here rather than at COMMIT
  set constraints all immediate;
  raise exception 'ARM 3 FAILED: a refusal_only door that returns normally on one branch was DECLARED.';
exception when others then
  get stacked diagnostics v_msg = message_text;
  if v_msg like 'ARM 3 FAILED%' then raise; end if;
  if v_msg not like 'ddl_guard[refusal_only_door_does_something]%' then
    raise exception 'ARM 3 FAILED: refused, but not by the refusal_only arm — %', v_msg;
  end if;
  raise notice 'ARM 3 RED — %', left(v_msg, 220);
end $$;
rollback;

\echo ''
\echo '── 4 · CONTROL: the same body WITHOUT the word is refused by the old arm ──────────────'
begin;
create function custom.txn4_red_reads_a_table(p_organization_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog' as $b$
declare n int;
begin
  select count(*) into n from custom.record where organization_id = p_organization_id;
  raise exception 'Nothing happens here.';
end;
$b$;
do $$
declare v_msg text;
begin
  insert into platform.client_callable_door
    (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
     signed_in_callers, anonymous_callers, refusal_only)
  values ('custom', 'txn4_red_reads_a_table', 'p_organization_id uuid',
          array['uuid']::regtype[]::oid[], 'refusalonly_red arm 4', 'scripts/campaign-tests/refusalonly_red.sql',
          true, false, false);
  set constraints all immediate;
  raise exception 'ARM 4 FAILED: a definer door that decides nothing was DECLARED without the word.';
exception when others then
  get stacked diagnostics v_msg = message_text;
  if v_msg like 'ARM 4 FAILED%' then raise; end if;
  if v_msg not like 'ddl_guard[definer_no_access_decision]%' then
    raise exception 'ARM 4 FAILED: refused, but not by the definer_no_access_decision arm — %', v_msg;
  end if;
  raise notice 'ARM 4 RED (control) — %', left(v_msg, 160);
end $$;
rollback;

\echo ''
\echo 'refusalonly_red: every false refusal_only declaration was REFUSED. Nothing was committed.'
