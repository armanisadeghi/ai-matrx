-- chair-step: the inverse of V1-STORE-FIXES finding 3 - it puts three live function bodies
-- back to the ones that did not count their rows, which is a live-body replacement and
-- therefore never an unattended step. Header-less on purpose (§4.9): a file naming production
-- in a `-- target:` header PLUS `-- chair-step:` is refused by both runners as
-- `chair-step-names-production`, and these same bytes rehearse on the branch with
-- `--target branch`.
--
-- The three bodies restored here are byte-for-byte the ones
-- `migrations/campaign/w1_v1store_success_counts_its_rows.sql` declares in its `-- based-on:`
-- lines (21dd0939…, 0fabd5eb…, 88015aca…), so the loop up -> inverse -> up returns the
-- catalogue to exactly where it started and a verifier can check that by hashing it. The
-- `-- based-on:` lines below declare the bodies this file OVERWRITES - the row-counting ones -
-- so the runner refuses to replay it over anybody else's later change (DD-220).
--
-- based-on: custom.promote_table(uuid,uuid) 0e373442c505224690ea278446475bb827f41986c558473db2cd9a691bf34839
-- based-on: custom._field_definition_write() d3f8ab2668e9f6a5272a00ff786fab40f8ac4f973960ce1906c6ea771d5b9609
-- based-on: custom._rule_definition_write() 96983a7c21ba29a1afab4dd201ce9d2c1c6d027006da5f3176462d45c7edd69c

CREATE OR REPLACE FUNCTION custom.promote_table(p_organization_id uuid, p_table_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_before bigint;
  v_after  bigint;
  v_was    text;
  f        record;
  v_built  jsonb := '[]'::jsonb;
begin
  v_was := custom.table_storage(p_organization_id, p_table_id);
  select count(*) into v_before from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  for f in select * from custom.promoted_fields(p_organization_id, p_table_id) where indexable loop
    v_built := v_built || jsonb_build_array(custom.promote_field(p_organization_id, p_table_id, f.field_id));
  end loop;

  update custom.record
     set data = data || jsonb_build_object('storage', 'heavy')
   where organization_id = p_organization_id and id = p_table_id
     and table_id = custom.table_kernel_id();

  select count(*) into v_after from custom.record r
   where r.organization_id = p_organization_id and r.table_id = p_table_id;

  return jsonb_build_object('was', v_was, 'now', custom.table_storage(p_organization_id, p_table_id),
                            'records_before', v_before, 'records_after', v_after,
                            'rows_moved', v_after - v_before, 'indexes', v_built);
end $function$;

CREATE OR REPLACE FUNCTION custom._field_definition_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data jsonb;
  v_id   uuid;
begin
  -- THE DOOR. This trigger is INSTEAD OF INSERT OR UPDATE OR DELETE, so the row it
  -- judges is `old` on a delete and `new` otherwise; `new` is unassigned on DELETE
  -- and reading it would raise instead of refusing.
  if tg_op = 'DELETE' then
    perform custom.assert_store_door(old.organization_id, 'custom.field');
  else
    perform custom.assert_store_door(new.organization_id, 'custom.field');
  end if;

  if tg_op = 'DELETE' then
    update custom.record
       set deleted_at = now()
     where organization_id = old.organization_id and id = old.id
       and table_id = custom.field_kernel_id();
    return old;
  end if;

  -- The view''s columns are assembled back into the ONE stored document, so a write through
  -- the projection and a write into the store produce the same row and the SAME guard fires.
  v_data := coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'entity_definition_id', new.entity_definition_id,
    'table_token',          new.table_token,
    'key',                  new.key,
    'label',                new.label,
    'type',                 new.type,
    'relation_target',      new.relation_target,
    'relation_max',         new.relation_max,
    'on_target_delete',     new.on_target_delete,
    'inverse_key',          new.inverse_key,
    'source',               new.source,
    'compute_on',           new.compute_on,
    'unit',                 new.unit,
    'format',               new.format,
    'sensitivity',          new.sensitivity,
    'context_policy',       new.context_policy,
    'review_interval_days', new.review_interval_days))
    || jsonb_build_object(
    'config',           coalesce(new.config, '{}'::jsonb),
    'source_config',    coalesce(new.source_config, '{}'::jsonb),
    'rules',            coalesce(new.rules, '[]'::jsonb),
    'depends_on',       coalesce(new.depends_on, '[]'::jsonb),
    'applies_to_types', coalesce(new.applies_to_types, '[]'::jsonb),
    'required',         coalesce(new.required, false),
    'multi',            coalesce(new.multi, false),
    'dated',            coalesce(new.dated, false),
    'sort',             coalesce(new.sort, 0));
  if new."default" is not null then
    v_data := jsonb_set(v_data, '{default}', new."default");
  end if;

  if tg_op = 'INSERT' then
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (coalesce(new.id, gen_random_uuid()), new.organization_id,
            custom.field_kernel_id(), 'field', v_data)
    returning id into v_id;
    new.id := v_id;
    return new;
  end if;

  update custom.record
     set data = v_data, updated_at = now(), version = version + 1
   where organization_id = new.organization_id and id = new.id
     and table_id = custom.field_kernel_id();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._rule_definition_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_data jsonb;
  v_id   uuid;
begin
  -- THE DOOR. This trigger is INSTEAD OF INSERT OR UPDATE OR DELETE, so the row it
  -- judges is `old` on a delete and `new` otherwise; `new` is unassigned on DELETE
  -- and reading it would raise instead of refusing.
  if tg_op = 'DELETE' then
    perform custom.assert_store_door(old.organization_id, 'custom.rule');
  else
    perform custom.assert_store_door(new.organization_id, 'custom.rule');
  end if;

  if tg_op = 'DELETE' then
    update custom.record
       set deleted_at = now()
     where organization_id = old.organization_id and id = old.id
       and table_id = custom.rule_kernel_id();
    return old;
  end if;

  -- The view's columns are assembled back into the ONE stored document, so a write through
  -- the projection and a write into the store produce the same row and the SAME guard fires.
  v_data := coalesce(new.data, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
    'name',            new.name,
    'kind',            new.kind,
    'scope_table_id',  new.scope_table_id,
    'target_field_id', new.target_field_id,
    'message',         new.message))
    || jsonb_build_object(
    'uses',             coalesce(new.uses, '[]'::jsonb),
    'applies_to_types', coalesce(new.applies_to_types, '[]'::jsonb),
    'use_types',        coalesce(new.use_types, '{}'::jsonb),
    'sort',             coalesce(new.sort, 0));
  if new.expr is not null then
    v_data := jsonb_set(v_data, '{expr}', new.expr);
  end if;

  if tg_op = 'INSERT' then
    insert into custom.record (id, organization_id, table_id, data_class, data)
    values (coalesce(new.id, gen_random_uuid()), new.organization_id,
            custom.rule_kernel_id(), 'rule', v_data)
    returning id into v_id;
    new.id := v_id;
    return new;
  end if;

  -- REC-19: the version is NOT touched here. platform._touch_row - the platform's own
  -- standard trigger, already on custom.record - increments it on every UPDATE, whichever
  -- way the write arrives. A second `version = version + 1` in this body would make a write
  -- through the projection count as two changes, which is exactly how a version number stops
  -- meaning anything.
  update custom.record
     set data = v_data
   where organization_id = new.organization_id and id = new.id
     and table_id = custom.rule_kernel_id();
  return new;
end;
$function$;
