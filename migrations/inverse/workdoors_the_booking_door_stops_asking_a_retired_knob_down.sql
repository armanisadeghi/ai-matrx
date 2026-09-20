-- target: branch
--
-- THE INVERSE of `migrations/campaign/workdoors_the_booking_door_stops_asking_a_retired_knob.sql`:
-- the body as it stood at 05:36Z on 2026-09-20, still reading the retired
-- `custom/field_index_guard`. Running it is what makes the green suite's PART 7 fail again
-- with "slots cannot be declared here yet" — which is every booking table in the platform.

CREATE OR REPLACE FUNCTION custom.work_slots_declare(p_organization_id uuid, p_name text, p_slug text, p_home_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  v_table uuid;
  v_field uuid;
  v_home  uuid := coalesce(p_home_id, custom.table_kernel_id());
  v_promo jsonb;
  v_t0    timestamptz := clock_timestamp();
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_slots_declare');
  -- Declaring a Table is the same act `custom.table_declare` performs, at the same rung.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_slots_declare');
  if p_home_id is not null then
    perform custom.assert_client_may_change(p_organization_id, p_home_id,
                                            'custom.work_slots_declare',
                                            'editor'::public.permission_level, 'record');
  end if;

  begin
    v_on := coalesce((platform.knob_resolve('custom', 'field_index_guard', p_organization_id) #>> '{}')::boolean, false);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    raise exception 'slots cannot be declared here yet: the database cannot be asked to decide a double-booking'
      using errcode = '0A000',
            hint = 'REC-71 / REC-N-12: a slot is kept single by a UNIQUE index on its key, and custom/field_index_guard resolves false for this organization, so no index can be built. Nothing was created. Turn the guard on (the switch checklist does it) and declare the slots again.';
  end if;

  if p_slug is null or p_slug !~ '^[a-z][a-z0-9_]*$' then
    raise exception 'a slot table needs a slug made of lower-case letters, digits and underscores, and this one says %',
                    coalesce(p_slug, 'nothing')
      using errcode = '23514', hint = 'REC-66: slug.';
  end if;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.table_kernel_id(), 'table', jsonb_build_object(
    'name',           coalesce(nullif(btrim(p_name), ''), 'Slots'),
    'slug',           p_slug,
    'type',           'entity',
    'label_singular', 'Hold',
    'label_plural',   'Holds',
    'title_field',    'slot_key',
    'display',        'page',
    'weight',         'light',
    'ordered',        false,
    'row_order',      'sorted',
    'default_sort',   jsonb_build_array(jsonb_build_object('field', 'expires_at', 'direction', 'asc')),
    'agent_writable', false,
    'retention_days', 365,
    'work_kind',      'slot',
    'fields', jsonb_build_array(jsonb_build_object('name', 'slot_key'),
                                jsonb_build_object('name', 'holder'),
                                jsonb_build_object('name', 'expires_at')),
    'parent_id',      v_home::text))
  returning id into v_table;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'slot_key', 'label', 'Slot', 'sort', 10, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', true, 'unique', true, 'entity_definition_id', v_table::text))
  returning id into v_field;

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'holder', 'label', 'Held by', 'sort', 20, 'type', 'text',
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'config', '{}'::jsonb, 'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, custom.field_kernel_id(), 'field', jsonb_build_object(
    'key', 'expires_at', 'label', 'Held until', 'sort', 30, 'type', 'range',
    'parity_type', 'datetime', 'config', jsonb_build_object('kind', 'datetime'),
    'multi', false, 'dated', false, 'required', true, 'source', 'manual',
    'rules', '[]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'entity_definition_id', v_table::text));

  v_promo := custom.promote_field(p_organization_id, v_table, v_field);

  return jsonb_build_object(
    'table_id',      v_table,
    'slot_field_id', v_field,
    'index_name',    v_promo ->> 'index_name',
    'unique',        (v_promo ->> 'unique')::boolean,
    'fields_created', 3,
    'records_created', 0,
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$;
