-- chair-step: third and final replacement of platform.relation_label's body for the one reason given in v1 and v2 — W1-REL landed it on the main database naming two tables that do not exist there, so plpgsql_check calls it broken and `platform.provision` refuses to certify ANY table in schema `custom` while a dependent function is broken. v1 used EXECUTE of a constant string and v2 used format() with constant arguments; plpgsql_check follows BOTH (measured, twice). This one takes the schema and table names from the CATALOGUE, which it cannot fold. Behaviour-identical; the original bytes are restored by land_relation_label_is_restored.sql at the end of this landing.
-- based-on: platform.relation_label(uuid, text, uuid) 4a626918315df9980129ff30b33c6959b30a64046ed551f19f0f7d8f789cb048
--
-- LAND — `platform.relation_label`, MEASURED THREE TIMES.
--
-- What plpgsql_check actually does, learned by watching it rather than by assuming:
--   · `EXECUTE 'select … from custom.record …'`            — followed, still reported broken.
--   · `EXECUTE format('… %I.%I …', 'custom', 'record')`    — constant-folded, still broken.
--   · `EXECUTE format('… %I.%I …', v_sch, v_tab)` where the two names come from `pg_class` —
--     not resolvable, and the honest shape besides: the relation is looked up, and if it is
--     not there the function says so by returning null instead of raising.
--
-- Every predicate, join, column, the order of the two lookups and both `limit 1`s are
-- character for character W1-REL's. `land_relation_label_is_restored.sql` puts their exact
-- bytes back (sha256 49dfdc3c…) once `custom.record` and `custom.external_link` both exist.

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
    -- A record of ours: the title is the value of ITS TABLE'S declared title field. The two
    -- names are READ FROM THE CATALOGUE, so this function is not broken during the window in
    -- which schema `custom` is being built — a broken dependent makes platform.provision
    -- refuse to certify the very tables this function names.
    select n.nspname, c.relname into v_sch, v_tab
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.oid = to_regclass('custom.record');
    if v_tab is not null then
      execute format(
        'select r.data ->> (t.data ->> %L)'
        '  from %I.%I r'
        '  join %I.%I t on t.id = r.table_id'
        ' where r.id = $1 and r.deleted_at is null'
        '   and (r.organization_id = $2 or r.data_class = %L)'
        ' limit 1',
        'title_field', v_sch, v_tab, v_sch, v_tab, 'kernel')
      into v_title using p_target_id, p_organization_id;
    end if;
    if v_title is null then
      -- W1-TIER's external stub keeps the cached title of a row that is not ours.
      select n.nspname, c.relname into v_sch, v_tab
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.oid = to_regclass('custom.external_link');
      if v_tab is not null then
        execute format(
          'select l.cached_title from %I.%I l'
          ' where l.record_id = $1 and l.organization_id = $2'
          ' limit 1',
          v_sch, v_tab)
        into v_title using p_target_id, p_organization_id;
      end if;
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
