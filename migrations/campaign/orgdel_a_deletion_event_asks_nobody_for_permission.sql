-- chair-step: it REPLACES a live trigger function, custom.io_record_changed, which every write
--   to custom.record goes through. Nothing is dropped or renamed, the payload it writes is
--   byte-for-byte the same in every case that produced one, and the only change is that it stops
--   asking a READER's access question on an event where the answer was already fixed at `[]`.
--   The inverse is migrations/inverse/orgdel_a_deletion_event_asks_nobody_for_permission_down.sql.
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_record_changed() 95f3e73d9f8206a436631436cf78dea90524e69ef767a8a21ed73ce449f4f0c4
--
-- ORG-DELETE — A DELETION EVENT ASKS NOBODY FOR PERMISSION.
--
-- FOUND FROM THE SEAT by `scripts/campaign-tests/orgdel_green.sql` PART 2c, one layer under the
-- root cause this lane already fixed. With the retention purge finally able to destroy a row
-- past its window, it died on the NEXT thing:
--
--   You do not have access to this table, so custom.applicable_fields has nothing to show you.
--
-- `custom.io_record_changed` writes the outbox event for every write, and it asked
-- `custom.io_changed_field_ids` which Fields moved. That goes through `custom.applicable_fields`,
-- which is a reader and calls `custom.assert_may_know_table` first (VIS-5 / T10). So recording
-- that a record is GONE depended on the caller still being allowed to READ the Table it was in —
-- and in the one case that matters, the retention purge clearing out an organization, the Table
-- has already been retired and nobody knows it any more. The store could not let go of a record
-- whose Table had gone first, which is every record the purge is ever asked to destroy.
--
-- On a delete the trigger sets `v_keys` to the empty array three branches earlier, and
-- `io_changed_field_ids` aggregates over `unnest(v_keys)` — so the answer was already `[]`
-- before the access check ran. The check could only ever change a success into a failure.
--
-- WHAT MAKES IT FAIL (rule 3): ask again unconditionally, which is what
-- migrations/inverse/orgdel_a_deletion_event_asks_nobody_for_permission_down.sql does — and
-- `scripts/campaign-tests/orgdel_green.sql` PART 2c and PART 6a both go red on
-- `custom.assert_may_know_table`.

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

  -- WHICH FIELDS MOVED — ASKED ONLY WHEN SOMETHING MOVED. `custom.io_changed_field_ids` goes
  -- through `custom.applicable_fields`, which is a READER and asks `custom.assert_may_know_table`
  -- before it answers. On a delete `v_keys` is empty by construction three branches above, so
  -- the answer is `[]` whatever the join would have done — and asking anyway made a deletion
  -- event depend on the caller still being allowed to READ the Table. When the retention purge
  -- destroys a record whose Table has already been retired, nobody knows that Table any more,
  -- so the read refused and the purge died on it:
  --   You do not have access to this table, so custom.applicable_fields has nothing to show you.
  -- An event recording that a row is gone is not showing anybody anything, and it does not get
  -- to fail because of what the caller may read. Same payload, one less question.
  v_changed := case when coalesce(array_length(v_keys, 1), 0) = 0
                    then '[]'::jsonb
                    else custom.io_changed_field_ids(v_org, v_table,
                           case when tg_op = 'UPDATE' then old.data else '{}'::jsonb end,
                           coalesce(new.data, '{}'::jsonb)) end;

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
