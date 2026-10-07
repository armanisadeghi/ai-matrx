-- chair-step: lane DRILL-SERVER-2 — A RELATION LOOKUP READS ONLY ITS OWN REGISTRY ROWS. Replaces platform._drill_fk (the drill door's "which registry token does this column point at") with the identical query plus one filter: when the table asked about is a view, only the registry rows whose own table is that view (or every row, for a record-store view in schema custom) are asked where they are read from. Same answer for every column; nothing else changes. No table, policy or row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform
-- based-on: platform._drill_fk(text, text, text, text) c8467643e15e04456822aba882c28a12fd454f5d5394ae184773c029e595d5f5
-- (based-on: pg_get_functiondef on PRODUCTION, read-only, 2026-10-07; the nightly clone carries the same body)
--
-- WHY. "Group by conversation over 30 days for one person" on ai_usage_executions timed out live
-- (2026-10-07). Profiled on the clone (track_functions): of 3.3 s, 1.3 s was this function — the
-- definer fact is a VIEW, so for each relation column the src CTE called platform.entity_read_source
-- once per registry row (61,661 calls per drill_ask).
-- INVERSE: migrations/inverse/drillserver2_a_relation_lookup_reads_only_its_own_registry_rows_down.sql

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
       -- DRILL-SERVER-2: only the registry rows that CAN read from this view reach the lookup. A token
       -- reads its rows from its own registry table, or (moved to the record store) from a view in
       -- schema custom; so outside custom only the view's own registry rows can match. The lookup is
       -- still asked of each, so the answer is the same; it is no longer asked of all 1,100 tokens
       -- for every relation column of a view (56 calls x 1,101 tokens = 61,661 lookups, 0.65 s per
       -- resolve of ai_usage_executions, twice per drill_ask).
       and (p_schema = 'custom' or (e.schema_name = p_schema and e.table_name = p_table))
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
