-- lane: PAGE-SPEED-3
--
-- based-on: platform.static_row_probe_spec() a15f0affecbc8ca09e8631c6c2b501cdc1d94abe3b3437360e360146a4157bb8
--
-- WHY (second step; the first, pagespeed3_a_files_row_is_probed_by_a_cached_plan.sql, added files.files). A folder row is read by the same
-- dynamic chain when a file list asks which containing folders open to a seat. Same arm, same shape (creator, organization), same fallback.
-- First step's reason: A file list asks the access kernel for the row attributes of every file of an organization, through
-- platform.entity_row_access_attrs. For files.files (an ordinary table, not a partitioned one) that call falls past the
-- generated probe into the dynamic EXECUTE chain, which plpgsql plans from scratch on every call: measured on the
-- main database as postgres, 0.165 ms a file (0.026 ms of it the probe miss), against ~0.02 ms for the same read as
-- static, plan-cached SQL. 13,758 files of the 3e790542 organization = 2.3 s of a 14.9 s list for a member seat.
-- This is the fix PAGE-SPEED-2 named: the generator that already writes a static, cached-plan arm for every
-- partitioned entity table now also writes one for files.files. The arm is the shape the dynamic chain reaches for
-- that table (first fallback: the row's own access column, creator, organization), reads by id and answers the same
-- not-found shape, and any surprise at all hands the question back to the dynamic chain (o_handled = false).
-- The table is named in ONE place (the array below) and the stale-probe check (platform.static_row_probes_stale)
-- goes red if the generated bodies stop matching this spec. T-13 is not touched: this replaces an already-listed
-- reader by identity and the arm is emitted by the generator, as every other static arm is.
-- Function body + regeneration only, no lock beyond the two function rows. Any hour.
-- Inverse: migrations/inverse/pagespeed3_a2_files_folders_row_is_probed_by_a_cached_plan_down.sql

set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION platform.static_row_probe_spec()
 RETURNS TABLE(kind text, key text, schema_name text, table_name text, shape integer, id_column text, owner_column text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with rel as (
    -- every partitioned table, plus the ordinary tables whose rows a LIST asks the kernel about one by one
    -- (PAGE-SPEED-3: files.files, and files.folders whose containing-folder answer a file list asks per folder).
    select n.nspname::text as schema_name, c.relname::text as table_name, c.oid
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'p'
        or (c.relkind = 'r' and (n.nspname || '.' || c.relname) = any (array['files.files', 'files.folders']))
  ), cols as (
    select r.schema_name, r.table_name,
           bool_or(a.attname = 'id')              as has_id,
           -- 🚨 AND THE ID HAS TO BE A uuid. `history.row_versions` is partitioned, is a
           -- registered entity type and has a BIGINT id, so the spec generated an arm the probe
           -- (whose parameter is uuid) could never be handed a value for — and the dynamic chain
           -- it stands in for could not either: `platform.entity_row_access_attrs` takes a uuid
           -- too, so that table has never been answerable through it and is not made less
           -- answerable here. An arm that cannot fire is a lie in the generated body and a
           -- fingerprint that says the class is covered when it is not.
           bool_or(a.attname = 'id' and a.atttypid = 'uuid'::regtype) as id_is_uuid,
           bool_or(a.attname = 'visibility')      as has_vis,
           bool_or(a.attname = 'created_by')      as has_created_by,
           bool_or(a.attname = 'owner_id')        as has_owner_id,
           bool_or(a.attname = 'organization_id') as has_org
      from rel r
      join pg_catalog.pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
     group by r.schema_name, r.table_name
  ), shaped as (
    -- The six fallbacks of platform.entity_row_access_attrs, in its own order. The first one
    -- whose columns all exist is the one the dynamic chain reaches, so it is the one to emit.
    select c.*,
           case
             when c.has_vis and c.has_created_by and c.has_org then 1
             when c.has_vis and c.has_owner_id   and c.has_org then 2
             when c.has_owner_id   and c.has_org               then 3
             when c.has_created_by and c.has_org               then 4
             when c.has_org                                    then 5
             else 6
           end as shape
      from cols c
     where c.has_id
       and c.id_is_uuid
  )
  select 'entity'::text, et.token::text, s.schema_name, s.table_name, s.shape,
         'id'::text, null::text
    from shaped s
    join platform.entity_types et
      on et.schema_name = s.schema_name and et.table_name = s.table_name and et.is_active
  union all
  select 'owner'::text, rr.resource_type::text, s.schema_name, s.table_name, 0,
         rr.id_column::text, rr.owner_column::text
    from shaped s
    join platform.shareable_resource_registry rr
      on rr.schema_name = s.schema_name and rr.table_name = s.table_name and rr.is_active
     and rr.owner_column is not null and rr.id_column is not null
  order by 1, 2;
end;
$function$;

select platform.rebuild_static_row_probes();
