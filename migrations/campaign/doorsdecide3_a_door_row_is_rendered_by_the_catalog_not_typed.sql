-- guard: custom/system_enabled
-- chair-step: this corrects DATA in the door registry (platform.client_callable_door.identity_args), and an UPDATE is not one of the runner's enumerated additive shapes. It writes no DDL, touches no function body, grant, policy or customer row, and rewrites only rows whose stored text already disagrees with pg_get_function_identity_arguments for the very function the row's own identity_argtypes names. Its inverse is the previous text, recorded in this file's header for the one row live today.
--
-- DOORS-DECIDE-3 — A DOOR ROW SAYS WHAT THE CATALOG RENDERS, OR IT NAMES NOTHING.
--
-- `pnpm check:store-doors-decide`:
--
--   [FAIL] door rows whose stored signature is not what the catalog renders - 1:
--          platform.act_on_my_assists(... p_until timestamptz ...) - the row stores
--          'p_until timestamptz' and the catalog renders 'p_until timestamp with time zone'
--
-- THE INVERSE, for the one row that drifts today: update platform.client_callable_door set
-- identity_args = 'p_verb text, p_ids uuid[], p_dedupe_keys text[], p_source_key text, p_until
-- timestamptz, p_note text, p_flag boolean, p_result jsonb, p_metadata jsonb' where schema_name
-- = 'platform' and function_name = 'act_on_my_assists';
--
-- THE ROOT CAUSE, and it is not a guard misreading a legitimate shape. `platform.
-- client_callable_door.identity_args` is the text every exact-match guard in this repo joins
-- a door row to its live function by. `pg_get_function_identity_arguments` renders the type's
-- CANONICAL name — `timestamp with time zone` — and never its alias. The row was hand-typed
-- in `migrations/assists_writes_go_through_a_door.sql` (declared_by, 2026-09-22 02:32Z) from
-- the same source text the CREATE FUNCTION used, where `timestamptz` is a perfectly good way
-- to write the type. So the door is real, its grant is real, its `identity_argtypes` oid[] is
-- correct (1184 = timestamptz) — and its `identity_args` matches no rendering of anything,
-- which makes every guard that joins on that text SKIP this door IN SILENCE. That is the
-- failure mode the census was written for: not an open door, an unwatched one.
--
-- THE CLASS, not the instance. Any row whose `identity_args` was typed by a person rather
-- than rendered by the catalog can drift the same way — `int4`, `varchar`, `bool`, `timetz`,
-- a re-ordered default, a respelled array. So this file does not hand-correct one string. It
-- re-derives `identity_args` FROM THE CATALOG for every row that disagrees with it, keyed on
-- the pair the unique index already keys on (`schema_name`, `function_name`,
-- `identity_argtypes`). Today that is one row; the statement is idempotent and is the remedy
-- for the next one too. The guard (census 8 of check:store-doors-decide) stays the guard.
--
-- Nothing else moves: no function body, grant, policy, table or column is touched, and a row
-- whose function does not exist on this database is left exactly as it is.

do $$
declare
  v_fixed integer;
begin
  with rendered as (
    select d.id,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as catalog_args,
           d.identity_args                                      as stored_args,
           d.schema_name, d.function_name
      from platform.client_callable_door d
      join pg_catalog.pg_proc p
        on p.pronamespace = to_regnamespace(d.schema_name)
       and p.proname      = d.function_name
       and p.proargtypes::oid[] is not distinct from
           (select coalesce(array_agg(t::oid order by o), '{}'::oid[])
              from unnest(d.identity_argtypes) with ordinality u(t, o))
  ), drifted as (
    select * from rendered where catalog_args is distinct from stored_args
  )
  update platform.client_callable_door d
     set identity_args = f.catalog_args
    from drifted f
   where d.id = f.id;
  get diagnostics v_fixed = row_count;

  raise notice 'DOORS-DECIDE-3: % door row(s) re-rendered from the catalog.', v_fixed;
end $$;

comment on column platform.client_callable_door.identity_args is
  'The function this row declares, as pg_get_function_identity_arguments RENDERS it — the canonical type names ("timestamp with time zone", never "timestamptz"; "integer", never "int4"). Every exact-match guard joins a door row to its live function by this text, so a hand-typed alias here does not open a door, it makes the door invisible to the guards. Derive it, never type it: select pg_get_function_identity_arguments(oid) from pg_proc. (DOORS-DECIDE-3, 2026-09-22, after platform.act_on_my_assists was declared with "p_until timestamptz".)';
