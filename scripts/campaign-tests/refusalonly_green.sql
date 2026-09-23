-- LANE STORE-TXN-4 — THE refusal_only DOOR CLASS, THE GREEN SUITE. Nothing is committed.
--
-- THE USE CASE. A records manager at Harborview Dental Group is asked by a former patient to
-- "delete everything you have on me" and reaches, from the app, for the permanent purge. Until
-- today she was answered by PostgreSQL — `permission denied for function migrate_purge_hard` —
-- which tells her nothing and offers no way forward. Now she reaches
-- `custom.migrate_purge_hard_request`, a door that does NOTHING and says, in our words, that a
-- permanent erasure is run by an owner at a terminal and what she can do right now (archive).
--
--   0  the word exists and the one shape test exists
--   1  the first refusal_only door PASSES the shape test: one statement, and it raises
--   2  its register row says refusal_only, opens a signed-in lane, and `authenticated` holds EXECUTE
--   3  FROM THE SEAT `authenticated`: the call answers 42501 with the door's own sentence and a
--      remedy that names archiving — never "permission denied for function"
--   4  the REAL door is untouched: custom.migrate_purge_hard is still chair-only, no grant
--   5  the shape test is not fooled by WORDS IN THE SENTENCE: a refusal that says "select" or
--      "delete" inside its string literal is still one statement that raises
--
-- Its twin, refusalonly_red.sql, declares refusal_only over bodies that DO something and passes
-- only when the live guard refuses each declaration.
--
-- RUN IT:  psql "$DSN" -f scripts/campaign-tests/refusalonly_green.sql

\set ON_ERROR_STOP on
\timing off

\set suite 'refusalonly_green.sql'
\set requires 'function:platform.door_body_is_refusal_only|function:custom.migrate_purge_hard_request'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

\echo ''
\echo '── 0–2 · the word, the shape test, the first door, its row and its grant ──────────────'

do $$
declare v_ok boolean; v_why text; v_row record;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'platform' and table_name = 'client_callable_door'
                    and column_name = 'refusal_only') then
    raise exception 'CLAUSE 0 FAILED: platform.client_callable_door.refusal_only is not on this database';
  end if;
  raise notice 'CLAUSE 0 PASS — the register word and its one shape test are here';

  select ok, why into v_ok, v_why
    from platform.door_body_is_refusal_only('custom.migrate_purge_hard_request(uuid,uuid,text)'::regprocedure::oid);
  if not v_ok then
    raise exception 'CLAUSE 1 FAILED: the first refusal_only door fails its own shape test — %', v_why;
  end if;
  raise notice 'CLAUSE 1 PASS — custom.migrate_purge_hard_request: %', v_why;

  select d.refusal_only, d.signed_in_callers, d.anonymous_callers into v_row
    from platform.client_callable_door d
   where d.schema_name = 'custom' and d.function_name = 'migrate_purge_hard_request';
  if v_row is null or not v_row.refusal_only or not v_row.signed_in_callers or v_row.anonymous_callers then
    raise exception 'CLAUSE 2 FAILED: the register row is not refusal_only + signed-in only (%)', v_row;
  end if;
  if not has_function_privilege('authenticated', 'custom.migrate_purge_hard_request(uuid,uuid,text)', 'EXECUTE') then
    raise exception 'CLAUSE 2 FAILED: authenticated holds no EXECUTE, so a person still hears PostgreSQL, not us';
  end if;
  raise notice 'CLAUSE 2 PASS — declared refusal_only for signed-in callers, and authenticated may call it';
end $$;

\echo ''
\echo '── 3 · from the seat `authenticated`, the person hears OUR sentence ───────────────────'

begin;
set local role authenticated;
do $$
declare v_code text; v_msg text; v_hint text;
begin
  perform custom.migrate_purge_hard_request(
    gen_random_uuid(), null,
    'A former patient of Harborview Dental Group asked in writing for every record of theirs to be erased.');
  raise exception 'CLAUSE 3 FAILED: the refusal_only door RETURNED — it did something';
exception when others then
  get stacked diagnostics v_code = returned_sqlstate, v_msg = message_text, v_hint = pg_exception_hint;
  if v_msg like 'CLAUSE 3 FAILED%' then raise; end if;
  if v_code <> '42501' or v_msg not like 'Destroying records for good is not something a signed-in caller does here%' then
    raise exception 'CLAUSE 3 FAILED: the seat heard % "%", not the door''s own sentence', v_code, v_msg;
  end if;
  if v_hint not like '%archive%custom.migrate_purge(%' then
    raise exception 'CLAUSE 3 FAILED: the refusal carries no remedy the person can act on: %', v_hint;
  end if;
  raise notice 'CLAUSE 3 PASS — authenticated hears (%) "%" with the archive-never-delete remedy', v_code, v_msg;
end $$;
rollback;

\echo ''
\echo '── 4 · the real door is untouched: still chair-only ───────────────────────────────────'

do $$
begin
  if has_function_privilege('authenticated',
       'custom.migrate_purge_hard(uuid,uuid,text,integer,boolean)', 'EXECUTE') then
    raise exception 'CLAUSE 4 FAILED: authenticated may EXECUTE custom.migrate_purge_hard — the compliance erasure is open to a seat';
  end if;
  raise notice 'CLAUSE 4 PASS — custom.migrate_purge_hard holds no grant for authenticated';
end $$;

\echo ''
\echo '── 5 · words inside the sentence do not fool the shape test ───────────────────────────'

begin;
create function custom.txn4_green_words_in_the_sentence(p_organization_id uuid)
returns void language plpgsql security definer set search_path to 'pg_catalog' as $b$
begin
  raise exception 'You cannot select, update or delete these records from here; perform the erasure at a terminal.'
    using errcode = '42501', hint = 'Archive instead: custom.migrate_purge(organization, table, false).';
end;
$b$;
do $$
declare v_ok boolean; v_why text;
begin
  select ok, why into v_ok, v_why
    from platform.door_body_is_refusal_only('custom.txn4_green_words_in_the_sentence(uuid)'::regprocedure::oid);
  if not v_ok then
    raise exception 'CLAUSE 5 FAILED: a refusal whose SENTENCE says select/update/delete was judged as code — %', v_why;
  end if;
  raise notice 'CLAUSE 5 PASS — string literals are blanked before the words are looked for (%)', v_why;
end $$;
rollback;

\echo ''
\echo 'refusalonly_green: all clauses PASS. Nothing was committed.'
