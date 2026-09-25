-- inverse of migrations/campaign/suitehealth3_the_write_path_helpers_plan_once.sql — restores the four LANGUAGE sql bodies
-- exactly as they were live on production and the dev clone on 2026-09-25 (sha256 of pg_get_functiondef identical on both).

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION custom.entity_reference_kinds()
 RETURNS TABLE(token text, label text, category text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- The kinds of platform thing an entity-reference Field may name: exactly the registered
  -- `record → <token>` association types, so the list a person picks from, the list the Field
  -- guard accepts and the list the edge trigger accepts are ONE list.
  select e.token, e.label, coalesce(nullif(e.reference_category, ''), e.schema_name)
    from platform.association_types r
    join platform.entity_types e on e.token = r.target_type
   where r.source_type = 'record'
     and r.target_type <> 'record'
     and r.is_active
     and e.is_active
   order by e.label;
$function$;

CREATE OR REPLACE FUNCTION custom.field_inputs_of(p_organization_id uuid, p_field_data jsonb)
 RETURNS TABLE(input_id uuid, input_key text, input_label text, input_table uuid, sensitivity text, retired boolean, how text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- Only a worked-out column reads other columns: a formula (config.expr), a lookup
  -- (config.pick) or a rollup (config.agg). A formula the Rule layer fills in (no expr) reads
  -- what its Rule reads, and the Rule's own door answers for that.
  with me as (
    select p_field_data as d,
           p_field_data ->> 'entity_definition_id' as tbl
     where coalesce(p_field_data ->> 'type', '') = 'formula'
       and coalesce(p_field_data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']),
  expr as (
    select case when jsonb_typeof(me.d -> 'config' -> 'expr') in ('object', 'array')
                then me.d -> 'config' -> 'expr' else 'null'::jsonb end as e, me.tbl
      from me),
  refs as (
    select v #>> '{}' as ref, expr.tbl
      from expr, jsonb_path_query(expr.e, 'strict $.**.field') v
     where jsonb_typeof(v) = 'string'
    union
    select v #>> '{}', expr.tbl
      from expr, jsonb_path_query(expr.e, 'strict $.**.parent_field') v
     where jsonb_typeof(v) = 'string'),
  by_id as (
    select case when r.ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then r.ref::uuid end as id
      from refs r),
  via as (
    select f.*
      from me
      join custom.record f
        on f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.data ->> 'entity_definition_id' = me.tbl
       and f.data ->> 'key' = me.d -> 'config' ->> 'via'
     where me.d -> 'config' ?| array['pick', 'agg'])
  select f.id, f.data ->> 'key', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
         nullif(f.data ->> 'entity_definition_id', '')::uuid,
         f.data ->> 'sensitivity', f.deleted_at is not null, 'names it by id'
    from by_id b
    join custom.record f
      on f.organization_id = p_organization_id
     and f.id = b.id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
  union
  select f.id, f.data ->> 'key', coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'),
         nullif(f.data ->> 'entity_definition_id', '')::uuid,
         f.data ->> 'sensitivity', f.deleted_at is not null, 'names it by key'
    from refs r
    join custom.record f
      on f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel'
     and f.data ->> 'entity_definition_id' = r.tbl
     and f.data ->> 'key' = r.ref
   where r.ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select v.id, v.data ->> 'key', coalesce(nullif(v.data ->> 'label', ''), v.data ->> 'key'),
         nullif(v.data ->> 'entity_definition_id', '')::uuid,
         v.data ->> 'sensitivity', v.deleted_at is not null, 'reads through it'
    from via v
  union
  select far.id, far.data ->> 'key', coalesce(nullif(far.data ->> 'label', ''), far.data ->> 'key'),
         nullif(far.data ->> 'entity_definition_id', '')::uuid,
         far.data ->> 'sensitivity', far.deleted_at is not null, 'reads it on the far side'
    from me
    join via v on true
    join custom.record far
      on far.organization_id = p_organization_id
     and far.table_id = custom.field_kernel_id()
     and far.data_class <> 'kernel'
     and far.data ->> 'entity_definition_id' = v.data ->> 'relation_target'
     and far.data ->> 'key' = coalesce(me.d -> 'config' ->> 'pick', me.d -> 'config' ->> 'of');
$function$;

CREATE OR REPLACE FUNCTION custom.field_input_closure(p_organization_id uuid, p_field_data jsonb, p_self uuid DEFAULT NULL::uuid)
 RETURNS TABLE(input_id uuid, input_key text, input_label text, input_table uuid, sensitivity text, retired boolean, depth integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  -- Inputs of inputs: a formula over a formula over Budget reads Budget. Twelve levels, and a
  -- column never counts as its own input, so a cycle ends instead of spinning.
  with recursive c(input_id, input_key, input_label, input_table, sensitivity, retired, depth, path) as (
    select i.input_id, i.input_key, i.input_label, i.input_table, i.sensitivity, i.retired, 1,
           array[coalesce(p_self, '00000000-0000-0000-0000-000000000000'::uuid), i.input_id]
      from custom.field_inputs_of(p_organization_id, p_field_data) i
     where i.input_id is distinct from p_self
    union all
    select j.input_id, j.input_key, j.input_label, j.input_table, j.sensitivity, j.retired,
           c.depth + 1, c.path || j.input_id
      from c
      join custom.record f
        on f.organization_id = p_organization_id
       and f.id = c.input_id
       and f.table_id = custom.field_kernel_id()
      cross join lateral custom.field_inputs_of(p_organization_id, f.data) j
     where c.depth < 12
       and not (j.input_id = any (c.path)))
  select distinct on (c.input_id)
         c.input_id, c.input_key, c.input_label, c.input_table, c.sensitivity, c.retired, c.depth
    from c
   order by c.input_id, c.depth;
$function$;

CREATE OR REPLACE FUNCTION iam.is_org_member(p_user uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- DEPRECATED wrapper: use iam.has_org_access_for.
  SELECT iam.has_org_access_for(p_user, p_org);
$function$;

delete from platform.client_callable_door
 where schema_name = 'iam' and function_name = 'is_org_member' and identity_args = 'p_user uuid, p_org uuid';
