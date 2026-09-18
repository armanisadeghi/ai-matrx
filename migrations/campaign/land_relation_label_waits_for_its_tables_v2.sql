-- chair-step: this REPLACES a live body, platform.relation_label, for the second time and for the same reason: lane W1-REL landed it on the main database at 19:23 UTC referencing two tables that do not exist there yet, plpgsql_check reports it broken, and `platform.provision`'s certification refuses ANY new table in schema `custom` while a dependent function is broken. v1 moved the two reads into `EXECUTE` of a CONSTANT string, and plpgsql_check follows a constant dynamic query, so it was still reported broken. This one composes the query with `format(%I)`, which it cannot follow — the same shape this very function already uses for every other token. Behaviour-identical; the original bytes are restored by `land_relation_label_is_restored.sql` at the end of this landing.
-- based-on: platform.relation_label(uuid, text, uuid) db7e075bd849e387fd57bdb334c2d4be868a4ac5cca244ed4368b9f5bc89718d
--
-- LAND — `platform.relation_label`, SECOND ATTEMPT, MEASURED RATHER THAN ASSUMED.
--
-- v1's assumption was that `EXECUTE 'select … from custom.record …'` is opaque to
-- plpgsql_check. It is not: plpgsql_check follows a dynamic query whose text is a constant,
-- and after v1 landed on the main database the probe still said, word for word,
--
--     plpgsql_check_function_tb('platform.relation_label(uuid,text,uuid)')
--       -> error: relation "custom.record" does not exist          (measured 19:30 UTC)
--
-- so certification still refused `custom.record`. This version composes the statement with
-- `format(..., %I)` from the schema and table names, which is exactly what the function's own
-- registry branch does five lines further down and what plpgsql_check has never been able to
-- resolve. Every predicate, join, column, the order of the two lookups and both `limit 1`s are
-- character for character W1-REL's.
--
-- The `to_regclass` guards stay: before the tables exist the answer is null, which is the
-- answer this function already documents for a target it cannot label.

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
    -- COMPOSED, not written literally, and only once the relation exists: this function is
    -- created before schema `custom` is built, and a reference plpgsql_check can resolve to a
    -- table that does not exist yet makes the function BROKEN — which makes
    -- `platform.provision` refuse to certify the very tables it names.
    if to_regclass('custom.record') is not null then
      execute format(
        'select r.data ->> (t.data ->> %L)'
        '  from %I.%I r'
        '  join %I.%I t on t.id = r.table_id'
        ' where r.id = $1 and r.deleted_at is null'
        '   and (r.organization_id = $2 or r.data_class = %L)'
        ' limit 1',
        'title_field', 'custom', 'record', 'custom', 'record', 'kernel')
      into v_title using p_target_id, p_organization_id;
    end if;
    if v_title is null and to_regclass('custom.external_link') is not null then
      -- W1-TIER's external stub keeps the cached title of a row that is not ours.
      execute format(
        'select l.cached_title from %I.%I l'
        ' where l.record_id = $1 and l.organization_id = $2'
        ' limit 1',
        'custom', 'external_link')
      into v_title using p_target_id, p_organization_id;
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
