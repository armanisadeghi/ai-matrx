-- INVERSE of migrations/campaign/orgdel_a_deletion_event_asks_nobody_for_permission.sql
-- (lane ORG-DELETE). It puts the unconditional call back, so the retention purge dies on
-- custom.assert_may_know_table for every record whose Table was retired first.
create or replace function custom.io_record_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_org       uuid := coalesce(new.organization_id, old.organization_id);
  v_id        uuid := coalesce(new.id, old.id);
  v_table     uuid := coalesce(new.table_id, old.table_id);
  v_version   integer := coalesce(new.version, old.version, 0);
  v_operation text;
  v_keys      text[];
  v_changed   jsonb;
begin
  -- THE ONE DOOR PREDICATE, and it IS the guard this file is headed with:
  -- `custom.assert_store_door` resolves `custom/system_enabled` through
  -- `custom.store_is_open`, so while that knob is false this trigger — like every other door
  -- in the store — takes writes only from the role that owns `custom.record`.
  perform custom.assert_store_door(v_org, 'custom.io_record_changed');

  if tg_op = 'INSERT' then
    v_operation := 'created';
    v_keys      := custom.io_changed_keys('{}'::jsonb, new.data);
  elsif tg_op = 'DELETE' then
    v_operation := 'deleted';
    v_keys      := array[]::text[];
  elsif new.deleted_at is not null and old.deleted_at is null then
    -- A soft delete is a DELETE to everyone downstream. An automation that fired "updated"
    -- when a record disappeared would be lying in the one case people notice.
    v_operation := 'deleted';
    v_keys      := array[]::text[];
  elsif old.deleted_at is not null and new.deleted_at is null then
    v_operation := 'created';
    v_keys      := custom.io_changed_keys('{}'::jsonb, new.data);
  else
    v_operation := 'updated';
    v_keys      := custom.io_changed_keys(old.data, new.data);
    -- NO VALUE MOVED, so there is no event. Asked of the KEYS, never of the resolved Field
    -- ids: a Table whose fields are declared on the Table rather than as Field records
    -- resolves zero ids on every write, and used to raise nothing at all.
    if coalesce(array_length(v_keys, 1), 0) = 0
       and old.deleted_at is not distinct from new.deleted_at then
      return null;
    end if;
  end if;

  v_changed := custom.io_changed_field_ids(v_org, v_table,
                                           case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end,
                                           coalesce(new.data, '{}'::jsonb));

  insert into custom.io_outbox (organization_id, event_key, record_id, table_id, operation,
                                changed_field_ids, actor, dedupe_key)
  values (v_org, 'records.changed', v_id, v_table, v_operation, v_changed,
          jsonb_build_object(
            'user_id',   custom.query_principal(),
            'role',      custom.caller_role()::text,
            'tier',      coalesce(platform.declared_actor_tier(), platform.actor_tier()),
            'declared',  coalesce(new.data, old.data) ->> '_actor'),
          v_org::text || ':' || v_id::text || ':' || v_version::text || ':' || v_operation)
  on conflict do nothing;

  return null;
end;
$function$;
