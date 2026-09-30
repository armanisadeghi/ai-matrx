-- chair-step: lane FOLLOW-BATCH-3 (2026-09-29), matrx-frontend D357. SAVING A BOOKING PAGE NEVER PAUSES THE STORE. custom.booking_declare -> custom.work_slots_declare -> custom.promote_field built a partial UNIQUE index on custom.record (organization_id, (data->>'slot_key')) WHERE table_id = <the slots Table> for every new booking page: CREATE INDEX on the partitioned custom.record takes a ShareLock on all 16 partitions for the whole build, so every insert and update in the store waited while one person saved a page (255 such indexes exist on production). The index was the double-booking guard, and the store already has a race-safe one: custom._unique_rule_holds (advisory lock on organization|table|key|value, then EXISTS, then 23505), the same rule every unique Field uses, and custom.booking_hold already catches unique_violation and says its sentence. So the slots Table's slot_key Field carries rules [{"kind":"unique"}] and promoted false, and no index is built. Existing slots Tables keep their index (dropping 255 indexes would take the same locks) and are unchanged. No row is changed by this file.
-- lane: FOLLOW-BATCH-3
-- lock: custom
-- based-on: custom.work_slots_declare(uuid, text, text, uuid) eae6537c31665770cf79e4cc5ad378951ae2c07998e47e86c059b96cffad3d8d
--
-- Inverse: migrations/inverse/followbatch3_saving_a_booking_page_never_pauses_the_store_down.sql.
--
-- THE USE CASE. Rincon Plumbing's office manager publishes "Book a water-heater inspection" while fifty
-- technicians are closing jobs on their phones. None of their saves waits for her page.

set local statement_timeout = '60s';

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

  -- THE SWITCH IS THE ORGANIZATION'S OWN STORE SWITCH, and `custom.assert_store_door` above
  -- has already asked it. `custom/field_index_guard` is RETIRED — its own knob row says so:
  -- "Nothing reads this knob. Promoting a field, generating its index DDL, the cap on
  -- promoted fields per table and declaring work slots all follow the organization's own
  -- custom/system_enabled, read through custom.store_is_open (DOOR-FIX, 2026-09-19, defect
  -- B1)." This door was the LAST live reader of it, and because the knob resolves false for
  -- every organization on earth it refused EVERY booking table anybody tried to declare, with
  -- a sentence telling them to turn on a switch that decides nothing.

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
    -- ONE HOLD PER SLOT IS THE STORE'S OWN UNIQUE RULE (lane FOLLOW-BATCH-3, D357), not an index built
    -- for this Table: custom._unique_rule_holds takes an advisory lock on (organization, table, key,
    -- value) and refuses a second live hold with 23505, which custom.booking_hold already turns into its
    -- sentence. Building a partial unique index on custom.record here took a ShareLock on every
    -- partition and paused every write in the store while a person saved a booking page.
    'config', '{}'::jsonb, 'rules', '[{"kind": "unique"}]'::jsonb, 'depends_on', '[]'::jsonb,
    'source_config', '{}'::jsonb, 'sensitivity', 'internal',
    'context_policy', 'include', 'applies_to_types', '[]'::jsonb,
    'promoted', false, 'unique', true, 'entity_definition_id', v_table::text))
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

  -- No index is built (see the slot_key Field above): a door a person presses never takes a lock that
  -- stops other people's writes.

  return jsonb_build_object(
    'table_id',      v_table,
    'slot_field_id', v_field,
    'index_name',    null,
    'unique',        true,
    'unique_by',     'the store''s unique rule (advisory lock + check), no per-table index',
    'fields_created', 3,
    'records_created', 0,
    'ms', round(extract(epoch from (clock_timestamp() - v_t0)) * 1000, 1));
end
$function$;
