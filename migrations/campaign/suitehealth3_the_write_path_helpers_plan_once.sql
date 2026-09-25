-- additive: yes
-- based-on: custom.entity_reference_kinds() c2a3858ac2b01065f86ddddb3f0c7ffd81762c701ee5fd616aca57176a78c8f6
-- based-on: custom.field_inputs_of(uuid,jsonb) 87c4a7157c7cd657b4b12743dfdf7b87cf18b109e7796f62fdc34bf9ebebfef2
-- based-on: custom.field_input_closure(uuid,jsonb,uuid) e284397589ccc9edc638a4e3bedf55448e72bb11c63b0069464813774716b696
-- based-on: iam.is_org_member(uuid,uuid) 7c217cd0066d0c26ff8df5160a09f5b971a6e1dad555a3739f67f86db77e2cba
--
-- chair-step: it REPLACES four live function bodies with identical signatures, return types,
--   volatility, security, search_path and grants, moving each from LANGUAGE sql to LANGUAGE
--   plpgsql around the identical statement (`return query <body>` / `return (<body>)`). Nothing
--   is dropped, granted or revoked; no row is touched. The inverse is
--   `migrations/inverse/suitehealth3_the_write_path_helpers_plan_once_down.sql`.
--
-- LANE SUITE-HEALTH-3 (brief item 4, 2026-09-25). `writeperf2_green` clause 9 — the census that
-- nothing on custom.record's write path re-plans itself per call (`custom.ladder_replanners`
-- over the 57 write-path roots) — named five helpers; SHARE-LANE-2 moved its own
-- (`custom.row_sits_in_a_personal_table`, sharelane2_the_personal_table_question_plans_once.sql)
-- at 21:04Z. These are the other four, each a SECURITY DEFINER (or SET search_path) SQL function,
-- which PostgreSQL can never inline and so plans afresh inside every calling statement:
--   custom.entity_reference_kinds          scr_a_field_can_point_at_a_platform_entity.sql (c70baf75a8)
--   custom.field_inputs_of                 storeleakformula_* (8d5689fff1)
--   custom.field_input_closure             storeleakformula_* (8d5689fff1)
--   iam.is_org_member                      newly on the path via uichamp_s6_a_client_hears_the_store_is_off_in_her_own_words.sql (791b3c8ddf)
-- Measured per-call times (before -> after) are in PROGRESS-SUITE-HEALTH.md § SUITE-HEALTH-3.

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION custom.entity_reference_kinds()
 RETURNS TABLE(token text, label text, category text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- SUITE-HEALTH-3: the identical body, moved from LANGUAGE sql into plpgsql so its plan is
  -- cached for the session instead of re-planned on every call (writeperf2_green clause 9).
  -- The kinds of platform thing an entity-reference Field may name: exactly the registered
  -- `record → <token>` association types, so the list a person picks from, the list the Field
  -- guard accepts and the list the edge trigger accepts are ONE list.
  return query
  select e.token, e.label, coalesce(nullif(e.reference_category, ''), e.schema_name)
    from platform.association_types r
    join platform.entity_types e on e.token = r.target_type
   where r.source_type = 'record'
     and r.target_type <> 'record'
     and r.is_active
     and e.is_active
   order by e.label;
end
$function$;

CREATE OR REPLACE FUNCTION custom.field_inputs_of(p_organization_id uuid, p_field_data jsonb)
 RETURNS TABLE(input_id uuid, input_key text, input_label text, input_table uuid, sensitivity text, retired boolean, how text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- SUITE-HEALTH-3: the identical body, moved from LANGUAGE sql into plpgsql so its plan is
  -- cached for the session instead of re-planned on every call (writeperf2_green clause 9).
  -- Only a worked-out column reads other columns: a formula (config.expr), a lookup
  -- (config.pick) or a rollup (config.agg). A formula the Rule layer fills in (no expr) reads
  -- what its Rule reads, and the Rule's own door answers for that.
  return query
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
end
$function$;

CREATE OR REPLACE FUNCTION custom.field_input_closure(p_organization_id uuid, p_field_data jsonb, p_self uuid DEFAULT NULL::uuid)
 RETURNS TABLE(input_id uuid, input_key text, input_label text, input_table uuid, sensitivity text, retired boolean, depth integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  -- SUITE-HEALTH-3: the identical body, moved from LANGUAGE sql into plpgsql so its plan is
  -- cached for the session instead of re-planned on every call (writeperf2_green clause 9).
  -- Inputs of inputs: a formula over a formula over Budget reads Budget. Twelve levels, and a
  -- column never counts as its own input, so a cycle ends instead of spinning.
  return query
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
end
$function$;

-- provision_shape_guard requires every SECURITY DEFINER body outside its exempt schemas that is
-- replaced to say in data who may call it; iam.is_org_member never had a row. Declared, not
-- changed: service_role alone holds EXECUTE, exactly as before.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, declared_by, reason,
   anonymous_callers, signed_in_callers, non_client_lane)
values
  ('iam', 'is_org_member', 'p_user uuid, p_org uuid', '{2950,2950}',
   'migrations/campaign/suitehealth3_the_write_path_helpers_plan_once.sql (lane SUITE-HEALTH-3)',
   'Declared, not changed, by lane SUITE-HEALTH-3: provision_shape_guard requires every SECURITY DEFINER body that is replaced to say in data who may call it. This body moved from LANGUAGE sql to plpgsql around the identical statement (the deprecated wrapper over iam.has_org_access_for); its grants are unchanged.',
   false, false,
   'server_only: service_role alone holds EXECUTE; anon and authenticated hold none. It is called from inside definer bodies that decide access before they call it — custom.assert_store_door on every write to custom.record, and communication, crm and files helpers.');

CREATE OR REPLACE FUNCTION iam.is_org_member(p_user uuid, p_org uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- SUITE-HEALTH-3: the identical body, moved from LANGUAGE sql into plpgsql so its plan is
  -- cached for the session instead of re-planned on every call (writeperf2_green clause 9).
  -- DEPRECATED wrapper: use iam.has_org_access_for.
  return (
  SELECT iam.has_org_access_for(p_user, p_org)
  );
end
$function$;
