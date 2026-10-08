-- chair-step: puts custom._realtime_notice, custom.field_inputs_of and custom.field_input_closure back to the bodies they held before installspeed_a_realtime_readback_and_non_formula_fields.sql (read from the catalogue with pg_get_functiondef).

CREATE OR REPLACE FUNCTION custom._realtime_notice(p_organization_id uuid, p_table_id uuid, p_kind text, p_op text, p_record_ids jsonb, p_fields_changed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_id    uuid := gen_random_uuid();
  v_topic text := 'custom:table:' || p_table_id::text;
  v_op    uuid := nullif(current_setting('custom.op_id', true), '')::uuid;
  v_land  boolean;
begin
  perform realtime.send(
    jsonb_build_object(
      'id',             v_id,
      'table_id',       p_table_id,
      'kind',           p_kind,
      'op',             p_op,
      'op_id',          v_op,              -- null unless the writer sent `_op_id`
      'record_ids',     p_record_ids,      -- null MEANS "re-read the page"
      'fields_changed', p_fields_changed,
      'at',             to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'records.changed',
    v_topic,
    true);

  -- THE READ-BACK. `realtime.send` returns void whether it worked or not, and it swallows
  -- every failure into a `raise warning` — so a store could go quietly un-live for a day and
  -- every screen would look healthy. `realtime.messages` is RANGE-partitioned on inserted_at
  -- and `realtime.send` mints its OWN row id, so the notice is found by topic, today's
  -- partition and the payload's own id.
  select exists (
    select 1 from realtime.messages m
     where m.topic = v_topic
       and m.inserted_at >= date_trunc('day', now())
       and m.payload ->> 'id' = v_id::text
  ) into v_land;
  if not v_land then
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'realtime_notice_not_delivered',
      'error_type', 'realtime.send',
      'error_text', 'The record store announced a change and the message did not land in realtime.messages, so screens watching this table will not update until they are reloaded.',
      'source_feature', 'custom.realtime',
      'route', v_topic,
      'organization_id', p_organization_id,
      'payload', jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op,
                               'message_id', v_id)));
  end if;
exception when others then
  -- A person's write must never fail because the announcement of it did.
  begin
    perform ops.record_system_error(jsonb_build_object(
      'kind', 'realtime_notice_failed',
      'error_type', sqlstate,
      'error_text', sqlerrm,
      'source_feature', 'custom.realtime',
      'route', v_topic,
      'organization_id', p_organization_id,
      'payload', jsonb_build_object('topic', v_topic, 'kind', p_kind, 'op', p_op)));
  exception when others then
    raise warning 'custom._realtime_notice could not record its own failure on %: %', v_topic, sqlerrm;
  end;
end;
$function$
;

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
$function$
;

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
$function$
;
