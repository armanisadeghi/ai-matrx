-- guard: custom/system_enabled
-- chair-step: this corrects DATA in the door registry (platform.client_callable_door.identity_args); an UPDATE is not one of the runner's enumerated additive shapes. It writes no DDL, touches no function body, grant, policy or customer row, and rewrites only rows whose stored text already disagrees with pg_get_function_identity_arguments for the very function the row's own identity_argtypes names. Inverse for the one row live today is spelled out in the header below.
--
-- DOORS-DECIDE-3 — AN oidvector COUNTS FROM ZERO, SO THE JOIN MATCHED NOTHING.
--
-- `doorsdecide3_a_door_row_is_rendered_by_the_catalog_not_typed.sql` applied cleanly and
-- reported `0 door row(s) re-rendered` on both databases, while check:store-doors-decide
-- stayed red on the same single row. The predicate was wrong, not the diagnosis:
--
--     p.proargtypes::oid[] is not distinct from <array_agg over d.identity_argtypes>
--
-- `pg_proc.proargtypes` is an `oidvector`, and casting an oidvector to `oid[]` keeps its
-- ZERO-based lower bound: the left side renders `[0:8]={25,2951,…}` and the right side
-- `{25,2951,…}` with the default lower bound 1. Postgres compares array bounds as part of
-- array equality, so two arrays holding byte-identical elements in identical order were
-- `is distinct from` each other and the join produced no rows. A silently empty match set is
-- the same failure shape this whole census exists to refuse, one level up — so the fix is to
-- normalise the lower bound on BOTH sides rather than to trust either.
--
-- THE ROW THIS CLOSES, unchanged from the first file: platform.act_on_my_assists was declared
-- on 2026-09-22 02:32Z by `migrations/assists_writes_go_through_a_door.sql` with a hand-typed
-- `p_until timestamptz`, where the catalog renders the canonical `p_until timestamp with time
-- zone`. Its grant and its identity_argtypes oid[] are correct; only the TEXT every
-- exact-match guard joins on was an alias, which does not open the door — it hides the door
-- from every guard. THE CLASS: any identity_args a person typed can drift the same way
-- (`int4`, `varchar`, `bool`, `timetz`), so this re-derives the text from the catalog for
-- EVERY row that disagrees with it, and is idempotent.
--
-- THE INVERSE, for the one row that drifts today:
--   update platform.client_callable_door set identity_args = 'p_verb text, p_ids uuid[],
--   p_dedupe_keys text[], p_source_key text, p_until timestamptz, p_note text, p_flag boolean,
--   p_result jsonb, p_metadata jsonb' where schema_name = 'platform'
--     and function_name = 'act_on_my_assists';

do $$
declare
  v_fixed integer;
begin
  with matched as (
    select d.id,
           pg_catalog.pg_get_function_identity_arguments(p.oid) as catalog_args,
           d.identity_args                                      as stored_args
      from platform.client_callable_door d
      join pg_catalog.pg_proc p
        on p.pronamespace = to_regnamespace(d.schema_name)
       and p.proname      = d.function_name
       -- BOTH SIDES REBUILT FROM ELEMENT ONE. The oidvector's zero-based lower bound is what
       -- made the first attempt match nothing; array_agg over unnest always yields [1:n].
       and (select coalesce(array_agg(t::oid order by o), '{}'::oid[])
              from unnest(case when btrim(p.proargtypes::text) = '' then '{}'::oid[]
                               else string_to_array(btrim(p.proargtypes::text), ' ')::oid[] end)
                   with ordinality u(t, o))
           is not distinct from
           (select coalesce(array_agg(t::oid order by o), '{}'::oid[])
              from unnest(d.identity_argtypes) with ordinality u2(t, o))
  ), drifted as (
    select id, catalog_args from matched where catalog_args is distinct from stored_args
  )
  update platform.client_callable_door d
     set identity_args = f.catalog_args
    from drifted f
   where d.id = f.id;
  get diagnostics v_fixed = row_count;

  raise notice 'DOORS-DECIDE-3: % door row(s) re-rendered from the catalog.', v_fixed;
end $$;
