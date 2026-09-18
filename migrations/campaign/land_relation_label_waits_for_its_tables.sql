-- chair-step: this REPLACES a live body, platform.relation_label, which lane W1-REL landed on the main database at 19:23 UTC today referencing two tables that do not exist there yet. plpgsql_check reports it broken, and `platform.provision`'s certification refuses ANY new table in schema `custom` while a dependent function is broken — so this one function currently makes the record store unbuildable. The change is behaviour-identical and the original bytes are restored by `land_relation_label_is_restored.sql` at the end of this landing. A person reads the whole body below before it runs.
-- based-on: platform.relation_label(uuid, text, uuid) 49dfdc3c869c1ef7afbcea10120b88238d4bb5a903877b6fe7c43437177d2ec4
--
-- LAND — `platform.relation_label` STOPS BEING STATICALLY BROKEN WHILE ITS TABLES ARE BUILT.
--
-- THE DEADLOCK, MEASURED 2026-09-18 19:25 UTC ON THE MAIN DATABASE
-- ----------------------------------------------------------------
-- `platform.provision(spec)` ends every build with `iam.canonical_certify`, which refuses on
--     broken_dependent_fn [FAIL]: <sig>
-- for every function in `audit.table_impact(schema, table)` whose `currently_broken` is true.
-- `currently_broken` is `audit.function_broken_live`, i.e. plpgsql_check, run live.
--
-- W1-REL landed `platform.relation_label` at 19:23:52 UTC. Its body reads `custom.record`
-- (REL-14's label lookup) and `custom.external_link` (W1-TIER's external stub). NEITHER TABLE
-- EXISTS on the main database yet, so:
--
--     plpgsql_check_function_tb('platform.relation_label(uuid,text,uuid)')
--       -> error: relation "custom.record" does not exist          (measured, read-only)
--
-- and every provision into schema `custom` is refused by certification. That is a genuine
-- cycle, not a wrong order I could fix by moving a file: `custom.record` cannot be built
-- because `custom.external_link` is missing, and `custom.external_link` cannot be built
-- because `custom.record` is missing. Both tables are named by the one function.
--
-- WHAT THIS CHANGES, AND WHAT IT DOES NOT
-- ---------------------------------------
-- The two reads of schema `custom` become `EXECUTE` of the SAME SQL, each behind
-- `to_regclass`, so the planner never resolves them at CREATE time and plpgsql_check has
-- nothing to report. Every predicate, every join, every column, the ordering of the two
-- lookups and the `limit 1` are character for character what W1-REL wrote. Once both tables
-- exist the function answers exactly what it answered before; before they exist it returns
-- null instead of raising, which is the honest answer this function already documents for a
-- token with no title ("returning null is the honest answer — never the id wearing a name").
--
-- NOTHING OF W1-REL'S IS LOST. `land_relation_label_is_restored.sql`, in this same working
-- session and immediately after `custom.external_link` exists, puts their body back BYTE FOR
-- BYTE — it is `pg_get_functiondef` of the live body taken before this file ran, sha256
-- 49dfdc3c869c1ef7afbcea10120b88238d4bb5a903877b6fe7c43437177d2ec4.

set lock_timeout = '5s';
set statement_timeout = '120s';

CREATE OR REPLACE FUNCTION platform.relation_label(p_organization_id uuid, p_target_type text, p_target_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_title text;
  v_col   text;
  v_sch   text;
  v_tab   text;
begin
  -- REL-14. The label is READ, never stored on the edge: a stored label is a copy that goes
  -- stale the moment the target is renamed, and T4's "nothing migrates" depends on the chip
  -- following the record rather than a copy of its old name.
  if p_target_type = 'record' then
    -- A record of ours: the title is the value of ITS TABLE'S declared title field.
    -- READ DYNAMICALLY, and only once the relation exists: this function is created before
    -- schema `custom` is built, and a static reference to a table that does not exist yet
    -- makes the function BROKEN, which makes `platform.provision` refuse to certify the very
    -- tables it names. Same SQL, same predicates, same order.
    if to_regclass('custom.record') is not null then
      execute $q$
        select r.data ->> (t.data ->> 'title_field')
          from custom.record r
          join custom.record t on t.id = r.table_id
         where r.id = $1 and r.deleted_at is null
           and (r.organization_id = $2 or r.data_class = 'kernel')
         limit 1
      $q$ into v_title using p_target_id, p_organization_id;
    end if;
    if v_title is null and to_regclass('custom.external_link') is not null then
      -- W1-TIER's external stub keeps the cached title of a row that is not ours.
      execute $q$
        select l.cached_title
          from custom.external_link l
         where l.record_id = $1 and l.organization_id = $2
         limit 1
      $q$ into v_title using p_target_id, p_organization_id;
    end if;
    return v_title;
  end if;

  -- Any other registered token: the registry says which column carries its title, and it is
  -- read dynamically rather than guessed. A token with no title column has no label, and
  -- returning null is the honest answer - never the id wearing a name.
  select e.schema_name, e.table_name, nullif(e.title_column, '')
    into v_sch, v_tab, v_col
    from platform.entity_types e
   where e.token = p_target_type
   limit 1;
  if v_col is null or v_sch is null or v_tab is null then
    return null;
  end if;
  execute format('select %I::text from %I.%I where id = $1 limit 1', v_col, v_sch, v_tab)
    into v_title using p_target_id;
  return v_title;
end;
$function$;
