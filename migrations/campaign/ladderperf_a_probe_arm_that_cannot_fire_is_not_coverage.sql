-- chair-step: it REPLACES platform.static_row_probe_spec, which this lane created 90 seconds
-- earlier and which no knob holds OFF. WHY, found by scripts/campaign-tests/ladderperf_green.sql
-- PART 4 on its first run: `history.row_versions` is partitioned, is an active
-- platform.entity_types row, and its `id` is a BIGINT. The spec emitted an arm for it, and the
-- generated probe's parameter is a uuid — so the arm could never be handed a value, and the
-- fingerprint claimed the class was covered when for that table nothing was. It is not a
-- behaviour change for that table: `platform.entity_row_access_attrs` takes a uuid too, so
-- `history.row_versions` has never been answerable through the access kernel at all. The spec
-- now requires a uuid id, the probes are regenerated from it, and
-- platform.static_row_probes_stale() reads zero against the narrowed spec.

-- based-on: platform.static_row_probe_spec() 0119ddcd314e3b36fd80764ee76dd8e408096e4e3591b613ef3b5eaf71cd5486
CREATE OR REPLACE FUNCTION platform.static_row_probe_spec()
 RETURNS TABLE(kind text, key text, schema_name text, table_name text, shape integer, id_column text, owner_column text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  with rel as (
    select n.nspname::text as schema_name, c.relname::text as table_name, c.oid
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'p'
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
