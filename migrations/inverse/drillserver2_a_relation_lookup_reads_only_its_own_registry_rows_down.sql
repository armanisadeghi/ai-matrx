-- chair-step: the inverse of migrations/campaign/drillserver2_a_relation_lookup_reads_only_its_own_registry_rows.sql (lane DRILL-SERVER-2) — puts platform._drill_fk back exactly as it was on production on 2026-10-07. No row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform
-- based-on: platform._drill_fk(text, text, text, text) faedfb9c6fa01f10e37e85846ff7ebaaeb03f852adb1705d617238425ef0fec1
-- (the based-on body is this lane's up file as applied on the nightly copy)

CREATE OR REPLACE FUNCTION platform._drill_fk(p_schema text, p_table text, p_column text, p_token text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- SCOPES-REFS (2026-10-05): a relation names the table its target's rows are READ from
  -- (platform.entity_read_source) — a scope / scope type answers from the record store's views, never the
  -- old context tables that get no row made after the cutover. A column points at a registry token by
  -- (1) a one-column foreign key onto a unique column; (2) the record-store check that replaced the foreign
  -- keys onto the old context tables (platform.assert_context_reference: column, old table); or, when the
  -- table asked about is itself a record-store view, (3) the foreign keys its registry table declares.
  with src as (
    select p_schema as s, p_table as t
    union
    select e.schema_name::text, e.table_name::text
      from platform.entity_types e
     cross join lateral platform.entity_read_source(e.token) r
     where exists (select 1 from pg_class v join pg_namespace vn on vn.oid = v.relnamespace
                    where vn.nspname = p_schema and v.relname = p_table and v.relkind = 'v')
       and r.schema_name = p_schema and r.table_name = p_table
  ),
  cand as (
    select e.token, e.title_column, ta.attname::text as to_col, k.conname::text as nm
      from src
      join pg_namespace n on n.nspname = src.s
      join pg_class c on c.relnamespace = n.oid and c.relname = src.t
      join pg_constraint k on k.conrelid = c.oid and k.contype = 'f' and cardinality(k.conkey) = 1
      join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1] and a.attname = p_column
      join pg_class tc on tc.oid = k.confrelid
      join pg_namespace tn on tn.oid = tc.relnamespace
      join pg_attribute ta on ta.attrelid = k.confrelid and ta.attnum = k.confkey[1]
      join platform.entity_types e on e.schema_name = tn.nspname and e.table_name = tc.relname
     -- the referenced column is unique by itself (a PK or a one-column unique constraint)
     where exists (select 1 from pg_constraint u
                    where u.conrelid = k.confrelid and u.contype in ('p', 'u')
                      and u.conkey = array[k.confkey[1]])
    union all
    select e.token, e.title_column, 'id', g.tgname::text
      from src
      join pg_namespace n on n.nspname = src.s
      join pg_class c on c.relnamespace = n.oid and c.relname = src.t
      join pg_trigger g on g.tgrelid = c.oid and not g.tgisinternal
                       and g.tgfoid = 'platform.assert_context_reference'::regproc
      join platform.entity_types e on e.schema_name = 'context'
                                  and e.table_name = split_part(encode(g.tgargs, 'escape'), '\000', 2)
     where split_part(encode(g.tgargs, 'escape'), '\000', 1) = p_column
  )
  select jsonb_build_object('schema', r.schema_name, 'table', r.table_name, 'to', cand.to_col,
                            'token', cand.token, 'title', cand.title_column)
    from cand
   cross join lateral platform.entity_read_source(cand.token) r
   where (p_token is null or cand.token = p_token)
   order by (cand.token = p_token) desc nulls last, cand.nm
   limit 1;
$function$;
