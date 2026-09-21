-- STORE-T file 1, the inverse: the doors closed again exactly as they were — the seven grants
-- revoked, the register rows this lane added removed, the three new doors dropped, and the
-- three replaced bodies put back byte-for-byte.
--
-- 🚨 `custom.my_level(uuid, uuid, text)` STAYS STANDING (lane INVERSE-GUARD, 2026-09-21). This file used to drop it
-- with the other two doors. `custom.bookings` in
-- `booking_a_booking_is_a_record_with_a_held_slot.sql` — a lane outside STORE-T — has since
-- adopted it and calls it on the live path, and it is an access-kernel root besides, so
-- dropping it would not restore STORE-T's defect, it would break the booking door. Its CLIENT
-- DOOR is what STORE-T opened, and the client door is what this file takes back: the register
-- row goes with the other two below, so a signed-in person can no longer reach it — which is
-- the state the red twin measures. The body stays for the callers inside the database.

revoke execute on function custom.value_read(uuid, uuid, text)       from authenticated;
revoke execute on function custom.field_dependants(uuid, uuid)       from authenticated;
revoke execute on function custom.table_type_field(uuid, uuid)       from authenticated;
revoke execute on function custom.parity_field_types()               from authenticated;

drop function if exists custom.record_as_of(uuid, uuid, timestamp with time zone);
drop function if exists custom.delete_preview(uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'migrations/campaign/storet_the_doors_a_person_can_reach.sql (lane STORE-T)';

CREATE OR REPLACE FUNCTION custom.value_read(p_organization_id uuid, p_record_id uuid, p_key text)
 RETURNS TABLE(field_key text, field_id uuid, value jsonb, value_version integer, source jsonb, absent_reason text, actor text, on_behalf_of text, written_at timestamp with time zone, alternates jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select * from custom.record_values_versioned(p_organization_id, p_record_id) v
   where v.field_key = p_key;
$function$;

CREATE OR REPLACE FUNCTION custom.field_dependants(p_organization_id uuid, p_field_id uuid)
 RETURNS TABLE(kind text, dependant_id uuid, label text, how text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key   text;
  v_table uuid;
begin
  select f.data ->> 'key', nullif(f.data ->> 'entity_definition_id', '')::uuid
    into v_key, v_table
    from custom.record f
   where f.organization_id = p_organization_id
     and f.id = p_field_id
     and f.table_id = custom.field_kernel_id()
     and f.data_class <> 'kernel';
  if v_key is null then
    return;                        -- not a Field of this organization: nothing depends on it
  end if;

  return query
  -- (1) BY ID. A Rule's `expr` names a Field as {"field": "<uuid>"}; a formula or derived
  --     Field's `config` names it the same way.
  select case when r.table_id = custom.rule_kernel_id() then 'rule'
              when r.table_id = custom.merge_field_kernel_id() then 'merge field'
              else 'field' end,
         r.id,
         coalesce(nullif(r.data ->> 'name', ''), nullif(r.data ->> 'label', ''),
                  nullif(r.data ->> 'key', ''), r.id::text),
         'names it by id'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.id <> p_field_id
     and r.data_class <> 'kernel'
     and r.table_id in (custom.rule_kernel_id(), custom.field_kernel_id(),
                        custom.merge_field_kernel_id())
     and (coalesce((r.data -> 'expr')::text, '')   like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'config')::text, '') like '%' || p_field_id::text || '%'
       or coalesce((r.data -> 'rules')::text, '')  like '%' || p_field_id::text || '%'
       or coalesce(r.data ->> 'target_field_id', '') = p_field_id::text)
     and not custom.owning_table_gone(p_organization_id, r.id)
  union
  -- (2) BY KEY, within the same Table. `depends_on` is a list of Field KEYS.
  select 'field', r.id,
         coalesce(nullif(r.data ->> 'label', ''), r.data ->> 'key', r.id::text),
         'reads it by name in depends_on'
    from custom.record r
   where r.organization_id = p_organization_id
     and r.deleted_at is null
     and r.table_id = custom.field_kernel_id()
     and r.data_class <> 'kernel'
     and r.id <> p_field_id
     and nullif(r.data ->> 'entity_definition_id', '')::uuid is not distinct from v_table
     and exists (select 1 from jsonb_array_elements_text(coalesce(r.data -> 'depends_on', '[]'::jsonb)) d
                  where d = v_key)
     and not custom.owning_table_gone(p_organization_id, r.id);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.table_type_field(p_organization_id uuid, p_table_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select t.data ->> 'type_field'
    from custom.record t
   where t.organization_id = p_organization_id
     and t.id = p_table_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null;
$function$;

CREATE OR REPLACE FUNCTION custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
  v_conv    integer;
  v_ret     integer;
begin
  -- THE CALLER AND THE ROW, on the one ladder, exactly as the other verbs ask it — this verb
  -- is executable by `authenticated` and a door that decides nothing is not a door. Then the
  -- switch: custom.assert_store_door resolves custom/system_enabled.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.migrate_retype');
  perform custom.assert_client_may_change(p_organization_id, p_id, 'custom.migrate_retype', 'editor'::public.permission_level, 'record');
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The values already written are CONVERTED where they convert and kept in
  --    `_retired` with their reason where they do not — by the trigger on the Field row, so
  --    this verb and an ordinary write behave identically.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that fit are converted and values that do not are kept in _retired with the reason, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    select count(*) filter (where true) into v_ret
      from custom.record x, lateral jsonb_array_elements(coalesce(x.data -> '_retired', '[]'::jsonb)) e
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and e ->> 'key' = (v_row.data ->> 'key');
    select count(*) into v_conv
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and x.data ? (v_row.data ->> 'key');
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'records_still_holding_a_value', v_conv,
                              'values_in_retired_for_this_field', v_ret,
                              'values', 'converted where they convert; kept in _retired with the reason where they do not (FLD-4 / T12)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$function$;
