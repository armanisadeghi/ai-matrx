-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.work_slots_declare(uuid, text, text, uuid) b8dc0cefb0e346c485fa19769a1a22612492cb7b0107fd9f583df44619f4f92a
--
-- WORK-DOORS — THE BOOKING DOOR STOPS ASKING A RETIRED KNOB.
--
-- FOUND BY THIS LANE'S OWN GREEN SUITE, from the seat, on the main database:
--
--     slots cannot be declared here yet: the database cannot be asked to decide a
--     double-booking
--
-- with a hint telling the person to turn on `custom/field_index_guard`. That knob is RETIRED.
-- Its own row in `platform.feature_knob` says, in these words: "Nothing reads this knob.
-- Promoting a field, generating its index DDL, the cap on promoted fields per table and
-- DECLARING WORK SLOTS all follow the organization's own custom/system_enabled, read through
-- custom.store_is_open (DOOR-FIX, 2026-09-19, defect B1). The row is kept because deleting a
-- knob row is not additive; it decides nothing."
--
-- MEASURED HERE before the fix: exactly TWO functions in schema `custom` mentioned the knob,
-- and only ONE of them actually read it —
--
--     select p.proname,
--            regexp_replace(pg_get_functiondef(p.oid), '--[^' || chr(10) || ']*', '', 'g')
--              ~ 'field_index_guard' as live_read
--       from pg_proc p where p.pronamespace = 'custom'::regnamespace
--        and p.prosrc like '%field_index_guard%';
--     _promoted_field_cap_guard | f     <- a comment, left by the lane that repointed it
--     work_slots_declare        | t     <- this one
--
-- So this file closes the class rather than one instance: `custom.work_slots_declare` was the
-- LAST live reader of a knob that resolves false for every organization, which means REC-71
-- refused every booking table anybody could ever have declared, and told them to turn on a
-- switch that decides nothing. Product #14 could not be started.
--
-- The switch that governs it is `custom.assert_store_door`, already the door's first
-- statement, and the index itself is still built by `custom.promote_field` — which refuses in
-- its own words if it cannot. Nothing is loosened: an organization with the store switched
-- off still gets the store's own refusal, one line earlier.
--
-- THE INVERSE: `migrations/inverse/workdoors_the_booking_door_stops_asking_a_retired_knob_down.sql`.

set lock_timeout = '5s';
set statement_timeout = '600s';

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
