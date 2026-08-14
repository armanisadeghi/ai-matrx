-- retire_dead_entity_system_rpcs.sql
--
-- Retires the last two genuinely-broken functions the conformance checker
-- surfaced on 2026-08-13, once it was made trustworthy enough for "2" to mean
-- something. Both are provably dead AND provably non-functional. This is a
-- SET SCHEMA retirement, not a DROP: the bodies survive intact in `graveyard`
-- and one ALTER brings either back.
--
-- ── 1. public.get_table_info(text) — cannot serve any purpose ───────────────
-- Declares a `table_name text` parameter and then IGNORES it: the body is
-- hardcoded to `WHERE tc.table_name = 'registered_function'`. That table is
-- ALREADY in the graveyard — the entity system it belonged to was deliberately
-- removed (CLAUDE.md: "(legacy) and (public-demos) are DELETED — entity system
-- removed"). So the function can only ever introspect a retired table, and it
-- lies about its own signature while doing it. It also cannot return: the
-- declared OUT columns are `text` but information_schema yields
-- sql_identifier/character_data domains, hence the live 42804 "structure of
-- query does not match function result type".
-- Generic table introspection is already covered properly by
-- public.schema_truth_snapshot() (feeding `pnpm check:schema`), so nothing is
-- lost.
--
-- ── 2. public.execute_complex_save(jsonb,jsonb) — never worked, ever ────────
-- Not "unfinished work with a vision to complete" — a draft that could not have
-- run even once, on four independent counts:
--   * `ROLLBACK` inside a plpgsql function => guaranteed 2D000 "invalid
--     transaction termination" on the only error path it has;
--   * `COALESCE((op->'dependencies')::text[], '{}')` => 42846, jsonb has no cast
--     to text[];
--   * `WHEN 'update'` and `WHEN 'delete'` branches are EMPTY, holding only the
--     comments "Implementation for update" / "Similar structure";
--   * the insert branch splices `jsonb_populate_record(NULL::record, …)` into a
--     format() string as if it were VALUES syntax, which is not valid SQL and
--     could not have produced a runnable statement.
-- Its stated job — write several related rows in dependency order — is served
-- today by the platform's actual write paths (direct Supabase writes,
-- utils/supabase/guardedUpdate.ts for compare-and-swap, and the Matrx ORM on
-- the server). This is a dead alternative to something we have, not a gap.
--
-- ── Why retire instead of repair ────────────────────────────────────────────
-- Verified across all six repos (matrx-frontend, aidream, matrx-extend,
-- matrx-local, matrx-sandbox, my-matrx): ZERO live callers of either. Every
-- textual hit is generated types, a generated schema snapshot, the migration
-- that defines it, or a doc note. No dynamic `.rpc(name)` dispatcher is ever
-- passed either name, and no in-DB function, view, trigger or default depends on
-- either one.
--
-- Retiring them out of `public` also removes them from PostgREST, so no client
-- can call a function that is incapable of succeeding — today they are exposed
-- and reachable, which is strictly worse than absent. `graveyard` is in
-- meta.excluded_schema, so the checker correctly stops scoring retired code.
--
-- ⚠️ Requires `pnpm db-types` afterwards: both leave the generated
-- types/database.types.ts Functions block.
--
-- Idempotent. Safe to re-run.

do $retire$
declare
  v_moved text[] := '{}';
begin
  -- get_table_info(text)
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_table_info'
      and pg_get_function_identity_arguments(p.oid) = 'table_name text'
  ) then
    -- Refuse to move it if something started depending on it since this was written.
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema','graveyard')
        and p.prokind = 'f'
        and p.oid <> 'public.get_table_info(text)'::regprocedure
        and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
        and pg_get_functiondef(p.oid) ~* '\mget_table_info\M'
    ) then
      raise exception 'get_table_info now has an in-DB dependent — re-verify before retiring.';
    end if;

    alter function public.get_table_info(text) set schema graveyard;
    v_moved := v_moved || 'public.get_table_info(text)'::text;
  end if;

  -- execute_complex_save(jsonb,jsonb)
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'execute_complex_save'
  ) then
    if exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema','graveyard')
        and p.prokind = 'f'
        and p.oid <> 'public.execute_complex_save(jsonb,jsonb)'::regprocedure
        and p.prolang in (select oid from pg_language where lanname in ('plpgsql','sql'))
        and pg_get_functiondef(p.oid) ~* '\mexecute_complex_save\M'
    ) then
      raise exception 'execute_complex_save now has an in-DB dependent — re-verify before retiring.';
    end if;

    alter function public.execute_complex_save(jsonb, jsonb) set schema graveyard;
    v_moved := v_moved || 'public.execute_complex_save(jsonb,jsonb)'::text;
  end if;

  if array_length(v_moved, 1) is null then
    raise notice 'Nothing to retire — both functions already moved.';
  else
    raise notice 'Retired to graveyard: %', array_to_string(v_moved, ', ');
  end if;
end $retire$;

-- Record the retirement in the ledger the doctrine points at.
insert into platform.deprecated_relations (old_ref, new_ref, archived_as, reason)
values
  ('public.get_table_info(text)',
   'public.schema_truth_snapshot()',
   'graveyard.get_table_info(text)',
   'Ignored its own table_name parameter and hardcoded WHERE table_name = ''registered_function'', a table already in graveyard (entity system removed). Also could not return: declared text OUT columns vs information_schema domains (live 42804). Zero callers in all six repos. Generic introspection is served by schema_truth_snapshot().'),
  ('public.execute_complex_save(jsonb,jsonb)',
   'direct Supabase writes + utils/supabase/guardedUpdate.ts + Matrx ORM',
   'graveyard.execute_complex_save(jsonb,jsonb)',
   'Never functional: ROLLBACK inside a plpgsql function (2D000), jsonb::text[] cast (42846), EMPTY update/delete branches, and an insert branch splicing jsonb_populate_record into format() as VALUES syntax. Zero callers in all six repos.')
on conflict do nothing;

-- Post-conditions: gone from public, present in graveyard, invisible to the checker.
do $assert$
declare v_public int; v_grave int;
begin
  select count(*) into v_public
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('get_table_info','execute_complex_save');
  if v_public <> 0 then
    raise exception '% copy(ies) still live in public — retirement did not take.', v_public;
  end if;

  select count(*) into v_grave
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'graveyard' and p.proname in ('get_table_info','execute_complex_save');
  if v_grave < 2 then
    raise exception 'Expected 2 retired functions in graveyard, found % — a body was lost, not retired.', v_grave;
  end if;
end $assert$;

select audit.refresh();

-- The whole point: the checker's actionable number is now zero, and it got there
-- by the findings being resolved, not by being classified away.
do $assert$
declare v_real int; v_rows text;
begin
  select count(*) into v_real from audit.broken_functions where severity = 'real';
  if v_real <> 0 then
    select string_agg(signature || ' — ' || coalesce(message,''), '; ')
      into v_rows from audit.broken_functions where severity = 'real';
    raise exception 'Expected 0 real findings after retirement, found %: %', v_real, v_rows;
  end if;
end $assert$;
